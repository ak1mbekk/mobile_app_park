extends SceneTree

# Use --fixed-fps 60. Supplying an output directory records the actual viewport.
const ROOM := preload("res://Scenes/Games/GameRoom.tscn")
const FIVE := "002002320042240204003202300120121403"
var room
var board
var grid: GridContainer
var field: Array[int] = []
var centers: Array[Vector2] = []
var face_centers: Array[Vector2] = []
var output := ""
var frame := 0
var failures := 0
var saves := 0
var recorded := {}


func _initialize() -> void:
    _run.call_deferred()


func _run() -> void:
    var args := OS.get_cmdline_user_args()
    if not args.is_empty() and args[0] != "-":
        output = args[0]
        DirAccess.make_dir_recursive_absolute(output.path_join("frames"))
    root.size = Vector2i(int(args[1]), int(args[2])) if args.size() >= 3 else Vector2i(390, 844)
    room = ROOM.instantiate()
    root.add_child(room)
    room.round_saved.connect(func(_game, _round): saves += 1)
    for digit in FIVE:
        field.append(int(digit))
    room.set_rounds({"match": {"id": 6, "cells": field.duplicate(), "moves": 12, "berries": 0, "finished": false}})
    room.open("match")
    board = room.board
    grid = board.get_node("%Grid")
    await _frames(15)
    for tile in grid.get_children():
        centers.append(tile.get_global_rect().get_center())
        face_centers.append(tile.face.get_global_rect().get_center())
    var pitch: Vector2 = centers[1] - centers[0]
    var vertical: Vector2 = centers[8] - centers[2]
    _check(grid.get_child_count() == 36 and pitch.x > 0 and vertical.y > 0, "Six-by-six grid has measurable cell spacing")
    var scale: float = root.size.x / root.get_visible_rect().size.x
    _check(grid.get_child(0).size.x * scale >= 44.0, "Touch cell is at least 44 physical pixels wide")
    _check(root.get_visible_rect().encloses(grid.get_global_rect()), "All six rows fit inside the viewport")
    _check(root.get_visible_rect().encloses(board.get_node("%Hint").get_global_rect()), "Instructions fit beneath the board")
    _shot("01-board")
    await _frames(28)

    _touch(centers[2], true)
    _drag(centers[2] + vertical * 0.32, vertical * 0.32)
    await _frames(5)
    _check(_offset(2).y > 0.07 * vertical.y, "Picked fruit tracks a partial drag before release")
    _shot("02-drag")
    _touch(centers[2] + vertical * 0.32, false, true)
    await _frames(28)
    _check(board.cells == field and saves == 0 and _offset(2).length() < 1.2, "Canceled drag returns the same fruit without a transaction")

    var invalid := _bad_pair()
    _touch(centers[invalid.x], true)
    _touch(centers[invalid.x], false)
    _touch(centers[invalid.y], true)
    _touch(centers[invalid.y], false)
    var furthest := 0.0
    var rejection_seen := false
    for _tick in 120:
        var distance := _offset(invalid.x).length() / pitch.length()
        if distance > 0.36 and not recorded.has("03-rejected-swap"):
            _shot("03-rejected-swap")
        furthest = maxf(furthest, distance)
        rejection_seen = rejection_seen or (furthest > 0.42 and distance < furthest - 0.12 and distance > 0.04)
        if not board.resolving and _tick > 3:
            break
        await _frames(1)
    _check(furthest > 0.44 and rejection_seen, "Rejected fruit visibly travels out and back")
    _check(saves == 0 and board.cells == field and board.moves == 12, "Rejected swap preserves board, moves and save")
    await _frames(20)

    seed(42)
    _touch(centers[2], true)
    for part in 8:
        _drag(centers[2] + vertical * (part + 1) / 8.0, vertical / 8.0)
        await _frames(1)
    _touch(centers[8], false)
    _check(saves == 1 and int(room.rounds.match.moves) == 11, "A legal swipe commits exactly one turn before effects finish")
    var cleared := false
    var falling := false
    var stable_slots := true
    var phases: Array[String] = []
    for _tick in 440:
        var phase := str(board.motion_phase) if "motion_phase" in board else ""
        if phase != "" and (phases.is_empty() or phases.back() != phase):
            phases.append(phase)
        var popped := 0
        var downward := 0
        for i in grid.get_child_count():
            var tile = grid.get_child(i)
            var face: TextureRect = tile.face
            if face.scale.x < 0.84 or face.modulate.a < 0.78:
                popped += 1
            if _offset(i).y < -0.22 * vertical.y:
                downward += 1
            if tile.get_global_rect().get_center().distance_to(centers[i]) > 0.6:
                stable_slots = false
        if popped >= 3 and not cleared:
            cleared = true
            _shot("04-clear")
        if cleared and downward >= 2 and not falling:
            falling = true
            _shot("05-gravity")
        if not board.resolving and _tick > 2:
            break
        await _frames(1)
    _check(cleared and falling, "Matched fruit visibly clears before falling replacements")
    _check(stable_slots, "The touch cells stay fixed throughout the exchange and gravity")
    _check(not board.resolving and board.moves == 11 and board.bonus >= 2, "Five-fruit line settles with its bonus")
    _check(board.cells == room.rounds.match.cells and saves == 1, "Displayed result equals the single committed turn")
    _shot("06-settled")
    await _frames(36)

    # The first refill leaves a three-berry exchange in row five. Seed 0 then
    # produces a second matching wave, without replacing the field between moves.
    seed(0)
    _touch(centers[18], true)
    for part in 10:
        _drag(centers[18] + vertical * (part + 1) / 10.0, vertical / 10.0)
        await _frames(1)
    _touch(centers[24], false)
    var waves := 0
    var previous_phase := ""
    for tick in 500:
        var phase := str(board.motion_phase)
        if phase == "clear" and previous_phase != "clear":
            waves += 1
        if phase == "clear" and waves == 1 and board.get_node("%Hint").text.contains("3"):
            if not recorded.has("07-three"):
                _shot("07-three")
        if phase == "clear" and waves == 2 and not recorded.has("08-cascade"):
            _shot("08-cascade")
        if tick == 2 and board.resolving:
            _touch(centers[4], true)
            _touch(centers[5], false)
        previous_phase = phase
        if not board.resolving and tick > 3:
            break
        await _frames(1)
    _check(waves >= 2 and recorded.has("07-three"), "An ordinary three produces a distinct later cascade")
    _check(saves == 2 and board.moves == 10, "The entire cascade consumes one move and ignores input while resolving")
    _shot("09-end")
    await _frames(45)
    print("Motion phases ", phases, "; rejected distance ", snappedf(furthest, 0.01), " cells; recorded ", frame, " frames")
    if failures == 0:
        print("PASS real touch preview/cancel, visible reject/return, five-fruit pop, gravity, ordinary three, cascade and one save per turn")
    quit(1 if failures else 0)


func _bad_pair() -> Vector2i:
    for i in range(35):
        if i % 6 == 5 or field[i] == field[i + 1]:
            continue
        var next := field.duplicate()
        var piece: int = next[i]
        next[i] = next[i + 1]
        next[i + 1] = piece
        if board._lines(next).removed.is_empty():
            return Vector2i(i, i + 1)
    return Vector2i(-1, -1)


func _offset(i: int) -> Vector2:
    return grid.get_child(i).face.get_global_rect().get_center() - face_centers[i]


func _touch(at: Vector2, pressed: bool, cancel := false) -> void:
    var event := InputEventScreenTouch.new()
    event.index = 0
    event.position = at
    event.pressed = pressed
    event.canceled = cancel
    root.push_input(event, true)


func _drag(at: Vector2, relative: Vector2) -> void:
    var event := InputEventScreenDrag.new()
    event.index = 0
    event.position = at
    event.relative = relative
    root.push_input(event, true)


func _frames(count: int) -> void:
    for _tick in count:
        await process_frame
        if not output.is_empty():
            await RenderingServer.frame_post_draw
            var file := output.path_join("frames/%04d.png" % frame)
            _check(root.get_texture().get_image().save_png(file) == OK, "Write gameplay frame")
        frame += 1


func _shot(label: String) -> void:
    recorded[label] = frame
    if not output.is_empty() and frame > 0:
        var latest := output.path_join("frames/%04d.png" % (frame - 1))
        _check(DirAccess.copy_absolute(latest, output.path_join(label + ".png")) == OK, "Save " + label)


func _check(ok: bool, label: String) -> void:
    if not ok:
        failures += 1
        push_error(label)
