extends Control

const RIG_HEIGHT := 320.0
const TILE_WIDTH := 160.0
const MOUTH_Y := -132.0
const GRIP_X := 61.0

@onready var actor = $Richi
@onready var _basket: Sprite2D = $Richi/HeldBasket
var target_fraction := 0.5
var _bounce := 0.0
var _reaction: Tween
var _last_move_frame := -2


func _ready() -> void:
    resized.connect(_place_on_bank)
    visibility_changed.connect(_sync_activity)
    _place_on_bank()
    _sync_activity()


func _sync_activity() -> void:
    var shown := is_visible_in_tree()
    set_process(shown)
    actor.process_mode = Node.PROCESS_MODE_INHERIT if shown else Node.PROCESS_MODE_DISABLED
    if _reaction and _reaction.is_valid():
        if shown:
            _reaction.play()
        else:
            _reaction.pause()


func _place_on_bank() -> void:
    if size.x < 1.0 or size.y < 1.0:
        return
    var height := minf(size.x * 0.78, size.y * 0.54)
    actor.scale = Vector2.ONE * height / RIG_HEIGHT
    var ground := Vector2(target_fraction * size.x, size.y * 0.94)
    actor.reset_at(get_global_transform() * ground)
    _pose_basket(_bounce)


func set_catcher(fraction: float, harvest: int) -> void:
    target_fraction = clampf(fraction, 0.0, 1.0)
    _basket.frame = clampi(harvest, 0, 3)
    if size.x < 1.0:
        return
    var x := target_fraction * size.x
    if not is_equal_approx(x, actor.position.x):
        _last_move_frame = Engine.get_process_frames()
        actor.follow_world_x((get_global_transform() * Vector2(x, actor.position.y)).x)
        set_process(is_visible_in_tree())


func follow_basket(fraction: float) -> void:
    set_catcher(fraction, _basket.frame)


func basket_width() -> float:
    return TILE_WIDTH * actor.scale.x


func edge_margin() -> float:
    # Reserve the widest visible tail. A saved drop as far out as 10% of the
    # board must still overlap the near edge of the opening on a tall phone.
    var half_mouth := basket_width() * 78.0 / 216.0
    return minf(114.0 * actor.scale.x, 0.10 * size.x + half_mouth + 12.0)


func mouth_center() -> Vector2:
    return actor.transform * Vector2(0.0, MOUTH_Y + _bounce)


func react(effect: String) -> void:
    if effect != "catch" and effect != "rattle":
        return
    if _reaction:
        _reaction.kill()
    _reaction = create_tween()
    var kick := 8.0 if effect == "catch" else -5.0
    _reaction.tween_method(_pose_basket, _bounce, kick, 0.07).set_trans(Tween.TRANS_SINE)
    _reaction.tween_method(_pose_basket, kick, -kick * 0.32, 0.11).set_trans(Tween.TRANS_SINE)
    _reaction.tween_method(_pose_basket, -kick * 0.32, 0.0, 0.15).set_trans(Tween.TRANS_SINE)


func _pose_basket(offset: float) -> void:
    _bounce = offset
    var mouth := Vector2(0.0, MOUTH_Y + offset)
    # The ellipse centre is at y=69 in each 216 px square orchard basket tile.
    _basket.position = mouth + Vector2.DOWN * (0.5 - 69.0 / 216.0) * TILE_WIDTH
    var right_wrist := Vector2(GRIP_X, -3.0)
    actor.hold_at(mouth + Vector2(-GRIP_X, right_wrist.y), mouth + right_wrist)


func _process(delta: float) -> void:
    if Engine.get_process_frames() - _last_move_frame <= 1:
        return
    if actor.settle(delta):
        set_process(false)
