extends SceneTree
const HOME = preload("res://Scenes/Levels/Home.tscn")
var failures := 0
var room: Node3D

func _initialize() -> void:
    _run.call_deferred()

func _run() -> void:
    ProjectSettings.set_setting("application/config/use_custom_user_dir", true)
    ProjectSettings.set_setting("application/config/custom_user_dir_name", "animal-park-food-qa-%d" % OS.get_process_id())
    DirAccess.make_dir_recursive_absolute(OS.get_user_data_dir())
    root.size = Vector2i(540, 960)
    room = HOME.instantiate()
    root.add_child(room)
    await process_frame
    room.native_leaves = 3
    room.native_needs.food = 50.0
    room.native_needs_updated = Time.get_unix_time_from_system()
    room._go_to_room(&"kitchen")
    await create_timer(0.7).timeout
    _expect(room.kitchen_food.bowl_fruit.get_child_count() == 3, "The initial bowl contains visible apples")
    _expect(room.kitchen_food.apple_button.text.is_empty() and room.kitchen_food.pear_button.text.is_empty(), "Fruit choices have images, not captions")
    _expect(room.kitchen_food.pear_button.get_node("Price").visible and not room.kitchen_food.pear_button.get_node("Stock").visible, "The price is separate from stored portions")
    _expect(room.kitchen_food.row.get_global_rect().position.y > 600, "Compact fruit choices sit on the floor")
    _touch_button(room.kitchen_food.pear_button)
    await create_timer(0.6).timeout
    var id: int = room.kitchen_food.portion_id()
    _expect(room.native_leaves == 2 and room.kitchen_food.state.pear == 1, "One pear costs exactly one leaf")
    _expect(not room.kitchen_food.pear_button.get_node("Price").visible and room.kitchen_food.pear_button.get_node("Stock").text == "×1", "Owned fruit shows a stock badge instead of the price")
    _expect(room.apple.food_kind == "pear" and room.apple.pear_visual.visible, "The pear uses its own imported model")
    _expect(room.apple.floor_position.distance_to(room.kitchen.get_node("Метка миски").global_position) < 0.1, "The draggable fruit starts inside the bowl")
    var camera: Camera3D = room.room_camera
    var from: Vector2 = camera.unproject_position(room.apple.global_position + room.apple.center_offset())
    room.apple.try_grab(from, 0)
    room.apple.drag_to(from + Vector2(-100, -20))
    room.apple.drop_at(from + Vector2(-100, -20))
    await create_timer(0.35).timeout
    _expect(room.kitchen_food.portion_id() == id and room.native_leaves == 2 and room.kitchen_food.state.pear == 1, "A missed drag preserves the purchased portion")
    room.queue_free()
    await process_frame
    room = HOME.instantiate()
    root.add_child(room)
    await process_frame
    _expect(room.kitchen_food.portion_id() == id and room.native_leaves == 2, "Restart restores the same paid portion")
    room._go_to_room(&"kitchen")
    await create_timer(0.7).timeout
    room._offer_food("pear")
    await create_timer(0.6).timeout
    _expect(room.native_leaves == 2, "Offering the saved pear never charges twice")
    var result: Dictionary = room.kitchen_food.finish(id)
    _expect(result.accepted and room.kitchen_food.state.pear == 0 and room.native_needs.food > 89.9, "Eating uses one pear and restores 40 satiety")
    var food: float = room.native_needs.food
    _expect(not room.kitchen_food.finish(id).accepted and room.native_needs.food == food, "Duplicate completion is ignored")
    room._show_room(false)
    room._offer_food("pear")
    _expect(room.native_leaves == 1 and room.kitchen_food.state.pear == 1, "A new pear is a new purchase")
    room._offer_food("apple")
    _expect(room.native_leaves == 1 and room.kitchen_food.state.pear == 1 and room.apple.food_kind == "apple", "Choosing the free apple keeps the pear in stock")
    room._offer_food("pear")
    _expect(room.native_leaves == 1, "Selecting stored food does not buy it again")
    room.native_leaves = 0
    room.kitchen_food.restore({})
    _expect(not room.kitchen_food.prepare("pear") and room.native_leaves == 0, "Insufficient leaves do not create food or debt")
    _expect(room.kitchen_food.prepare("apple"), "The apple remains free at zero leaves")
    room.queue_free()
    await process_frame
    if failures == 0:
        print("PASS native food: bowl, pear model, buy/stock, miss/restart, idempotent consumption, free apple, no debt")
    quit(1 if failures else 0)

func _expect(value: bool, message: String) -> void:
    if not value:
        failures += 1
        push_error(message)

func _touch_button(button: Button) -> void:
    for down in [true, false]:
        var touch := InputEventScreenTouch.new()
        touch.index = 0
        touch.position = button.get_global_rect().get_center()
        touch.pressed = down
        root.push_input(touch, true)
