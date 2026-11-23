extends "res://Scenes/Games/GameRound.gd"

const REPLAY_ICON = preload("res://Scenes/Games/Art/game-replay.svg")
const LIVES := 3
@export_range(1.0, 8.0, 0.1) var field_widths_per_second := 3.8

var attempt := 0
var caught := 0
var errors := 0
var basket_position := 0.5
var target_position := 0.5
var spot := 0.5
var fall := 0.0
var kind := "apple"
var running := false
var finger := -1
var feedback_tween: Tween
var _life_full: ImageTexture
var _life_empty: ImageTexture


func _ready() -> void:
    _life_full = _life_texture(true)
    _life_empty = _life_texture(false)
    %Again.pressed.connect(_new_round)
    %Walker.resized.connect(_fit_catcher)
    visibility_changed.connect(_sync_activity)
    _sync_activity()


func _life_texture(full: bool) -> ImageTexture:
    # Exported Web templates cannot rely on an OS fallback font for heart glyphs.
    var image := Image.new()
    var fill := "#853024" if full else "none"
    var svg := '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><path fill="%s" stroke="#853024" stroke-width="3" stroke-linejoin="round" d="M24 41 7 25C-4 13 12-1 24 12 36-1 52 13 41 25Z"/></svg>' % fill
    image.load_svg_from_string(svg)
    return ImageTexture.create_from_image(image)


func _fit_catcher() -> void:
    basket_position = _playable_x(basket_position)
    target_position = _playable_x(target_position)
    %Walker.set_catcher(basket_position, caught)
    %Field.queue_redraw()


func _sync_activity() -> void:
    var shown := is_visible_in_tree()
    set_process(running and shown)
    if feedback_tween and feedback_tween.is_valid():
        if shown:
            feedback_tween.play()
        else:
            feedback_tween.pause()
    if not is_processing():
        finger = -1
        target_position = basket_position


func _notification(what: int) -> void:
    if what in [NOTIFICATION_APPLICATION_FOCUS_OUT, NOTIFICATION_APPLICATION_PAUSED, NOTIFICATION_PAUSED]:
        finger = -1
        target_position = basket_position


func restore(record: Dictionary) -> void:
    super.restore(record)
    if not _valid_round(record):
        _paint()
        return
    attempt = int(record.attempt)
    caught = int(record.caught)
    errors = int(record.get("errors", LIVES if record.finished else mini(LIVES - 1, attempt - caught)))
    basket_position = _playable_x(record.position)
    target_position = basket_position
    spot = float(record.spot)
    fall = float(record.fall)
    kind = record.get("kind", "apple")
    running = not record.finished
    %Backdrop.aim_at(basket_position)
    _sync_activity()
    _paint()


func _valid_round(record: Dictionary) -> bool:
    var old_attempt = record.get("attempt")
    var old_caught = record.get("caught")
    var old_errors = record.get("errors", 0)
    var old_finished = record.get("finished")
    if round_id < 1 or not old_finished is bool:
        return false
    if not _natural(old_attempt) or not _natural(old_caught) or old_caught > old_attempt:
        return false
    if record.has("errors") and (
        not _natural(old_errors) or old_errors > LIVES or old_finished != (old_errors == LIVES)
    ):
        return false
    if record.get("kind", "apple") not in ["apple", "cone"]:
        return false
    for component in ["position", "spot", "fall"]:
        var value = record.get(component)
        if not (value is int or value is float) or not is_finite(value) or value < 0 or value > 1:
            return false
    return true


func _natural(value: Variant) -> bool:
    return (value is int or value is float) and value >= 0 and value <= 9007199254740991 and value == int(value)


func _new_round() -> void:
    begin_round()
    attempt = 0
    caught = 0
    errors = 0
    finger = -1
    basket_position = 0.5
    target_position = basket_position
    %Backdrop.aim_at(basket_position)
    if feedback_tween:
        feedback_tween.kill()
    %Field.flash = 0.0
    running = true
    _drop()
    _save_round()
    _sync_activity()
    _paint()


func _drop() -> void:
    kind = "cone" if attempt > 0 and randf() < 0.27 else "apple"
    var edge := 0.1
    if %Walker.size.x > 0.0:
        var reach: float = %Walker.basket_width() * %Field.MOUTH_HALF / %Walker.size.x
        edge = maxf(edge, _playable_x(0.0) - reach * 0.85)
    spot = randf_range(edge, 1.0 - edge)
    fall = 0.01


func _process(delta: float) -> void:
    if %Walker.size.x <= 0.0 or %Walker.size.y <= 0.0:
        return
    var step := minf(0.06, delta)
    var duration := maxf(0.52, 1.1 - attempt * 0.027)
    var until_rim := (1.0 - fall) * duration
    if until_rim <= step:
        _advance_catcher(until_rim)
        fall = 1.0
        _land()
        if running:
            _advance_catcher(step - until_rim)
    else:
        _advance_catcher(step)
        fall += step / duration
    _draw_field()


func _land() -> void:
    attempt += 1
    var grabbed: bool = %Field.overlaps_mouth(spot, kind == "cone")
    if kind == "apple" and grabbed:
        caught += 1
        %Hint.text = "Яблоко поймано"
        _flash("catch")
    elif grabbed or kind == "apple":
        errors += 1
        var heart: TextureRect = %Lives.get_child(LIVES - errors)
        heart.pivot_offset = heart.size * 0.5
        heart.scale = Vector2.ONE * 1.28
        heart.create_tween().tween_property(heart, "scale", Vector2.ONE, 0.22)
        %Hint.text = _error_text()
        _flash("rattle" if grabbed else "ground")
    else:
        %Hint.text = "Шишка пролетела мимо"
        _flash("pass")
    running = errors < LIVES
    if running:
        _drop()
    else:
        fall = 1.0
        finger = -1
        set_process(false)
    _save_round()
    _paint()


func _error_text() -> String:
    return "Поймана шишка" if kind == "cone" else "Яблоко упало"


func _flash(effect: String) -> void:
    if feedback_tween:
        feedback_tween.kill()
    %Field.effect = effect
    %Field.landing_x = spot
    %Field.landing_height = %Walker.mouth_center().y
    %Walker.react(effect)
    %Field.flash = 1.0
    feedback_tween = create_tween()
    feedback_tween.tween_method(_fade_flash, 1.0, 0.0, 0.41)


func _fade_flash(value: float) -> void:
    %Field.flash = value
    %Field.queue_redraw()


func checkpoint() -> void:
    finger = -1
    target_position = basket_position
    if running:
        _save_round()


func _save_round() -> void:
    commit({
        "attempt": attempt, "caught": caught, "errors": errors, "position": basket_position,
        "spot": spot, "fall": fall, "kind": kind, "finished": not running,
        "won": not running and caught > 0,
    })


func _draw_field() -> void:
    %Walker.set_catcher(basket_position, caught)
    %Field.fruit_x = spot
    %Field.fall = fall
    %Field.cone = kind == "cone"
    %Field.fruit_visible = running
    %Field.queue_redraw()


func _paint() -> void:
    %Goal.text = "Яблоки %d" % caught
    var remaining := LIVES - errors
    %Lives.accessibility_name = "Жизни: %d из %d" % [remaining, LIVES]
    for index in LIVES:
        var heart: TextureRect = %Lives.get_child(index)
        var full := index < remaining
        heart.texture = _life_full if full else _life_empty
        heart.accessibility_name = "Жизнь сохранена" if full else "Жизнь потеряна"
        heart.modulate.a = 1.0 if full else 0.58
    _draw_field()
    _update_result()


func _update_result() -> void:
    %Again.visible = not running
    %Again.text = "Ещё раз" if errors == LIVES else "Начать"
    %Again.icon = REPLAY_ICON if errors == LIVES else null
    if running:
        return
    var payout := reward_text()
    if errors != LIVES:
        %Hint.text = "Веди Ричи за пальцем. Лови яблоки, пропускай шишки."
    else:
        %Hint.text = _error_text() + " · жизни закончились"
        if not payout.is_empty():
            %Hint.text += "\n" + payout


func _input(event: InputEvent) -> void:
    if not running or not is_visible_in_tree():
        return
    var field: Rect2 = %Field.get_global_rect()
    if event is InputEventScreenTouch:
        if event.canceled and event.index == finger:
            finger = -1
            target_position = basket_position
            return
        _handle_pointer(event.position, event.index, event.pressed, field)
    elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
        _handle_pointer(event.position, -2, event.pressed, field)
    elif (event is InputEventScreenDrag and finger == event.index) or (event is InputEventMouseMotion and finger == -2):
        _move_basket((event.position.x - field.position.x) / field.size.x)
        get_viewport().set_input_as_handled()
    elif event is InputEventKey and event.pressed and event.keycode in [KEY_LEFT, KEY_RIGHT]:
        _move_basket(target_position + (-0.08 if event.keycode == KEY_LEFT else 0.08))
        get_viewport().set_input_as_handled()


func _handle_pointer(point: Vector2, pointer: int, pressed: bool, field: Rect2) -> void:
    if pressed and finger == -1 and field.has_point(point):
        finger = pointer
        var fraction := (point.x - field.position.x) / field.size.x
        %Backdrop.touch_water(point)
        _move_basket(fraction)
        get_viewport().set_input_as_handled()
    elif not pressed and pointer == finger:
        finger = -1
        get_viewport().set_input_as_handled()


func _playable_x(fraction: float) -> float:
    var width: float = %Walker.size.x
    var margin: float = %Walker.edge_margin() / width if width > 0.0 else 0.09
    return clampf(fraction, margin, 1.0 - margin)


func _move_basket(fraction: float) -> void:
    target_position = _playable_x(fraction)


func _advance_catcher(seconds: float) -> void:
    target_position = _playable_x(target_position)
    basket_position = _playable_x(move_toward(basket_position, target_position, field_widths_per_second * seconds))
    %Backdrop.aim_at(basket_position)
    %Walker.set_catcher(basket_position, caught)
