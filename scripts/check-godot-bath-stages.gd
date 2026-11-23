extends SceneTree

# After -- pass a screenshot directory (or - to skip), optionally followed by width and height.
const HOME := preload("res://Scenes/Levels/Home.tscn")
const CATALOG := preload("res://Scenes/Shop/ShopCatalog.gd")
const STAGES := ["base-bath", "bath-carved", "bath", "bath-copper", "bath-faience"]
const PRICES := [0, 25, 55, 85, 120]

var room
var failures := 0
var profile := ""
var output := ""
var resources := {}
var comparison_camera: Transform3D
var comparison_fov: float
var washes := 0

func _initialize() -> void:
    _run.call_deferred()

func _run() -> void:
    var args := OS.get_cmdline_user_args()
    if not args.is_empty() and args[0] != "-":
        output = args[0]
        if DirAccess.make_dir_recursive_absolute(output) != OK:
            push_error("Cannot create screenshot directory: " + output)
            quit(1)
            return
    root.size = Vector2i(args[1].to_int(), args[2].to_int()) if args.size() == 3 else Vector2i(390, 844)
    var folder := "animal-park-bath-qa-%s-%s" % [OS.get_process_id(), Time.get_ticks_usec()]
    ProjectSettings.set_setting("application/config/use_custom_user_dir", true)
    ProjectSettings.set_setting("application/config/custom_user_dir_name", folder)
    profile = OS.get_user_data_dir()
    if profile.get_file() != folder or DirAccess.dir_exists_absolute(profile) or DirAccess.make_dir_recursive_absolute(profile) != OK:
        push_error("Cannot isolate the bath test's save")
        quit(1)
        return
    var fixture := ConfigFile.new()
    fixture.set_value("home", "leaves", 24)
    fixture.set_value("home", "owned", ["bath", "bath-tile"])
    fixture.set_value("home", "placed", ["bath", "bath-tile"])
    if fixture.save("user://home.cfg") != OK:
        push_error("Cannot write legacy fixture")
        quit(1)
        return
    _load_room()
    for index in STAGES.size():
        var id: String = STAGES[index]
        if not _expect(CATALOG.ITEMS.get(id, {}).get("price", -1) == PRICES[index] and room.shop.has_node("%" + id), "Shop card and correct price for " + id):
            _finish()
            return
    var enamel := _visible_prop()
    _expect(enamel != null and enamel.scene_file_path.ends_with("/EnamelBath.tscn") and room.native_leaves == 24 and room.native_owned.has("bath"), "Legacy paid enamel is equipped on load")
    var previous_placed: Array = room.native_placed.duplicate()
    _preview("bath-carved")
    _expect(_visible_prop() != enamel and room.active_mode == &"bath-preview", "Preview displays the carved bath in the bathroom")
    _expect(room.shop.get_node("%Confirm").disabled and not room.native_owned.has("bath-carved"), "24 leaves cannot pay for the 25-leaf tub")
    room.shop.get_node("%Confirm").pressed.emit()
    _expect(room.native_leaves == 24 and room.native_placed == previous_placed and not room.native_owned.has("bath-carved"), "An unaffordable confirmation preserves balance and equipment")
    room.shop.get_node("%Back").pressed.emit()
    _expect(_visible_prop() == enamel, "Cancel restores equipped enamel")
    _choose("base-bath")
    _expect(room.native_leaves == 24 and room.native_owned.has("bath") and not room.native_placed.has("bath"), "Player selects wood while retaining paid enamel")
    _check_tile()

    # A second save starts with only the independent wall tiles, so every debit is real.
    await _discard_room()
    fixture.set_value("home", "leaves", 285)
    fixture.set_value("home", "owned", ["bath-tile"])
    fixture.set_value("home", "placed", ["bath-tile"])
    _expect(fixture.save("user://home.cfg") == OK, "Write funded profile")
    var balance := 285
    for index in STAGES.size():
        _load_room()
        var id: String = STAGES[index]
        if index > 0:
            var before := _visible_prop()
            _preview(id)
            var candidate := _visible_prop()
            _expect(candidate != before and room.native_leaves == balance, "Preview differs from installed tub without payment: " + id)
            room.shop.get_node("%Back").pressed.emit()
            _expect(_visible_prop() == before, "Cancel restores the previous stage: " + id)
            _choose(id)
            balance -= int(PRICES[index])
            _expect(_visible_prop() == candidate and room.native_leaves == balance, "One purchase installs exactly its preview and debits the price: " + id)
            await _discard_room()
            _load_room()
        _check_tile()
        var paid := 0
        for stage: String in STAGES.slice(1):
            if room.native_placed.has(stage):
                paid += 1
            _expect(room.native_owned.has(stage) == (STAGES.find(stage) <= index), "Correct collection after restart: " + stage)
        _expect(room.native_leaves == balance and paid == mini(index, 1) and (index == 0 or room.native_placed.has(id)), "Restart preserves mutually exclusive placement and balance: " + id)
        await _exercise_wash(id, index)
        await _discard_room()
    _expect(resources.size() == 5, "All five stages contain distinct scene resources")
    _load_room()
    _choose("bath")
    _expect(room.native_leaves == 0 and room.native_placed.has("bath") and not room.native_placed.has("bath-faience"), "Switching from faience to owned enamel is free at zero balance")
    _check_tile()
    _finish()

func _load_room() -> void:
    room = HOME.instantiate()
    root.add_child(room)

func _discard_room() -> void:
    room.queue_free()
    await process_frame
    room = null

func _preview(id: String) -> void:
    if not room.shop.visible:
        room.get_node("%Shop").pressed.emit()
    room.shop.get_node("%Furniture").pressed.emit()
    room.shop.get_node("%" + id).pressed.emit()

func _choose(id: String) -> void:
    _preview(id)
    room.shop.get_node("%Confirm").pressed.emit()

func _check_tile() -> void:
    _expect(room.native_placed.has("bath-tile") and room.bath_room.get_node("Архитектура/Плитка").visible, "Wall tiles stay installed independently")

func _visible_prop() -> Node3D:
    var visible_props: Array[Node3D] = []
    for child: Node3D in room.bathroom.get_node("Купель").get_children():
        if child.visible and not child.scene_file_path.is_empty():
            visible_props.append(child)
    if not _expect(visible_props.size() == 1, "Exactly one tub scene is visible"):
        return null
    return visible_props[0]

func _exercise_wash(id: String, index: int) -> void:
    room._restore_navigation({"location": "bathroom", "mode": "bath"})
    await process_frame
    var bath = room.bathroom
    var prop := _visible_prop()
    if not _expect(prop != null and prop.is_visible_in_tree() and room.active_mode == &"bath" and bath.soap.visible, "Playable tub after restart: " + id):
        return
    resources[prop.scene_file_path] = true
    var camera := root.get_camera_3d()
    if index == 0:
        comparison_camera = camera.global_transform
        comparison_fov = camera.fov
    _expect(camera.global_transform.is_equal_approx(comparison_camera) and is_equal_approx(camera.fov, comparison_fov), "Identical gameplay camera for " + id)
    var water: MeshInstance3D = bath.get_node("Купель/Вода")
    var bounds := AABB()
    var found := false
    for model: MeshInstance3D in prop.find_children("*", "MeshInstance3D", true, false):
        if model.mesh and model.is_visible_in_tree():
            var box := model.global_transform * model.get_aabb()
            bounds = box if not found else bounds.merge(box)
            found = true
    var water_bounds := water.global_transform * water.get_aabb()
    var center := water_bounds.get_center()
    _expect(found and water.is_visible_in_tree() and bounds.has_point(center), "Visible geometry surrounds shared water: " + id)
    _expect(bounds.size.x >= water_bounds.size.x * 0.98 and bounds.size.z >= water_bounds.size.z * 0.98, "Tub footprint accommodates water: " + id)
    if not output.is_empty():
        await RenderingServer.frame_post_draw
        var frame := root.get_texture().get_image()
        var path := output.path_join("%02d-%s.png" % [index + 1, id])
        _expect(frame != null and frame.save_png(path) == OK, "Write screenshot " + path)
    var state: Dictionary = JSON.parse_string(room._interaction_state([]))
    var view := root.get_visible_rect().size
    var sponge := Vector2(state.sponge.x, state.sponge.y) * view
    var chest := Vector2(state.scrubCenter.x, state.scrubCenter.y) * view
    _touch(sponge, true)
    _drag(chest)
    for stroke in 8:
        _drag(chest + Vector2(view.x * (0.08 if stroke % 2 == 0 else -0.08), 0.0))
    _touch(chest, false)
    if not _expect(bath.phase == &"ready" and bath.jug_water.is_visible_in_tree(), "Actual sponge strokes fill the lather meter: " + id):
        return
    state = JSON.parse_string(room._interaction_state([]))
    var target := Vector2(state.pourTarget.x, state.pourTarget.y) * view
    if index % 2 == 1:
        target.x = chest.x * 2.0 - target.x
    var before := washes
    bath.washed.connect(func(): washes += 1)
    _touch(Vector2(state.jug.x, state.jug.y) * view, true)
    _drag(target)
    await create_timer(0.55).timeout
    _expect(bath.effects.water.visible and bath.rinse_progress > 0.0, "Held pitcher produces a working stream: " + id)
    var deadline := create_timer(2.5)
    while bath.phase != &"done" and deadline.time_left > 0:
        await process_frame
    _touch(target, false)
    _expect(bath.phase == &"done" and washes == before + 1, "One complete wash on " + id)

func _touch(point: Vector2, pressed: bool) -> void:
    var event := InputEventScreenTouch.new()
    event.position = point
    event.pressed = pressed
    root.push_input(event, true)

func _drag(point: Vector2) -> void:
    var event := InputEventScreenDrag.new()
    event.position = point
    root.push_input(event, true)

func _expect(ok: bool, label: String) -> bool:
    if not ok:
        failures += 1
        push_error(label)
    return ok

func _finish() -> void:
    if room:
        room.free()
    DirAccess.remove_absolute(profile.path_join("home.cfg"))
    DirAccess.remove_absolute(profile)
    if failures == 0:
        print("PASS five distinct playable tubs, legacy enamel, native catalog/previews, exact purchases, free switching, independent tiles and reload")
    quit(0 if failures == 0 else 1)
