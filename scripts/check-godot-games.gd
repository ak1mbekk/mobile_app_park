extends SceneTree

const GAME_ROOM = preload("res://Scenes/Games/GameRoom.tscn")
const CELLS := [
    0, 1, 2, 3, 4, 0, 1, 2, 3, 0, 0, 1, 2, 3, 4, 0, 1, 2,
    3, 4, 0, 2, 0, 3, 4, 0, 1, 0, 3, 4, 0, 1, 2, 3, 4, 0,
]

var room
var committed := []
var animal_links := []
var failures := 0
var ball_requests := 0
var closed_rooms := 0


func _initialize() -> void:
    call_deferred("_run")


func _run() -> void:
    seed(42)
    room = GAME_ROOM.instantiate()
    root.add_child(room)
    room.round_saved.connect(func(game: String, record: Dictionary):
        committed.append([game, record])
    )
    room.guide_available = true
    room.animal_requested.connect(func(species: String): animal_links.append(species))
    room.ball_purchase_requested.connect(func(): ball_requests += 1)
    room.closed.connect(func(): closed_rooms += 1)
    room.open()
    await process_frame
    _expect(room.get_node("%Picker").visible and not room.board, "Chest opens the picker")
    _test_ball()
    await _test_pairs()
    await _test_match()
    await _test_orchard()
    if failures == 0:
        print("PASS Godot chest and ball action, pair reveal/replay/guide, match combos, orchard hearts/replay, and return home")
    quit(failures)


func _test_ball() -> void:
    var ball: Button = room.get_node("%Ball")
    _expect(ball.disabled and ball.text.contains("5 листьев"), "Chest shows the ball price when unaffordable")
    _tap(ball)
    _expect(ball_requests == 0, "An unaffordable ball cannot be requested")
    room.set_ball_shop(false, true)
    _tap(ball)
    _expect(ball_requests == 1 and not ball.disabled, "The ball button delegates an affordable purchase")
    room.set_ball_shop(true, true)
    _tap(ball)
    _expect(ball_requests == 1 and ball.disabled and ball.text.contains("В домике"), "The purchased ball cannot be paid for twice")


func _test_pairs() -> void:
    room.set_rounds({"pairs": {
        "cards": ["lemur", "lemur", "raccoon", "raccoon", "bison", "bison"],
        "opened": [], "paired": ["lemur", "raccoon"], "moves": 3, "winShown": false,
    }})
    _tap(room.get_node("%Pairs"))
    await process_frame
    _expect(room.active_game == "pairs", "A real screen touch opens Pairs")
    var pairs = room.board
    _expect(pairs.get_node("%Grid").get_child_count() == 6, "Restore six legacy cards")
    _expect((committed.back()[1]).id == 1 and not committed.back()[1].finished, "Migrate the legacy round before it can win")
    _tap(pairs.get_node("%Grid").get_child(4))
    _tap(pairs.get_node("%Grid").get_child(5))
    var completed: Dictionary = room.rounds.pairs.duplicate(true)
    _expect(completed.finished and completed.won and completed.moves == 4, "Two taps complete the legacy pair")
    var count := committed.size()
    room.set_rounds({"pairs": completed.merged({"reward": {"leaves": 5, "xp": 10}})})
    room.open("pairs")
    await process_frame
    _expect(committed.size() == count, "Completed pairs can reopen without another reward")
    _expect(room.board.get_node("%Hint").text.contains("Листья +5"), "The authoritative reward is displayed")
    _tap(room.board.get_node("%Animal"))
    _expect(animal_links == ["bison"], "Result link requests the last matched species")
    _expect(committed.size() == count, "The guide link keeps the completed round")
    _tap(room.board.get_node("%Again"))
    _expect(room.rounds.pairs.id == 2 and room.rounds.pairs.cards.size() == 12, "Replay gets a new round with six pairs")
    await process_frame
    var grid: GridContainer = room.board.get_node("%Grid")
    for tile in grid.get_children():
        _expect(tile.face.texture == null, "Each of the twelve new cards starts hidden")
    var mismatch := 1
    while room.board.cards[mismatch] == room.board.cards[0]:
        mismatch += 1
    _tap(grid.get_child(0))
    _tap(grid.get_child(mismatch))
    _expect(room.board.opened == [0, mismatch], "A mismatch remains visible for comparison")
    _tap(grid.get_child(3))
    _expect(room.board.opened == [0, mismatch] and grid.get_child(3).face.texture == null, "A third touch is ignored while comparing")
    await create_timer(0.74).timeout
    _expect(room.board.opened.is_empty() and grid.get_child(0).face.texture == null, "Mismatched cards turn back over")
    await _return_home()


func _test_match() -> void:
    var original := {"id": 8, "cells": CELLS, "moves": 1, "berries": 4, "finished": false, "won": false}
    room.set_rounds({"match": original})
    room.open("match")
    await process_frame
    var grid: GridContainer = room.board.get_node("%Grid")
    _expect(grid.get_child_count() == 36, "Match-3 opens an editable 6 by 6 board")
    _tap(grid.get_child(0))
    _tap(grid.get_child(1))
    await create_timer(0.34).timeout
    _expect(room.rounds.match == original, "A rejected swap does not consume a move")
    _touch(grid.get_child(21).get_global_rect().get_center(), true)
    _touch(grid.get_child(27).get_global_rect().get_center(), false)
    var settled: Dictionary = room.rounds.match.duplicate(true)
    _expect(settled.id == 8 and settled.moves == 0 and settled.won, "Touch swipe saves the shared-cell win immediately")
    _expect(room.board.resolving, "Swap and cascade animation is in progress")
    room.set_rounds({"match": original})
    _expect(room.rounds.match == settled, "An older host snapshot cannot rewind the settled move")
    room.open("match")
    await process_frame
    _expect(room.board.cells == settled.cells and room.board.finished, "Leaving mid-animation restores the settled board")
    _tap(room.board.get_node("%Again"))
    _expect(room.rounds.match.id == 9 and room.rounds.match.moves == 12, "Match-3 replay gets a new round")

    var combo_field := Array("020043303241412104244120023402324143".split(""))
    for index in combo_field.size():
        combo_field[index] = int(combo_field[index])
    room.set_rounds({"match": {"id": 10, "cells": combo_field, "moves": 4, "berries": 0, "finished": false, "won": false}})
    room.open("match")
    await process_frame
    grid = room.board.get_node("%Grid")
    seed(42)
    _tap(grid.get_child(1))
    _tap(grid.get_child(7))
    var earned_bonus: int = room.rounds.match.bonus
    _expect(earned_bonus > 0 and room.board.bonus == 0 and room.board.resolving, "Final bonus saves immediately but waits for the visual match")
    for frame in 320:
        if not room.board.resolving:
            break
        await create_timer(0.025).timeout
    _expect(room.board.bonus == earned_bonus and room.board.get_node("%Combo").visible, "The animation updates the visible bonus")
    await _return_home()


func _test_orchard() -> void:
    var cases := [
        ["apple", 0.09, 3, 6], ["cone", 0.5, 3, 6],
        ["apple", 0.5, 2, 7], ["cone", 0.09, 2, 6],
    ]
    for index in cases.size():
        var scenario: Array = cases[index]
        room.open()
        room.set_rounds({"orchard": {
            "id": index + 3, "attempt": 7, "caught": 6, "errors": 2,
            "kind": scenario[0], "position": scenario[1], "spot": 0.5, "fall": 0.97,
            "finished": false, "won": false,
        }})
        room.open("orchard")
        room.board._process(0.05)
        var result: Dictionary = room.rounds.orchard
        _expect(result.errors == scenario[2] and result.caught == scenario[3], "Orchard collision and lives case %d" % index)
        _expect(result.finished == (scenario[2] == 3), "Orchard stops at three errors")
        var hearts: HBoxContainer = room.board.get_node("%Lives")
        var full := 0
        for heart in hearts.get_children():
            full += int(heart.text == "♥")
        _expect(hearts.get_child_count() == 3 and full == 3 - result.errors, "Orchard marks individual lost hearts")
        if not result.finished:
            room.board.fall = 0.40
            room.checkpoint()
            _expect(is_equal_approx(room.rounds.orchard.fall, 0.4), "Orchard saves a checkpoint midway through the fall")
        else:
            room.set_rounds({"orchard": result.merged({"reward": {"leaves": 2, "xp": 10}})})
            var hint: String = room.board.get_node("%Hint").text
            var reason := "Яблоко упало" if scenario[0] == "apple" else "Поймана шишка"
            _expect(hint.contains(reason) and hint.contains("Листья +2"), "Final orchard feedback retains both the cause and payout")
    room.board.basket_position = 0.09
    room.board.kind = "apple"
    room.board.spot = 0.5
    room.board._land()
    await process_frame
    var round_id: int = room.rounds.orchard.id
    _tap(room.board.get_node("%Again"))
    _expect(room.rounds.orchard.id == round_id + 1 and room.rounds.orchard.errors == 0, "Orchard replay restores all three lives")
    var field: Rect2 = room.board.get_node("%Field").get_global_rect()
    var first := field.get_center()
    _touch(first, true)
    var drag := InputEventScreenDrag.new()
    drag.index = 0
    drag.position = first + Vector2(field.size.x * 0.25, 0.0)
    root.push_input(drag, true)
    _touch(drag.position, false)
    _expect(is_equal_approx(room.board.basket_position, 0.75), "Dragging a finger moves the basket across the field")
    await _return_home()


func _return_home() -> void:
    var closed_before := closed_rooms
    _tap(room.get_node("%Back"))
    await process_frame
    _expect(room.get_node("%Picker").visible and not room.board, "Back returns to the chest picker")
    _tap(room.get_node("%Back"))
    _expect(not room.visible and closed_rooms == closed_before + 1, "Chest back closes the games and tells Home to return")


func _tap(control: Control) -> void:
    var point := control.get_global_rect().get_center()
    _touch(point, true)
    _touch(point, false)


func _touch(point: Vector2, pressed: bool) -> void:
    var event := InputEventScreenTouch.new()
    event.index = 0
    event.position = point
    event.pressed = pressed
    root.push_input(event, true)


func _expect(value: bool, label: String) -> void:
    if not value:
        failures += 1
        push_error(label)
