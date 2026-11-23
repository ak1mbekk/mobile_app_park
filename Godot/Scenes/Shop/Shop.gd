extends Control

signal closed
signal catalog_requested
signal item_selected(id: String)
signal confirm_requested

const CATALOG = preload("res://Scenes/Shop/ShopCatalog.gd")

var state := {}
var waiting := false
var preview_origin: Button
var scroll_finger := -1
var touch_start := Vector2.ZERO
var scroll_start := 0
var swiping := false


func _ready() -> void:
    %Close.pressed.connect(_close)
    %DetailClose.pressed.connect(_close)
    %Back.pressed.connect(_back)
    %Info.pressed.connect(_toggle_info)
    %Hats.pressed.connect(_show_group.bind(true))
    %Furniture.pressed.connect(_show_group.bind(false))
    %Confirm.pressed.connect(_confirm)
    for id in CATALOG.HATS + CATALOG.FURNITURE:
        var row: Button = get_node("%" + id)
        row.get_node("Picture").texture = row.get_meta("picture")
        row.pressed.connect(_select.bind(id))
        row.gui_input.connect(_row_touch.bind(row))
    var furniture := CATALOG.FURNITURE.duplicate()
    furniture.sort_custom(func(a, b): return CATALOG.ITEMS[a].price < CATALOG.ITEMS[b].price)
    for index in furniture.size():
        %FurnitureList.move_child(get_node("%" + furniture[index]), index)
    resized.connect(_fit_catalog)
    _show_group(true)
    _fit_catalog()


func open() -> void:
    waiting = false
    preview_origin = null
    scroll_finger = -1
    _set_info(false)
    show()
    _render()
    %Close.grab_focus()


func set_state(data: Dictionary) -> void:
    state = data
    waiting = false
    _render()


func _select(id: String) -> void:
    preview_origin = get_node("%" + id)
    item_selected.emit(id)


# Touch-to-mouse emulation is disabled for the games. A row owns its touch until release.
func _row_touch(event: InputEvent, row: Button) -> void:
    if not (event is InputEventScreenTouch or event is InputEventScreenDrag):
        return
    row.accept_event()
    var point: Vector2 = row.get_global_transform_with_canvas() * event.position
    if event is InputEventScreenTouch and event.pressed:
        if scroll_finger == -1:
            scroll_finger = event.index
            touch_start = point
            scroll_start = %Scroll.scroll_vertical
            swiping = false
        return
    if event.index != scroll_finger:
        return
    if touch_start.distance_to(point) > 10.0:
        swiping = true
    if swiping:
        %Scroll.scroll_vertical = scroll_start + roundi(touch_start.y - point.y)
    if event is InputEventScreenTouch:
        scroll_finger = -1
        if not swiping and not event.canceled and Rect2(Vector2.ZERO, row.size).has_point(event.position):
            row.pressed.emit()


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
    %Scroll.scroll_vertical = 0


func _fit_catalog() -> void:
    %Catalog.offset_top = -minf(size.y * 0.89, 1100.0)


func _toggle_info() -> void:
    _set_info(not %InfoPanel.visible)


func _set_info(expanded: bool) -> void:
    %InfoPanel.visible = expanded
    %Tabs.visible = not expanded
    %Scroll.visible = not expanded
    %Info.text = "К товарам" if expanded else "О лавке"
    %Info.accessibility_name = "Вернуться к товарам" if expanded else "О лавке и росте питомца"


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
    %FullGoal.text = str(state.get("goal", ""))
    if state.has("next_goal"):
        var next_goal := str(state.next_goal)
        %Goal.text = "Цель · " + next_goal if not next_goal.is_empty() else "Вся мебель собрана"
    else:
        %Goal.text = %FullGoal.text
    %Goal.visible = not %Goal.text.is_empty()
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
            if is_instance_valid(preview_origin) and preview_origin.is_visible_in_tree():
                preview_origin.grab_focus()
            else:
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
        elif %InfoPanel.visible:
            _set_info(false)
            %Info.grab_focus()
        else:
            _close()
