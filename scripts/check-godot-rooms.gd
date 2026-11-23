extends SceneTree

const HOME := preload("res://Scenes/Levels/Home.tscn")
const LEVELS := [1, 4, 10]

var room: Node3D
var failures := 0
var meals := 0


func _initialize() -> void:
    _run.call_deferred()


func _run() -> void:
    root.size = Vector2i(540, 1088)
    room = HOME.instantiate()
    root.add_child(room)
    room.richi.meal_finished.connect(func(): meals += 1)
    _state(1, 25.1)
    await process_frame
    _expect(room.location == &"main" and not room.kitchen.visible and not room.bathroom.visible, "Main opens at 25.1 satiety with its own scenery")
    _tap("kitchen")
    _check_view(&"kitchen")
    _tap("main")
    _check_view(&"main")
    _tap("kitchen")
    _check_view(&"kitchen")
    _tap("main")
    _state(1, 25.0)
    await process_frame
    _check_view(&"kitchen")
    _expect(room.dining.state == &"waiting", "The hunger threshold starts the seated wait")
    _tap("main")
    await process_frame
    _expect(room.location == &"main", "Returning immediately does not repeat the same automatic visit")

    _state(4, 50.0)
    await process_frame
    _tap("chest")
    _state(4, 24.0)
    await process_frame
    _expect(room.location == &"main" and room.game_room.visible, "Hunger does not interrupt the games")
    room.game_room.get_node("%Back").pressed.emit()
    await process_frame
    _check_view(&"kitchen")
    _tap("main")

    for level in LEVELS:
        _state(level, 25.0)
        _tap("kitchen")
        _check_waiting_props(level)
        _tap("main")

    _expect(room._go_to_room(&"kitchen"), "Return to the kitchen when hungry")
    await _check_meal()
    _tap("bath")
    _check_view(&"bathroom")
    await _check_bath()
    _state(10, 50.0)
    _tap("main")
    _expect(room.bedroom.get_node("Лежанка").is_visible_in_tree(), "The installed bed appears in the main room")
    _tap("sleep")
    _state(10, 24.0, true)
    await create_timer(0.20).timeout
    _expect(room.night and room.location == &"main", "Hunger does not interrupt sleep")
    room.queue_free()
    await process_frame
    if failures == 0:
        print("PASS instant room taps and hunger, three ages with tableware, park cancellation and full meal, bath entry and exit, bed/sleep gate")
    quit(failures)


func _state(level: int, food: float, night := false) -> void:
    room.native_needs.food = food
    room.native_needs_updated = 0.0
    room._sync_state([JSON.stringify({
        "name": "Ричи", "level": level, "ball": true, "night": night, "leaves": 0,
        "needs": {"food": food, "clean": 50, "energy": 25, "joy": 50},
        "furniture": {"placed": ["bed"]},
    })])


func _check_view(place: StringName) -> void:
    var state := _interaction()
    _expect(state.location == str(place) and not state.moving, "Tap switches immediately to " + place)
    _expect(room.richi.transform.is_equal_approx(room._pose_in(place)), "The actor is already in " + place)
    _expect(room.room_camera.global_transform.is_equal_approx(room._camera_in(place)), "The camera is already in " + place)
    _expect(room.kitchen.visible == (place == &"kitchen") and room.bathroom.visible == (place == &"bathroom"),
        "Only the selected room is visible")
    _expect((state.controls.feed != null) == (place == &"kitchen")
        and (state.controls.wash != null) == (place == &"bathroom")
        and (state.controls.chest != null) == (place == &"main"), "Physical actions match " + place)


func _check_waiting_props(level: int) -> void:
    var dining: Node3D = room.dining
    _expect(dining.state == &"waiting" and not room.apple.visible and dining.bib.is_visible_in_tree(),
        "The hungry pet waits with a bib at level %d" % level)
    _expect(dining.spoon.get_parent() == dining.right_paw and dining.fork.get_parent() == dining.left_paw
        and dining.bib.get_parent() == dining.chest, "Independent cutlery and bib are attached to the animated bones")
    var grips := [[dining.spoon, ["RightHandMiddle2", "RightHandRing2"]],
                  [dining.fork, ["LeftHandThumb2", "LeftHandIndex1"]]]
    for grip: Array in grips:
        var utensil: Node3D = grip[0]
        var handle := utensil.find_child("Берёзовая рукоять", true, false) as MeshInstance3D
        if handle == null:
            _expect(false, "Wooden grip missing from " + str(utensil.name))
            continue
        _expect(handle.is_visible_in_tree(), "Wooden grip is visible on " + str(utensil.name))
        for finger: String in grip[1]:
            var gap := _distance_to_grip(handle, _bone(finger))
            _expect(gap < 0.010, "%s handle meets %s at level %d (gap %.1f mm)" % [utensil.name, finger, level, gap * 1000.0])
    var hip := _bone("Hips")
    var left := _bone("LeftToeBase")
    var right := _bone("RightToeBase")
    _expect(hip.y < 0.045 and left.y < 0.06 and right.y < 0.06 and left.distance_to(right) > 0.15,
        "Seat and both separate feet are close to the mat at level %d" % level)


# A nearby triangle edge proves the finger is close to the visible wooden mesh.
# The spoon is held near the handle end, several centimetres below its model origin.
func _distance_to_grip(handle: MeshInstance3D, finger: Vector3) -> float:
    var triangles := handle.global_transform * handle.mesh.get_faces()
    var nearest := INF
    for i in range(0, triangles.size(), 3):
        for k in 3:
            var a := triangles[i + k]
            var b := triangles[i + (k + 1) % 3]
            if not a.is_equal_approx(b):
                var point := Geometry3D.get_closest_point_to_segment(finger, a, b)
                nearest = minf(nearest, finger.distance_to(point))
    return nearest

func _check_meal() -> void:
    _tap("feed")
    _expect(room.dining.state == &"stowing" and not room.apple.visible, "Touching the bowl starts placing utensils")
    var held_before: Transform3D = room.dining.spoon.global_transform
    await _wait_until(func(): return not held_before.is_equal_approx(room.dining.spoon.global_transform), 2.0)
    room._sync_pause([true])
    await process_frame
    var held: Transform3D = room.dining.spoon.global_transform
    await create_timer(0.30).timeout
    _expect(held.is_equal_approx(room.dining.spoon.global_transform) and not room.apple.visible,
        "Visiting the park freezes the tableware gesture")
    room._sync_pause([false])
    await _wait_until(func(): return room.active_mode == &"feed", 4.0)
    _expect(room.dining.state == &"set" and room.active_mode == &"feed" and room.apple.visible
        and room.dining.spoon.get_parent() == room.dining and room.dining.fork.get_parent() == room.dining,
        "The apple is draggable only after both utensils rest by the bowl")

    var state := _interaction()
    if state.apple == null or state.grip == null:
        _expect(false, "The apple and active paws project into the viewport")
        return
    var fruit := _screen(state.apple)
    var paws := _screen(state.grip)
    _touch(fruit, true)
    _drag(fruit.lerp(paws, 0.37))
    _expect(room.apple.pointer == 0, "The first real drag grabs the apple")
    room._sync_pause([true])
    _expect(room.apple.pointer == -2 and room.apple.settling, "Leaving home releases a partial drag")
    room._sync_pause([false])
    await _wait_until(func(): return not room.apple.settling, 3.0)
    _expect(room.apple.global_position.is_equal_approx(room.apple.floor_position) and meals == 0,
        "Returning puts the apple back without awarding a meal")

    state = _interaction()
    _touch(_screen(state.apple), true)
    _drag(_screen(state.grip))
    _touch(_screen(state.grip), false)
    await _wait_until(func(): return room.meal_in_progress and room.richi.meal_phase() > 0.0, 4.0)
    _expect(room.meal_in_progress and room.richi.meal_phase() > 0, "A fresh drag reaches the actual palms")
    room._sync_pause([true])
    await process_frame
    var phase: float = room.richi.meal_phase()
    await create_timer(0.22).timeout
    _expect(is_equal_approx(phase, room.richi.meal_phase()) and meals == 0, "Visiting the park freezes a real bite")
    room._sync_pause([false])
    await _wait_until(func(): return meals > 0, 9.0)
    _expect(meals == 1 and room.location == &"kitchen" and room.active_mode == &"home" and room.native_needs.food > 25.0,
        "Returning from the park resumes the meal and credits it once")


func _check_bath() -> void:
    var floor_point: Vector3 = room.richi.global_position
    var inside: Vector3 = room.bathroom.get_node("Место для Ричи").global_position
    _expect(floor_point.distance_to(inside) > 0.6 and not room.bathroom.soap.visible, "Richi arrives beside the tub with the sponge put away")
    _tap("wash")
    _expect(room.bath_moving and room.richi.global_position.is_equal_approx(floor_point), "Tapping the tub starts an animated approach")
    var height := floor_point.y
    var timeout := create_timer(8.0)
    while room.bath_moving and timeout.time_left > 0.0:
        await process_frame
        height = maxf(height, room.richi.global_position.y)
    _expect(height > inside.y + 0.04 and inside.is_equal_approx(room.richi.global_position)
        and room.active_mode == &"bath" and room.bathroom.soap.visible,
        "Richi clears the rim and spawns the sponge only when inside")
    _tap("back")
    _expect(room.bath_moving and room.richi.global_position.is_equal_approx(inside), "Exit animates back over the rim")
    await _wait_until(func(): return not room.bath_moving, 8.0)
    _expect(room.location == &"bathroom" and room.active_mode == &"home"
        and floor_point.is_equal_approx(room.richi.global_position), "Exit returns to a dry spot in the bathroom")


func _bone(name: String) -> Vector3:
    var skeleton: Skeleton3D = room.richi.skeleton
    return skeleton.to_global(skeleton.get_bone_global_pose(skeleton.find_bone("mixamorig_" + name)).origin)


func _interaction() -> Dictionary:
    return JSON.parse_string(room._interaction_state([]))


func _screen(point: Dictionary) -> Vector2:
    return Vector2(point.x, point.y) * root.get_visible_rect().size


func _tap(control: String) -> void:
    var point: Variant = _interaction().controls[control]
    if point == null:
        _expect(false, "Visible control required for " + control)
        return
    _touch(_screen(point), true)
    _touch(_screen(point), false)


func _touch(point: Vector2, pressed: bool) -> void:
    var event := InputEventScreenTouch.new()
    event.position = point
    event.pressed = pressed
    root.push_input(event, true)


func _drag(point: Vector2) -> void:
    var event := InputEventScreenDrag.new()
    event.position = point
    root.push_input(event, true)


func _wait_until(condition: Callable, seconds: float) -> void:
    var timeout := create_timer(seconds)
    while not condition.call() and timeout.time_left > 0.0:
        await process_frame


func _expect(value: bool, label: String) -> void:
    if not value:
        failures += 1
        push_error(label)
