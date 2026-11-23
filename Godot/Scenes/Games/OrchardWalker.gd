extends Control

@onready var actor = $Richi
var target_fraction := 0.5


func _ready() -> void:
    resized.connect(_place_on_bank)
    visibility_changed.connect(_sync_activity)
    _place_on_bank()
    _sync_activity()


func _sync_activity() -> void:
    var shown := is_visible_in_tree()
    set_process(shown)
    actor.process_mode = Node.PROCESS_MODE_INHERIT if shown else Node.PROCESS_MODE_DISABLED


func _place_on_bank() -> void:
    if size.x < 1.0 or size.y < 1.0:
        return
    var height := minf(size.x * 0.33, size.y * 0.31)
    actor.scale = Vector2.ONE * height / 320.0
    var ground := Vector2(_target_x(), size.y * 0.855)
    actor.reset_at(get_global_transform() * ground)


func follow_basket(fraction: float) -> void:
    var next_fraction := clampf(fraction, 0.0, 1.0)
    if next_fraction != target_fraction:
        target_fraction = next_fraction
        set_process(is_visible_in_tree())


func _target_x() -> float:
    return size.x * lerpf(0.21, 0.79, target_fraction)


func _process(delta: float) -> void:
    var target_x := _target_x()
    var stride_speed: float = actor.step_length * actor.scale.x * 4.8
    var distance: float = absf(target_x - actor.position.x)
    var next_x := move_toward(actor.position.x, target_x, stride_speed * delta)
    if absf(next_x - actor.position.x) > 0.00001:
        actor.follow_world_x((get_global_transform() * Vector2(next_x, actor.position.y)).x)
    if distance <= stride_speed * delta:
        var rest_delta := maxf(0.0, delta - distance / maxf(stride_speed, 0.00001))
        if actor.settle(rest_delta):
            set_process(false)
