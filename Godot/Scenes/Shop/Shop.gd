extends Control

signal closed
signal catalog_requested
signal item_selected(id: String)
signal confirm_requested

const HATS := ["cap", "ranger", "crown"]
const FURNITURE := ["bed", "cushion", "lantern", "chest", "settee", "bath"]

var state := {}
var waiting := false
var furniture_only := false


func _ready() -> void:
    %Close.pressed.connect(_close)
    %DetailClose.pressed.connect(_close)
    %Back.pressed.connect(_back)
    %Hats.pressed.connect(_show_group.bind(true))
    %Furniture.pressed.connect(_show_group.bind(false))
    %Confirm.pressed.connect(_confirm)
    for id in HATS + FURNITURE:
        get_node("%" + id).pressed.connect(_select.bind(id))
    _show_group(true)


func open(local_catalog := false) -> void:
    waiting = false
    furniture_only = local_catalog
    %Hats.get_parent().visible = not furniture_only
    if furniture_only:
        _show_group(false)
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
    %Catalog.offset_top = -170.0 if furniture_only else (-370.0 if hats else -570.0)


func _render() -> void:
    var items: Dictionary = state.get("items", {})
    for id in HATS + FURNITURE:
        var row: Button = get_node("%" + id)
        var item: Dictionary = items.get(id, {})
        row.visible = not item.is_empty()
        if item.is_empty():
            continue
        row.get_node("Name").text = str(item.get("name", row.get_node("Name").text))
        row.get_node("Price").text = str(item.get("price", ""))
        row.accessibility_name = row.get_node("Name").text + " · " + row.get_node("Price").text
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
