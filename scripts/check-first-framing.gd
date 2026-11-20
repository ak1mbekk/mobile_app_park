extends SceneTree

const FIRST_MEETING := preload("res://Scenes/Levels/FirstMeeting.tscn")
const PORTRAIT_SIZES := [Vector2i(320, 568), Vector2i(390, 844), Vector2i(430, 932)]

var failures := 0


func _initialize() -> void:
    _run.call_deferred()


func _run() -> void:
    var sizes: Array[Vector2i] = []
    for argument in OS.get_cmdline_user_args():
        var dimensions := argument.split("x")
        if dimensions.size() != 2 or not dimensions[0].is_valid_int() or not dimensions[1].is_valid_int():
            push_error("Pass portrait sizes after --, for example 390x844")
            quit(2)
            return
        var size := Vector2i(dimensions[0].to_int(), dimensions[1].to_int())
        if size.x <= 0 or size.y <= size.x:
            push_error("Expected a positive portrait size: " + argument)
            quit(2)
            return
        sizes.append(size)
    if sizes.is_empty():
        sizes.assign(PORTRAIT_SIZES)
    for size in sizes:
        await _check_meeting(size)
    quit(1 if failures else 0)


func _check_meeting(size: Vector2i) -> void:
    var previous_failures := failures
    var viewport: Viewport = root
    if DisplayServer.get_name() == "headless":
        var stage := SubViewport.new()
        stage.size = size
        stage.own_world_3d = true
        root.add_child(stage)
        viewport = stage
    else:
        root.size = size

    var scene := FIRST_MEETING.instantiate()
    var welcome = scene.get_node("Знакомство")
    var save_path := "user://first-framing-%d-%d.cfg" % [OS.get_process_id(), Time.get_ticks_usec()]
    welcome.save_path = save_path
    viewport.add_child(scene)
    await create_timer(0.5).timeout

    var camera := viewport.get_camera_3d()
    var apple = scene.get_node("Яблоко")
    var screen := viewport.get_visible_rect()
    var bounds := _visible_apple_bounds(camera, apple.whole_apple_visual)
    var floor_fraction := (screen.end.y - bounds.end.y) / screen.size.y
    var fruit := camera.unproject_position(apple.global_position + apple.center_offset())
    var paws := camera.unproject_position(apple.palm_center())
    _expect(apple.is_visible_in_tree() and not welcome.panel.visible, "The opening starts with an untouched apple")
    _expect(bounds.has_area() and screen.encloses(bounds.grow(4.0)), "The entire visible apple is inside the portrait")
    _expect(floor_fraction >= 0.08 and floor_fraction <= 0.14, "Free floor below the apple stays within 8–14%")
    _expect(screen.has_point(paws) and fruit.distance_to(paws) > screen.size.x * 0.32, "The apple and palms leave space for the drag")

    var miss := screen.position + screen.size * Vector2(0.63, 0.89)
    await _drag(viewport, apple, func(): return miss)
    var returned := await _wait_for(func(): return not apple.settling, 1.0)
    _expect(returned and not apple.delivered and apple.is_visible_in_tree()
        and apple.global_position.is_equal_approx(apple.floor_position) and not welcome.panel.visible,
        "Missing the paws returns the apple and keeps the name panel closed")

    await _drag(viewport, apple, func(): return camera.unproject_position(apple.palm_center()))
    var naming := await _wait_for(func(): return welcome.panel.visible, 8.0)
    var saved := ConfigFile.new()
    _expect(naming and apple.delivered and not apple.visible, "Feeding from the paws opens the name panel")
    _expect(saved.load(save_path) == OK and saved.get_value("meeting", "stage", "") == "name", "Naming is saved in the isolated profile")
    for path in [save_path, save_path + ".tmp"]:
        if FileAccess.file_exists(path):
            _expect(DirAccess.remove_absolute(ProjectSettings.globalize_path(path)) == OK, "The temporary profile is removed")

    if failures == previous_failures:
        print("PASS %dx%d, %.1f%% floor below the apple, miss and retry reach naming" % [size.x, size.y, floor_fraction * 100.0])
    if viewport == root:
        scene.queue_free()
    else:
        viewport.queue_free()
    await process_frame


func _visible_apple_bounds(camera: Camera3D, apple_model: Node3D) -> Rect2:
    var minimum := Vector2(INF, INF)
    var maximum := Vector2(-INF, -INF)
    for part: MeshInstance3D in apple_model.find_children("*", "MeshInstance3D", true, false):
        if not part.is_visible_in_tree() or not part.mesh or not (part.layers & camera.cull_mask):
            continue
        for surface in part.mesh.get_surface_count():
            var vertices: PackedVector3Array = part.mesh.surface_get_arrays(surface)[Mesh.ARRAY_VERTEX]
            for vertex in vertices:
                var pixel := camera.unproject_position(part.to_global(vertex))
                minimum = minimum.min(pixel)
                maximum = maximum.max(pixel)
    return Rect2(minimum, maximum - minimum)


func _drag(viewport: Viewport, apple: MeshInstance3D, destination: Callable) -> void:
    var camera := viewport.get_camera_3d()
    var start := camera.unproject_position(apple.global_position + apple.center_offset())
    _touch(viewport, start, true)
    _expect(apple.pointer == 0, "Touching the visible apple picks it up")
    for step in 12:
        var drag := InputEventScreenDrag.new()
        drag.position = start.lerp(destination.call(), (step + 1) / 12.0)
        viewport.push_input(drag, true)
        await process_frame
    _touch(viewport, destination.call(), false)


func _touch(viewport: Viewport, point: Vector2, pressed: bool) -> void:
    var event := InputEventScreenTouch.new()
    event.position = point
    event.pressed = pressed
    viewport.push_input(event, true)


func _wait_for(condition: Callable, seconds: float) -> bool:
    var deadline := create_timer(seconds)
    while deadline.time_left > 0.0 and not condition.call():
        await process_frame
    return condition.call()


func _expect(condition: bool, message: String) -> void:
    if not condition:
        failures += 1
        push_error(message)
