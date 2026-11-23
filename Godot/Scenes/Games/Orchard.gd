extends "res://Scenes/Games/GameRound.gd"

const REPLAY_ICON = preload("res://Scenes/Games/Art/game-replay.svg")
const LIVES := 3

var attempt := 0
var caught := 0
var errors := 0
var basket_position := 0.5
var spot := 0.5
var fall := 0.0
var kind := "apple"
var running := false
var finger := -1
var feedback_tween: Tween
var basket_tilt := 0.0


func _ready() -> void:
    %Again.pressed.connect(_new_round)
    visibility_changed.connect(_sync_activity)
    _sync_activity()


func _sync_activity() -> void:
    set_process(running and is_visible_in_tree())
    if not is_processing():
        finger = -1


func restore(record: Dictionary) -> void:
    super.restore(record)
    if not _valid_round(record):
        _paint()
        return
    attempt = int(record.attempt)
    caught = int(record.caught)
    errors = int(record.get("errors", LIVES if record.finished else mini(LIVES - 1, attempt - caught)))
    basket_position = clampf(record.position, 0.09, 0.91)
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
    %Backdrop.aim_at(basket_position)
    basket_tilt = 0.0
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
    spot = randf_range(0.1, 0.9)
    fall = 0.01


func _process(delta: float) -> void:
    basket_tilt = lerpf(basket_tilt, 0.0, 1.0 - exp(-12.0 * delta))
    fall += minf(0.06, delta) / maxf(0.52, 1.1 - attempt * 0.027)
    if fall >= 1.0:
        _land()
    _draw_field()


func _land() -> void:
    attempt += 1
    var grabbed: bool = %Field.overlaps_mouth(spot, basket_position, basket_tilt, kind == "cone")
    if kind == "apple" and grabbed:
        caught += 1
        %Hint.text = "Яблоко поймано"
        _flash("catch")
    elif grabbed or kind == "apple":
        errors += 1
        var heart: Label = %Lives.get_child(LIVES - errors)
        heart.pivot_offset = heart.size * 0.5
        heart.scale = Vector2.ONE * 1.28
        heart.create_tween().tween_property(heart, "scale", Vector2.ONE, 0.22)
        %Hint.text = _error_text()
        _flash("rattle" if grabbed else "ground")
    else:
        %Hint.text = "Шишка пролетела мимо"
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
    %Field.landing_basket_x = basket_position
    %Field.flash = 1.0
    feedback_tween = create_tween()
    feedback_tween.tween_method(_fade_flash, 1.0, 0.0, 0.41)


func _fade_flash(value: float) -> void:
    %Field.flash = value
    %Field.queue_redraw()


func checkpoint() -> void:
    finger = -1
    if running:
        _save_round()


func _save_round() -> void:
    commit({
        "attempt": attempt, "caught": caught, "errors": errors, "position": basket_position,
        "spot": spot, "fall": fall, "kind": kind, "finished": not running,
        "won": not running and caught > 0,
    })


func _draw_field() -> void:
    %Walker.follow_basket(basket_position)
    %Field.fruit_x = spot
    %Field.basket_x = basket_position
    %Field.basket_tilt = basket_tilt
    %Field.harvest = caught
    %Field.fall = fall
    %Field.cone = kind == "cone"
    %Field.fruit_visible = running
    %Field.queue_redraw()


func _paint() -> void:
    %Goal.text = "Яблоки %d" % caught
    var remaining := LIVES - errors
    %Lives.accessibility_name = "Жизни: %d из %d" % [remaining, LIVES]
    for index in LIVES:
        var heart: Label = %Lives.get_child(index)
        var full := index < remaining
        heart.text = "♥" if full else "♡"
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
        %Hint.text = "Двигай корзинку, лови яблоки и пропускай шишки."
    else:
        %Hint.text = _error_text() + " · жизни закончились"
        if not payout.is_empty():
            %Hint.text += "\n" + payout


func _input(event: InputEvent) -> void:
    if not running or not is_visible_in_tree():
        return
    var field: Rect2 = %Field.get_global_rect()
    if event is InputEventScreenTouch:
        _handle_pointer(event.position, event.index, event.pressed, field)
    elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
        _handle_pointer(event.position, -2, event.pressed, field)
    elif (event is InputEventScreenDrag and finger == event.index) or (event is InputEventMouseMotion and finger == -2):
        _move_basket((event.position.x - field.position.x) / field.size.x)
        get_viewport().set_input_as_handled()
    elif event is InputEventKey and event.pressed and event.keycode in [KEY_LEFT, KEY_RIGHT]:
        _move_basket(basket_position + (-0.08 if event.keycode == KEY_LEFT else 0.08))
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


func _move_basket(position: float) -> void:
    var next_position := clampf(position, 0.09, 0.91)
    var offset := next_position - basket_position
    basket_tilt = clampf(basket_tilt + offset * 3.6, -0.28, 0.28)
    basket_position = next_position
    %Backdrop.aim_at(basket_position)
    _draw_field()
