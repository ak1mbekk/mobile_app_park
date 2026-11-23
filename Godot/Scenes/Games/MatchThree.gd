extends "res://Scenes/Games/GameRound.gd"

const TILE = preload("res://Scenes/Games/MatchTile.tscn")
const WIDTH := 6
const TARGET := 9
const INITIAL_MOVES := 12
const NAMES := ["Малина", "Груша", "Яблоко", "Орех", "Слива"]
const PIECES := [
    preload("res://Scenes/Games/Art/piece-0.webp"),
    preload("res://Scenes/Games/Art/piece-1.webp"),
    preload("res://Scenes/Games/Art/piece-2.webp"),
    preload("res://Scenes/Games/Art/piece-3.webp"),
    preload("res://Scenes/Games/Art/piece-4.webp"),
]

var cells: Array = []
var moves := INITIAL_MOVES
var berries := 0
var bonus := 0
var finished := false
var resolving := false
var selected := -1
var drag_start := -1
var finger := -1
@export var reduced_motion := false
@export var haptics_enabled := true
var motion_phase: StringName = &"idle"
var motion_epoch := 0
var active_tween: Tween
var settled_record: Dictionary = {}
var drag_origin := Vector2.ZERO
var drag_neighbor := -1
var drag_distance := 0.0
var gesture_moved := false


func _ready() -> void:
    %Again.pressed.connect(_new_round)
    resized.connect(_resize_board)
    visibility_changed.connect(_sync_activity)
    fit_tile_board.call_deferred(%Board)
    for index in WIDTH * WIDTH:
        var button := TILE.instantiate()
        button.pressed.connect(_choose.bind(index))
        %Grid.add_child(button)


func restore(record: Dictionary) -> void:
    _stop_motion()
    super.restore(record)
    var field = record.get("cells", [])
    var remaining = record.get("moves", -1)
    var collected = record.get("berries", -1)
    if not _valid_board(field, remaining, collected, record.get("finished")):
        _new_round()
        return
    cells = field.duplicate()
    moves = int(remaining)
    berries = int(collected)
    bonus = clampi(int(record.get("bonus", 0)), 0, 5)
    finished = record.finished
    settled_record = record.duplicate(true)
    _paint()
    _update_result()


func _valid_board(field: Variant, remaining: Variant, collected: Variant, ended: Variant) -> bool:
    if round_id < 1 or not field is Array or field.size() != WIDTH * WIDTH:
        return false
    if not _is_integer_in_range(remaining, 0, INITIAL_MOVES) or not _is_integer_in_range(collected, 0, 9007199254740991):
        return false
    if not ended is bool or ended != (collected >= TARGET or remaining == 0):
        return false
    for piece in field:
        if not _is_integer_in_range(piece, 0, PIECES.size() - 1):
            return false
    return _lines(field).removed.is_empty() and (ended or _has_move(field))


func _is_integer_in_range(value: Variant, lower: int, upper: int) -> bool:
    return (value is int or value is float) and value >= lower and value <= upper and value == int(value)


func _new_round() -> void:
    _stop_motion()
    begin_round()
    cells = _fill_board()
    moves = INITIAL_MOVES
    berries = 0
    bonus = 0
    finished = false
    selected = -1
    _save_move(cells, moves, berries, bonus, false)
    _paint()
    _update_result()


func _fill_board() -> Array:
    while true:
        var board := []
        for index in WIDTH * WIDTH:
            var allowed := range(PIECES.size())
            if index % WIDTH >= 2 and board[index - 1] == board[index - 2]:
                allowed.erase(board[index - 1])
            if index >= WIDTH * 2 and board[index - WIDTH] == board[index - WIDTH * 2]:
                allowed.erase(board[index - WIDTH])
            board.append(allowed.pick_random())
        if _has_move(board):
            return board
    return []


func _lines(board: Array) -> Dictionary:
    var removed := {}
    var extra := 0
    var longest := 0
    for vertical in [false, true]:
        var step := WIDTH if vertical else 1
        for lane in WIDTH:
            var start := lane if vertical else lane * WIDTH
            var offset := 0
            while offset < WIDTH:
                var first := start + offset * step
                var end := offset + 1
                while end < WIDTH and board[start + end * step] == board[first]:
                    end += 1
                var line_size := end - offset
                if line_size >= 3:
                    longest = maxi(longest, line_size)
                    extra += clampi(line_size - 3, 0, 2)
                    for in_line in range(offset, end):
                        removed[start + in_line * step] = true
                offset = end
    return {"removed": removed, "extra": extra, "longest": longest}


func _swap(board: Array, first: int, second: int) -> void:
    var piece = board[first]
    board[first] = board[second]
    board[second] = piece


func _has_move(board: Array) -> bool:
    for first in board.size():
        for second in [first + 1, first + WIDTH]:
            if second >= board.size() or (second == first + 1 and second % WIDTH == 0):
                continue
            _swap(board, first, second)
            var valid: bool = not _lines(board).removed.is_empty()
            _swap(board, first, second)
            if valid:
                return true
    return false


func _drop(board: Array, removed: Dictionary) -> Dictionary:
    var falls := {}
    for column in WIDTH:
        var destination := WIDTH - 1
        for row in range(WIDTH - 1, -1, -1):
            var index := row * WIDTH + column
            if removed.has(index):
                continue
            var target := destination * WIDTH + column
            board[target] = board[index]
            if row != destination:
                falls[target] = destination - row
            destination -= 1
        var added := destination + 1
        for row in added:
            var index := row * WIDTH + column
            board[index] = randi_range(0, PIECES.size() - 1)
            falls[index] = added
    return falls


func _choose(index: int) -> void:
    if resolving or finished:
        return
    if selected == index:
        selected = -1
        _paint()
        return
    var adjacent := selected >= 0 and (
        absi(index - selected) == WIDTH
        or (absi(index - selected) == 1 and _row(index) == _row(selected))
    )
    if not adjacent:
        selected = index
        _paint()
        _feel(8)
        return

    var previous := selected
    selected = -1
    resolving = true
    var epoch := motion_epoch
    var next := cells.duplicate()
    _swap(next, previous, index)
    var line := _lines(next)
    if line.removed.is_empty():
        await _animate_swap(previous, index)
        if epoch != motion_epoch:
            return
        _swap(cells, previous, index)
        _paint()
        motion_phase = &"reject"
        _feel(12)
        await _animate_swap(previous, index, true)
        if epoch != motion_epoch:
            return
        _swap(cells, previous, index)
        resolving = false
        motion_phase = &"idle"
        _paint()
        %Hint.text = "Попробуй другую пару — ход сохранён."
        return

    # Persist the fully resolved turn before showing the first animation.
    var cascades := []
    var collected := berries
    var earned_bonus := bonus
    while not line.removed.is_empty() and cascades.size() < 30:
        earned_bonus = mini(5, earned_bonus + line.extra + int(not cascades.is_empty()))
        var before := next.duplicate()
        for removed_index in line.removed:
            if next[removed_index] == 0:
                collected += 1
        var falls := _drop(next, line.removed)
        cascades.append({
            "before": before, "after": next.duplicate(), "removed": line.removed,
            "falls": falls, "collected": collected, "longest": line.longest, "bonus": earned_bonus,
        })
        line = _lines(next)
    var remaining := moves - 1
    var ended := collected >= TARGET or remaining == 0
    var reshuffle: bool = not line.removed.is_empty() or (not ended and not _has_move(next))
    var settled := _fill_board() if reshuffle else next
    _save_move(settled, remaining, collected, earned_bonus, ended)
    await _animate_swap(previous, index)
    if epoch != motion_epoch:
        return
    moves = remaining
    for cascade_index in cascades.size():
        var cascade: Dictionary = cascades[cascade_index]
        cells = cascade.before
        _paint()
        %Hint.text = "Линия из %d" % cascade.longest
        if cascade_index > 0:
            %Hint.text = "Каскад ×%d · " % (cascade_index + 1) + %Hint.text
        %Hint.modulate = Color(0.56, 0.32, 0.14) if cascade.longest >= 4 else Color.WHITE
        if cascade.longest >= 4:
            %Effects.announce("%d в ряд!" % cascade.longest)
        elif cascade_index > 0:
            %Effects.announce("Каскад ×%d" % (cascade_index + 1))
        _feel(22 if cascade.longest >= 4 else 12)
        await _animate_pop(cascade.removed, cascade.longest >= 4)
        if epoch != motion_epoch:
            return
        cells = cascade.after
        berries = cascade.collected
        bonus = cascade.bonus
        _paint()
        await _animate_fall(cascade.falls)
        if epoch != motion_epoch:
            return
    cells = settled
    finished = ended
    resolving = false
    motion_phase = &"idle"
    _paint()
    _update_result()
    if not ended and reshuffle:
        %Hint.text = "Поле перемешано. Новый ход готов."
    elif not ended and cascades.size() > 1:
        %Hint.text = "Каскад ×%d" % cascades.size()


func _save_move(next: Array, remaining: int, collected: int, earned_bonus: int, ended: bool) -> void:
    var record := {
        "cells": next.duplicate(), "moves": remaining, "berries": collected, "bonus": earned_bonus,
        "finished": ended, "won": collected >= TARGET,
    }
    commit(record)
    settled_record = record.duplicate(true)


func _row(index: int) -> int:
    return floori(float(index) / WIDTH)


func _paint() -> void:
    for index in cells.size():
        var piece := int(cells[index])
        var description := "%s · ряд %d, место %d" % [NAMES[piece], _row(index) + 1, index % WIDTH + 1]
        var tile = %Grid.get_child(index)
        tile.reset_motion()
        tile.paint(PIECES[piece], description, selected == index)
    %Goal.text = "Малина %d из %d" % [mini(TARGET, berries), TARGET]
    %Counter.text = "Ходы %d" % moves
    %Combo.text = "Бонус +%d" % bonus
    %Combo.visible = bonus > 0


func _update_result() -> void:
    if resolving:
        return
    %ResultActions.visible = finished
    %Hint.modulate = Color.WHITE
    if finished:
        var payout := reward_text()
        var result := "Корзинка полна!" if berries >= TARGET else "Ходы закончились"
        %Hint.text = result if payout.is_empty() else result + "\n" + payout
    else:
        %Hint.text = "Потяни плод к соседнему.\nСобери малину по три в ряд."


func _animate_swap(first: int, second: int, returning := false) -> void:
    motion_phase = &"reject" if returning else &"swap"
    var a = %Grid.get_child(first)
    var b = %Grid.get_child(second)
    var movement: Vector2 = b.position - a.position
    var start := Vector2(5, 5)
    a.set_held(true)
    b.z_index = 2
    var tween := _motion_tween().set_parallel().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
    var duration := 0.07 if reduced_motion else 0.20 if returning else 0.18
    tween.tween_property(a.face, "position", start + movement, duration)
    tween.tween_property(b.face, "position", start - movement, duration)
    tween.tween_property(a.face, "scale", Vector2.ONE, duration)
    tween.tween_property(b.face, "scale", Vector2.ONE, duration)
    await tween.finished
    a.reset_motion()
    b.reset_motion()


func _animate_pop(removed: Dictionary, strong := false) -> void:
    motion_phase = &"clear"
    var tween := _motion_tween().set_parallel()
    for index in removed:
        var face: TextureRect = %Grid.get_child(index).face
        face.pivot_offset = face.size * 0.5
        if not reduced_motion:
            %Effects.burst(face.get_global_rect().get_center(), int(cells[index]), strong)
            if cells[index] == 0:
                %Effects.collect(face.get_global_rect().get_center(), %Goal.get_global_rect().get_center(), PIECES[0])
            tween.tween_property(face, "scale", Vector2.ONE * (1.19 if strong else 1.12), 0.08).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
            tween.tween_property(face, "scale", Vector2.ONE * 0.10, 0.16).set_delay(0.08).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)
        tween.tween_property(face, "modulate:a", 0.0, 0.08 if reduced_motion else 0.15).set_delay(0.0 if reduced_motion else 0.09)
    await tween.finished


func _animate_fall(falls: Dictionary) -> void:
    motion_phase = &"fall"
    if falls.is_empty():
        return
    var tween := _motion_tween().set_parallel().set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
    for index in falls:
        var tile = %Grid.get_child(index)
        var end: Vector2 = tile.face.position
        if reduced_motion:
            tile.face.modulate.a = 0.0
            tween.tween_property(tile.face, "modulate:a", 1.0, 0.08)
            continue
        tile.face.position.y -= falls[index] * (tile.size.y + %Grid.get_theme_constant("v_separation"))
        var duration := 0.12 + 0.065 * sqrt(float(falls[index]))
        var delay := float(index % WIDTH) * 0.012
        tween.tween_property(tile.face, "position", end, duration).set_delay(delay)
        tween.tween_property(tile.face, "scale", Vector2(1.08, 0.91), 0.055).set_delay(delay + duration)
        tween.tween_property(tile.face, "scale", Vector2.ONE, 0.095).set_delay(delay + duration + 0.055).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
    await tween.finished


func _input(event: InputEvent) -> void:
    if not is_visible_in_tree() or resolving or finished:
        return
    if event is InputEventScreenDrag or event is InputEventMouseMotion:
        if drag_start >= 0 and ((event is InputEventScreenDrag and event.index == finger) or (event is InputEventMouseMotion and finger == -2)):
            _preview_drag(event.position)
            get_viewport().set_input_as_handled()
        return
    var touch := event is InputEventScreenTouch
    if not touch and not (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT):
        return
    var index := _cell_at(event.position)
    var pointer: int = event.index if touch else -2
    if event.pressed:
        if index >= 0 and drag_start == -1:
            drag_start = index
            finger = pointer
            drag_origin = event.position
            drag_neighbor = -1
            drag_distance = 0.0
            gesture_moved = false
            motion_phase = &"drag"
            var tile = %Grid.get_child(index)
            tile.set_held(true)
            if not reduced_motion:
                tile.face.scale = Vector2.ONE * 1.06
            _feel(7)
            get_viewport().set_input_as_handled()
    elif pointer == finger and drag_start >= 0:
        var start := drag_start
        var neighbor := drag_neighbor
        var moved := gesture_moved
        var distance := drag_distance
        drag_start = -1
        finger = -1
        get_viewport().set_input_as_handled()
        if index < 0 or (touch and event.canceled):
            _reset_pointer()
            return
        if moved:
            if neighbor >= 0 and distance >= %Grid.get_child(start).size.x * 0.23:
                selected = start
                _choose(neighbor)
            else:
                _reset_pointer()
        else:
            _reset_pointer()
            if start != index:
                selected = start
            _choose(index)


func _preview_drag(point: Vector2) -> void:
    var delta := point - drag_origin
    gesture_moved = gesture_moved or delta.length() > 6.0
    if not gesture_moved:
        return
    var vertical := absf(delta.y) > absf(delta.x)
    var direction := signi(int(delta.y if vertical else delta.x))
    var neighbor := drag_start + direction * (WIDTH if vertical else 1)
    if neighbor < 0 or neighbor >= cells.size() or (not vertical and _row(neighbor) != _row(drag_start)):
        neighbor = -1
    for tile in %Grid.get_children():
        tile.reset_motion()
    var tile = %Grid.get_child(drag_start)
    tile.set_held(true)
    var pitch: float = tile.size.y + 6 if vertical else tile.size.x + 6
    drag_distance = minf(absf(delta.y if vertical else delta.x), pitch)
    drag_neighbor = neighbor
    var amount := minf(drag_distance, pitch * (0.95 if neighbor >= 0 else 0.12)) * direction
    var movement := Vector2(0, amount) if vertical else Vector2(amount, 0)
    if not reduced_motion:
        tile.face.position = Vector2(5, 5) + movement
        tile.face.scale = Vector2.ONE * 1.06
        if neighbor >= 0:
            var other = %Grid.get_child(neighbor)
            other.face.position = Vector2(5, 5) - movement
            other.face.scale = Vector2.ONE * 0.96


func _reset_pointer() -> void:
    drag_start = -1
    drag_neighbor = -1
    finger = -1
    gesture_moved = false
    for tile in %Grid.get_children():
        tile.reset_motion()
    if not resolving:
        motion_phase = &"idle"


func _motion_tween() -> Tween:
    active_tween = create_tween()
    if not is_visible_in_tree():
        active_tween.pause()
    return active_tween


func _stop_motion() -> void:
    motion_epoch += 1
    if active_tween and active_tween.is_valid():
        active_tween.kill()
    resolving = false
    _reset_pointer()
    if is_instance_valid(%Effects):
        %Effects.clear()


func _resize_board() -> void:
    fit_tile_board(%Board)
    if resolving and not settled_record.is_empty():
        restore(settled_record)
    elif drag_start >= 0:
        _reset_pointer()


func _sync_activity() -> void:
    if not is_visible_in_tree():
        if not resolving:
            _reset_pointer()
        if active_tween and active_tween.is_valid():
            active_tween.pause()
    elif active_tween and active_tween.is_valid():
        active_tween.play()


func _notification(what: int) -> void:
    if is_node_ready() and what in [NOTIFICATION_APPLICATION_FOCUS_OUT, NOTIFICATION_PAUSED] and not resolving:
        _reset_pointer()


func _feel(milliseconds: int) -> void:
    if haptics_enabled and not reduced_motion and OS.has_feature("mobile"):
        Input.vibrate_handheld(milliseconds)


func _cell_at(point: Vector2) -> int:
    for index in %Grid.get_child_count():
        if %Grid.get_child(index).get_global_rect().has_point(point):
            return index
    return -1
