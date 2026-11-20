extends "res://Scenes/Games/GameRound.gd"

const TILE = preload("res://Scenes/Games/GameTile.tscn")
const ANIMALS := {
    "capybara": ["Капибара", preload("res://Scenes/Games/Art/game-toy-capybara.webp")],
    "lemur": ["Лемур", preload("res://Scenes/Games/Art/game-toy-lemur.webp")],
    "raccoon": ["Енот", preload("res://Scenes/Games/Art/game-toy-raccoon.webp")],
    "bison": ["Зубр", preload("res://Scenes/Games/Art/game-toy-bison.webp")],
    "tamarin": ["Тамарин", preload("res://Scenes/Games/Art/game-toy-tamarin.webp")],
    "caracal": ["Каракал", preload("res://Scenes/Games/Art/game-toy-caracal.webp")],
}

var cards: Array = []
var opened: Array = []
var paired: Array = []
var moves := 0
var finished := false


func _ready() -> void:
    %Again.pressed.connect(_new_round)
    %Chest.pressed.connect(func(): menu_requested.emit())


func restore(record: Dictionary) -> void:
    super.restore(record)
    var old_cards = record.get("cards", [])
    var old_paired = record.get("paired", [])
    var old_opened = record.get("opened", [])
    if not _valid_board(old_cards, old_paired, old_opened):
        _new_round()
        return
    cards = old_cards.duplicate()
    paired = old_paired.duplicate()
    opened = old_opened.map(func(index): return int(index))
    moves = maxi(0, int(record.get("moves", 0)))
    finished = paired.size() * 2 == cards.size()
    if finished and reward.is_empty() and record.has("rewardXp"):
        reward = {"leaves": 5, "xp": int(record.rewardXp)}
    if round_id == 0 and not finished:
        begin_round()
        _save_round()
    _make_grid()
    _paint()
    if opened.size() == 2 and not finished:
        _close_mismatch()


func _valid_board(old_cards: Variant, old_paired: Variant, old_opened: Variant) -> bool:
    if not old_cards is Array or old_cards.size() not in [6, 12]:
        return false
    if not old_paired is Array or not old_opened is Array or old_opened.size() > 2:
        return false
    for animal in old_cards:
        if not ANIMALS.has(animal) or old_cards.count(animal) != 2:
            return false
    for animal in old_paired:
        if not old_cards.has(animal) or old_paired.count(animal) != 1:
            return false
    var indices: Array[int] = []
    for value in old_opened:
        if not (value is int or value is float) or value != int(value):
            return false
        var index := int(value)
        if index < 0 or index >= old_cards.size() or indices.has(index):
            return false
        indices.append(index)
        if old_paired.has(old_cards[index]):
            return false
    return true


func _new_round() -> void:
    begin_round()
    cards = ANIMALS.keys() + ANIMALS.keys()
    cards.shuffle()
    opened.clear()
    paired.clear()
    moves = 0
    finished = false
    _save_round()
    _make_grid()
    _paint()


func _make_grid() -> void:
    for tile in %Grid.get_children():
        %Grid.remove_child(tile)
        tile.queue_free()
    %Grid.columns = 4 if cards.size() == 12 else 3
    %Board.ratio = 1.02 if cards.size() == 12 else 1.26
    for index in cards.size():
        var tile := TILE.instantiate()
        tile.pressed.connect(_flip.bind(index))
        %Grid.add_child(tile)
        tile.fit_toy()


func _flip(index: int) -> void:
    if finished or opened.size() == 2 or paired.has(cards[index]) or opened.has(index):
        return
    opened.append(index)
    if opened.size() == 2:
        moves += 1
        if cards[int(opened[0])] == cards[index]:
            paired.append(cards[index])
            opened.clear()
            finished = paired.size() * 2 == cards.size()
    _save_round()
    _paint()
    %Grid.get_child(index).reveal()
    if opened.size() == 2:
        _close_mismatch()


func _close_mismatch() -> void:
    await get_tree().create_timer(0.68, false).timeout
    opened.clear()
    _save_round()
    _paint()


func _save_round() -> void:
    commit({
        "cards": cards.duplicate(), "opened": opened.duplicate(),
        "paired": paired.duplicate(), "moves": moves,
        "finished": finished, "won": finished, "winShown": finished,
    })


func _paint() -> void:
    for index in cards.size():
        var species: Array = ANIMALS[cards[index]]
        var matched: bool = paired.has(cards[index])
        var show_face: bool = matched or opened.has(index)
        var description: String = species[0] if show_face else "Открыть карточку %d" % (index + 1)
        if matched:
            description += " · пара найдена"
        %Grid.get_child(index).paint(species[1] if show_face else null, description, false, matched)
    %Goal.text = "Пары %d / %d" % [paired.size(), cards.size() / 2.0]
    %Counter.text = "Ходы %d" % moves
    _update_result()


func _update_result() -> void:
    %ResultActions.visible = finished
    if finished:
        var payout := reward_text()
        %Hint.text = "Все пары найдены!" if payout.is_empty() else "Все пары найдены!\n" + payout
    elif opened.size() == 2:
        %Hint.text = "Эти звери разные"
    elif opened.size() == 1:
        %Hint.text = ANIMALS[cards[int(opened[0])]][0] + " · найди пару"
    else:
        %Hint.text = "Открывай по две карточки."
