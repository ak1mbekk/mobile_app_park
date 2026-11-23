extends Control

signal closed
signal catalog_requested
signal item_selected(id: String)
signal confirm_requested

const CATALOG = preload("res://Scenes/Shop/ShopCatalog.gd")

var state := {}
var waiting := false


func _ready() -> void:
    %Close.pressed.connect(_close)
    %DetailClose.pressed.connect(_close)
    %Back.pressed.connect(_back)
    %Hats.pressed.connect(_show_group.bind(true))
    %Furniture.pressed.connect(_show_group.bind(false))
    %Confirm.pressed.connect(_confirm)
    for id in CATALOG.HATS + CATALOG.FURNITURE:
        get_node("%" + id).pressed.connect(_select.bind(id))
    var furniture := CATALOG.FURNITURE.duplicate()
    furniture.sort_custom(func(a, b): return CATALOG.ITEMS[a].price < CATALOG.ITEMS[b].price)
    for index in furniture.size():
        %FurnitureList.move_child(get_node("%" + furniture[index]), index)
    _show_group(true)


func open() -> void:
    waiting = false
    show()
    _render()
    %Close.grab_focus()


func set_state(data: Dictionary) -> void:
    state = data
    waiting = false
    _render()


func _select(id: String) -> void:
    item_selected.emit(id)


func _confirm() -> void:
    if waiting or %Confirm.disabled:
        return
    waiting = true
    %Confirm.disabled = true
    confirm_requested.emit()


func _back() -> void:
    catalog_requested.emit()


func _close() -> void:
    hide()
    closed.emit()


func _show_group(hats: bool) -> void:
    %HatList.visible = hats
    %FurnitureList.visible = not hats
    %Hats.set_pressed_no_signal(hats)
    %Furniture.set_pressed_no_signal(not hats)
    %Catalog.offset_top = -minf(size.y * 0.88, 920.0)


func _render() -> void:
    var items: Dictionary = state.get("items", {})
    for id in CATALOG.HATS + CATALOG.FURNITURE:
        var row: Button = get_node("%" + id)
        var item: Dictionary = items.get(id, {})
        row.visible = not item.is_empty()
        if item.is_empty():
            continue
        var title := str(item.get("name", ""))
        var price := str(item.get("price", ""))
        var rarity := str(item.get("detail", "")).get_slice("\n", 0).get_slice(" · ", 0)
        var availability := str(item.get("availability", ""))
        row.get_node("Name").text = title
        row.get_node("Price").text = price + "\n" + rarity
        row.get_node("Availability").text = availability
        row.accessibility_name = " · ".join([title, price, rarity, availability])
    %Growth.text = str(state.get("growth", ""))
    %Goal.text = str(state.get("goal", ""))
    var wallet := "Листья %d" % int(state.get("wallet", 0))
    %Wallet.text = wallet
    %DetailWallet.text = wallet
    var selected := str(state.get("selected", ""))
    var chosen: Dictionary = items.get(selected, {})
    var detail := not chosen.is_empty()
    var change_panel: bool = %Detail.visible != detail
    %Catalog.visible = not detail
    %Detail.visible = detail
    if not detail:
        if change_panel and visible:
            %Close.grab_focus()
        return
    %ItemTitle.text = str(chosen.get("name", ""))
    %ItemDescription.text = str(chosen.get("detail", ""))
    %ItemPicture.texture = get_node("%" + selected).get_node("Picture").texture
    %Confirm.text = str(state.get("confirm_label", ""))
    %Confirm.disabled = waiting or not bool(state.get("confirm_enabled", false))
    %Status.text = str(state.get("status", ""))
    %Status.visible = not %Status.text.is_empty()
    if change_panel and visible:
        %Back.grab_focus()


func _unhandled_key_input(event: InputEvent) -> void:
    if visible and event.is_action_pressed("ui_cancel"):
        get_viewport().set_input_as_handled()
        if %Detail.visible:
            _back()
        else:
            _close()
