extends "res://Scenes/Games/GameRound.gd"

const TILE = preload("res://Scenes/Games/GameTile.tscn")
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


func _ready() -> void:
    %Again.pressed.connect(_new_round)
    resized.connect(fit_tile_board.bind(%Board))
    fit_tile_board.call_deferred(%Board)
    for index in WIDTH * WIDTH:
        var button := TILE.instantiate()
        button.pressed.connect(_choose.bind(index))
        %Grid.add_child(button)


func restore(record: Dictionary) -> void:
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
        return

    var previous := selected
    selected = -1
    resolving = true
    var next := cells.duplicate()
    _swap(next, previous, index)
    var line := _lines(next)
    if line.removed.is_empty():
        await _animate_swap(previous, index)
        _swap(cells, previous, index)
        _paint()
        await _animate_swap(previous, index)
        _swap(cells, previous, index)
        resolving = false
        _paint()
        %Hint.text = "Нужна линия из трёх плодов."
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
    moves = remaining
    for cascade_index in cascades.size():
        var cascade: Dictionary = cascades[cascade_index]
        cells = cascade.before
        _paint()
        %Hint.text = "Линия из %d" % cascade.longest
        if cascade_index > 0:
            %Hint.text = "Каскад ×%d · " % (cascade_index + 1) + %Hint.text
        await _animate_pop(cascade.removed)
        cells = cascade.after
        berries = cascade.collected
        bonus = cascade.bonus
        _paint()
        await _animate_fall(cascade.falls)
    cells = settled
    finished = ended
    resolving = false
    _paint()
    _update_result()
    if not ended and reshuffle:
        %Hint.text = "Поле перемешано. Новый ход готов."
    elif not ended and cascades.size() > 1:
        %Hint.text = "Каскад ×%d" % cascades.size()


func _save_move(next: Array, remaining: int, collected: int, earned_bonus: int, ended: bool) -> void:
    commit({
        "cells": next.duplicate(), "moves": remaining, "berries": collected, "bonus": earned_bonus,
        "finished": ended, "won": collected >= TARGET,
    })


func _row(index: int) -> int:
    return floori(float(index) / WIDTH)


func _paint() -> void:
    for index in cells.size():
        var piece := int(cells[index])
        var description := "%s · ряд %d, место %d" % [NAMES[piece], _row(index) + 1, index % WIDTH + 1]
        var tile = %Grid.get_child(index)
        tile.face.modulate = Color.WHITE
        tile.face.scale = Vector2.ONE
        tile.paint(PIECES[piece], description, selected == index)
    %Goal.text = "Малина %d из %d" % [mini(TARGET, berries), TARGET]
    %Counter.text = "Ходы %d" % moves
    %Combo.text = "Бонус +%d" % bonus
    %Combo.visible = bonus > 0


func _update_result() -> void:
    if resolving:
        return
    %ResultActions.visible = finished
    if finished:
        var payout := reward_text()
        var result := "Корзинка полна!" if berries >= TARGET else "Ходы закончились"
        %Hint.text = result if payout.is_empty() else result + "\n" + payout
    else:
        %Hint.text = "Поменяй соседние плоды местами, чтобы собрать три в ряд."


func _animate_swap(first: int, second: int) -> void:
    var a = %Grid.get_child(first)
    var b = %Grid.get_child(second)
    var movement: Vector2 = b.position - a.position
    var start: Vector2 = a.face.position
    var tween := create_tween().set_parallel().set_trans(Tween.TRANS_SINE)
    tween.tween_property(a.face, "position", start + movement, 0.14)
    tween.tween_property(b.face, "position", start - movement, 0.14)
    await tween.finished
    a.face.position = start
    b.face.position = start


func _animate_pop(removed: Dictionary) -> void:
    var tween := create_tween().set_parallel()
    for index in removed:
        var face: TextureRect = %Grid.get_child(index).face
        face.pivot_offset = face.size * 0.5
        tween.tween_property(face, "scale", Vector2(0.28, 0.28), 0.19)
        tween.tween_property(face, "modulate:a", 0.15, 0.19)
    await tween.finished


func _animate_fall(falls: Dictionary) -> void:
    if falls.is_empty():
        return
    var tween := create_tween().set_parallel().set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
    for index in falls:
        var tile = %Grid.get_child(index)
        var end: Vector2 = tile.face.position
        tile.face.position.y -= falls[index] * (tile.size.y + 6.0)
        tween.tween_property(tile.face, "position", end, 0.18 + 0.04 * falls[index])
    await tween.finished


func _input(event: InputEvent) -> void:
    if not is_visible_in_tree() or resolving or finished:
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
            get_viewport().set_input_as_handled()
    elif pointer == finger and drag_start >= 0:
        var start := drag_start
        drag_start = -1
        finger = -1
        get_viewport().set_input_as_handled()
        if index >= 0 and (not touch or not event.canceled):
            if start != index:
                selected = start
            _choose(index)


func _cell_at(point: Vector2) -> int:
    for index in %Grid.get_child_count():
        if %Grid.get_child(index).get_global_rect().has_point(point):
            return index
    return -1
