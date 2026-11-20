extends Control

signal closed
signal round_saved(game: String, round: Dictionary)
signal animal_requested(species: String)
signal ball_purchase_requested
signal ball_play_requested

const GAMES := {
    "pairs": preload("res://Scenes/Games/Pairs.tscn"),
    "match": preload("res://Scenes/Games/MatchThree.tscn"),
    "orchard": preload("res://Scenes/Games/Orchard.tscn"),
}

var rounds := {}
var active_game := ""
var board: Control
var guide_available := false
var owns_ball := false


func _ready() -> void:
    %Back.pressed.connect(_back)
    %Pairs.pressed.connect(_select.bind("pairs"))
    %Match.pressed.connect(_select.bind("match"))
    %Orchard.pressed.connect(_select.bind("orchard"))
    %Ball.pressed.connect(_choose_ball)


func set_ball_shop(owned: bool, can_buy: bool) -> void:
    owns_ball = owned
    %Ball.disabled = not (owned or can_buy)
    if owned:
        %Ball.text = "Поиграть с плетёным мячом"
    elif can_buy:
        %Ball.text = "Плетёный мяч · 5 листьев"
    else:
        %Ball.text = "Плетёный мяч · Нужно 5 листьев"

func _choose_ball() -> void:
    if owns_ball:
        hide()
        closed.emit()
        ball_play_requested.emit()
    else:
        ball_purchase_requested.emit()


func open(game_id := "") -> void:
    show()
    _select(game_id if GAMES.has(game_id) else "")


func set_rounds(incoming: Dictionary) -> void:
    for game in GAMES:
        var round = incoming.get(game)
        if round is Dictionary and _is_current(game, round):
            rounds[game] = round.duplicate(true)
    if is_instance_valid(board):
        board.sync_record(rounds.get(active_game, {}))


func _is_current(game: String, incoming: Dictionary) -> bool:
    var previous: Dictionary = rounds.get(game, {})
    var current_id := int(previous.get("id", 0))
    var incoming_id := int(incoming.get("id", 0))
    return incoming_id > current_id or (
        incoming_id == current_id
        and int(incoming.get("revision", 0)) >= int(previous.get("revision", 0))
    )


func checkpoint() -> void:
    if is_instance_valid(board):
        board.checkpoint()


func _select(game: String) -> void:
    if is_instance_valid(board):
        checkpoint()
        %Board.remove_child(board)
        board.queue_free()
        board = null
    active_game = game
    %Picker.visible = game.is_empty()
    %Back.text = "В домик" if game.is_empty() else "К сундуку"
    if game.is_empty():
        %Pairs.grab_focus()
        return
    board = GAMES[game].instantiate()
    %Board.add_child(board)
    board.round_saved.connect(_store_round.bind(game))
    if game == "pairs":
        board.guide_available = guide_available
        board.animal_requested.connect(func(species: String): animal_requested.emit(species))
    board.restore(rounds.get(game, {}))
    %Back.grab_focus()


func _store_round(round: Dictionary, game: String) -> void:
    rounds[game] = round.duplicate(true)
    round_saved.emit(game, round.duplicate(true))


func _back() -> void:
    if not active_game.is_empty():
        _select("")
        return
    hide()
    closed.emit()


func _unhandled_key_input(event: InputEvent) -> void:
    if visible and event.is_action_pressed("ui_cancel"):
        get_viewport().set_input_as_handled()
        _back()
