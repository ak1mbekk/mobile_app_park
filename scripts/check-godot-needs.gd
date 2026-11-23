extends SceneTree

const HOME := preload("res://Scenes/Levels/Home.tscn")

class IsolatedHome:
    extends "res://Scenes/Home/Home.gd"

    func _load_home() -> void:
        native_bed_goal_dismissed = true
        _update_native_stats()
        _refresh_native_needs()

    func _save_home() -> bool:
        return true

    func _advance_native_needs() -> void:
        pass # The meal and sleep cases exercise exact edges, independent of wall time.

    func _notify_host(_event_name: String) -> void:
        pass # Hosted acknowledgements are injected through the same state bridge below.

var room: Node3D
var actor: Node3D
var presentation: Node3D
var failures := 0
var meals := 0
var output := ""

func _initialize() -> void:
    _run.call_deferred()

func _run() -> void:
    var args := OS.get_cmdline_user_args()
    if not args.is_empty() and DisplayServer.get_name() != "headless":
        output = args[0]
        DirAccess.make_dir_recursive_absolute(output)
    root.size = Vector2i(390, 844)
    room = HOME.instantiate()
    var mesh: ArrayMesh = room.growth_mesh
    room.set_script(IsolatedHome)
    room.growth_mesh = mesh
    root.add_child(room)
    room.get_node("%NeedsTick").stop()
    actor = room.richi
    presentation = actor.presentation
    actor.meal_finished.connect(func(): meals += 1)
    await _check_needs()
    await _check_meal(67.999, 99.999, false)
    await _check_meal(68.0, 100.0, true)
    await _check_meal(99.999, 100.0, true)
    await _check_meal(100.0, 100.0, false)
    await _check_hosted_meal()
    for level in [1, 4, 10]:
        await _check_sleep("bed", level)
        await _check_sleep("settee", level)
    room.queue_free()
    await process_frame
    print("Needs, meal transitions and both beds at three ages. Failures: ", failures)
    quit(0 if failures == 0 else 1)

func _check_needs() -> void:
    for value in [30.1, 30.0, 29.9, 30.0]:
        _state({"clean": value})
        await create_timer(0.58).timeout
        _expect(presentation.air.is_visible_in_tree() == (value < 30.0), "Odor and flies apply strictly below 30 cleanliness: %s" % value)
        if value < 30.0:
            _expect(presentation.flies.size() == 3 and presentation.odor.get_surface_count() > 0, "Flies and odor geometry are present")
            await _capture("02-dirty-29.9")

    for value in [30.1, 30.0, 29.9, 30.0]:
        _state({"energy": value})
        await create_timer(0.58).timeout
        _expect(is_equal_approx(_shader("expression_lid"), 0.40 if value < 30.0 else 0.0), "Sleepy eyelids apply strictly below 30 energy: %s" % value)
        if value < 30.0:
            await _capture("03-sleepy-29.9")

    for value in [29.9, 30.0, 30.1, 49.9, 50.0, 50.1, 79.9, 80.0, 80.1, 80.0]:
        _state({"joy": value})
        await create_timer(0.63).timeout
        var expression := -0.75 if value < 30.0 else -0.65 if value < 50.0 else 1.0 if value > 80.0 else 0.0
        _expect(is_equal_approx(_shader("expression"), expression), "Expression follows the mood threshold: %s" % value)
        _expect(is_zero_approx(_shader("wet_eyes")), "Sadness has no tears at any mood: %s" % value)
        if value in [29.9, 49.9, 80.1]:
            await _capture("04-mood-%s" % value)

    for value in [30.1, 30.0, 29.9, 30.0]:
        _state({"food": value})
        await create_timer(0.59).timeout
        var hungry: bool = value < 30.0
        _expect(room.location == &"main", "Hunger presentation near 30 keeps Richi in the main room")
        _expect((presentation.rumble_started_at > 0.0) == hungry, "A growl starts strictly below 30 satiety: %s" % value)
        if not hungry:
            _expect(absf(_shader("belly_motion")) < 0.0001 and actor.gaze.angles.length() < 0.1, "Restoring satiety removes belly motion and the search")
            continue
        _expect(presentation.rumble.stream is AudioStreamWAV and not presentation.rumble.stream.data.is_empty(), "The growl is backed by a real audio stream")
        if DisplayServer.get_name() != "headless":
            _expect(presentation.rumble.playing, "The audio player starts during the real render")
        var leftmost: float = actor.gaze.angles.x
        var rightmost := leftmost
        var belly := 0.0
        for _frame in 90:
            await process_frame
            leftmost = minf(leftmost, actor.gaze.angles.x)
            rightmost = maxf(rightmost, actor.gaze.angles.x)
            belly = maxf(belly, absf(_shader("belly_motion")))
            if _frame == 18:
                await _capture("05-hungry-looking")
        var spread := rightmost - leftmost
        print("Hunger at ", value, ": gaze shift ", spread, ", max belly displacement ", belly)
        _expect(spread > 2.0 and belly > 0.012, "Hunger moves the belly and searches with the eyes without a touch")
        var right := root.get_visible_rect().size * Vector2(0.86, 0.54)
        _touch(right, true)
        await create_timer(0.25).timeout
        print("Touch at ", right, ": eyes ", actor.gaze.angles, ", head ", actor.gaze.head_angles, ", tracking ", actor.gaze.finger)
        # Angular amplitude varies with the rendered viewport's camera aspect.
        _expect(actor.gaze.finger == 0 and actor.gaze.angles.x > 1.0 and actor.gaze.head_angles.x > 0.1, "Touch overrides hungry idle gaze and steers the head")
        await _capture("06-hungry-following-finger")
        _touch(right, false)
        await create_timer(0.90).timeout

    _state({"food": 29.9, "energy": 29.9, "joy": 80.1})
    await create_timer(0.60).timeout
    _expect(_shader("expression") > 0.95 and _shader("expression_lid") > 0.39, "Joy above 80 and sleepy eyelids remain visible together while hungry")
    await _capture("07-happy-tired-and-hungry")

    _state({"food": 25.0})
    if await _until(func(): return room.location == &"kitchen" and room.dining.state == &"waiting", 3.0, "hungry kitchen wait"):
        await create_timer(3.0).timeout
        var stillness := 0.0
        await _capture("07a-hungry-kitchen-rest")
        for _frame in 45:
            await process_frame
            stillness = maxf(stillness, actor.gaze.angles.length())
        await _capture("07b-hungry-kitchen-rest")
        _expect(stillness < 0.035, "Hungry kitchen gaze settles between growls")
        print("Hungry kitchen between growls: maximum gaze offset ", stillness)
        _tap("main")

func _check_meal(food: float, expected_food: float, reaches_full: bool) -> void:
    _state({"food": food})
    await create_timer(0.6).timeout
    var previous_meals := meals
    if not await _eat_apple():
        return
    _expect(is_equal_approx(actor.need_amount("food"), food), "Accepting the apple does not increase satiety before eating")
    if not await _until(func(): return meals > previous_meals, 9.0, "meal finishes"):
        return
    await create_timer(0.70).timeout
    print("Meal: ", food, " -> ", actor.need_amount("food"), ", reaction ", presentation.reaction)
    _expect(meals == previous_meals + 1 and is_equal_approx(actor.need_amount("food"), expected_food), "Finished apple awards satiety once and clamps only at the maximum")
    _expect((presentation.reaction == &"full") == reaches_full, "Only a meal that reaches the maximum plays the reaction")
    if reaches_full:
        _expect(presentation.pose.full > 0.92 and _shader("belly_motion") > 0.075, "A full meal activates the belly rub and rounds the animated mesh")
        _expect(presentation.sigh.stream is AudioStreamWAV and not presentation.sigh.stream.data.is_empty(), "The full reaction includes a breath stream")
        if food == 68.0:
            await _capture("08-full-meal-rub")
        await create_timer(1.02).timeout
        if food == 68.0:
            await _capture("09-full-meal-release")
        await create_timer(1.0).timeout
        _expect(presentation.reaction.is_empty() and meals == previous_meals + 1, "The full reaction ends without crediting another meal")
    _tap("main")

func _check_hosted_meal() -> void:
    room.hosted = true
    _state({"food": 85.0}, "", 1, {"pantry": {"pear": 0, "serial": 1, "serving": {"id": 1, "kind": "apple"}}})
    await create_timer(0.6).timeout
    var previous_meals := meals
    if not await _eat_apple() or not await _until(func(): return meals > previous_meals, 9.0, "hosted meal finishes"):
        room.hosted = false
        return
    _state({"food": 99.99999})
    _expect(room.awaiting_meal_result and presentation.reaction.is_empty(), "An ordinary profile update does not consume the meal acknowledgement")
    _state({"food": 99.99998}, "", 1, {"meal_reached_full": true, "pantry": {"pear": 0, "serial": 1, "serving": null}})
    _expect(not room.awaiting_meal_result and presentation.reaction == &"full", "The host acknowledgement starts the reaction even after metered decay")
    await create_timer(0.65).timeout
    var reaction_time: float = presentation.reaction_time
    _state({"food": 99.9999}, "", 1, {"meal_reached_full": true})
    _expect(is_equal_approx(presentation.reaction_time, reaction_time), "A repeated acknowledgement does not restart the reaction")
    room.hosted = false
    await create_timer(2.0).timeout
    _tap("main")

func _eat_apple() -> bool:
    if not _tap("kitchen") or not _tap("feed") or not await _until(func(): return room.active_mode == &"feed", 5.0, "apple ready"):
        return false
    # The previous meal can leave a frontal reaction pose. Wait for the normal
    # 0.42 s transition before measuring the grip's screen position for a drag.
    await create_timer(0.46).timeout
    var state := _interaction()
    if state.apple == null or state.grip == null:
        _expect(false, "Apple and paws are available for a real drag")
        return false
    _touch(_screen(state.apple), true)
    var drag := InputEventScreenDrag.new()
    drag.position = _screen(state.grip)
    root.push_input(drag, true)
    _touch(drag.position, false)
    return await _until(func(): return room.meal_in_progress, 2.0, "apple reaches paws")

func _check_sleep(furniture: String, level: int) -> void:
    _state({"energy": 75.1}, furniture, level)
    var label := "%s age %d" % [furniture, level]
    await create_timer(0.45).timeout
    if not _tap("sleep"):
        return
    _expect(not room.night and not room.sleep_moving, "Energy above 75 refuses sleep on " + label)
    _state({"energy": 75.0}, furniture, level)
    await create_timer(0.7).timeout
    var spine := _gap("mixamorig_Hips", "mixamorig_Head")
    var tail := _gap("Bone_017", "mixamorig_Head")
    if not _tap("sleep") or not _until_sleep_started(label):
        return
    await create_timer(0.31).timeout
    _expect(actor.player.current_animation == &"Walking", "Sleep starts with a real approach on " + label)
    if not await _until(func(): return not room.sleep_moving, 7.0, "settle on " + label):
        return
    await create_timer(0.35).timeout
    _expect(actor.player.current_animation == &"Sleep/Curled" and actor.player.is_playing(), "Curled sleep breathes on " + label)
    _expect(_shader("eyelids") > 0.95 and actor.gaze.suspended, "Sleeping eyes close on " + label)
    _expect(_gap("mixamorig_Hips", "mixamorig_Head") < spine * 0.82 and _gap("Bone_017", "mixamorig_Head") < tail * 0.60, "Spine and tail curl toward the nose on " + label)
    _expect(actor.transform.is_equal_approx(room._sleep_pose()) and float(room.linen.get_shader_parameter("drawn")) > 0.99, "Actor settles on the bed pose and closes the curtain on " + label)
    await _capture("10-sleep-%s-%d" % [furniture, level])
    if not _tap("sleep") or not await _until(func(): return not room.sleep_moving, 7.0, "wake on " + label):
        return
    await create_timer(0.86).timeout
    _expect(not room.night and actor.player.current_animation == &"Idle" and not actor.gaze.suspended, "Richi returns to a responsive idle on " + label)
    _expect(_shader("eyelids") < 0.05 and _shader("mouth_open") > 0.8 and presentation.pose.stretch > 0.90, "Wake opens the eyes and includes a yawn with paws stretched on " + label)
    _expect(float(room.linen.get_shader_parameter("drawn")) < 0.01, "Wake opens the curtain on " + label)
    await _capture("11-wake-%s-%d" % [furniture, level])

func _until_sleep_started(label: String) -> bool:
    var started: bool = room.night and room.sleep_moving
    _expect(started, "Exactly 75 energy starts sleep on " + label)
    return started

func _state(overrides: Dictionary, furniture := "", level := 1, extra := {}) -> void:
    var needs := {"food": 59.0, "clean": 60.0, "energy": 60.0, "joy": 61.0}
    needs.merge(overrides, true)
    room.native_needs = needs
    room.native_needs_updated = 0.0
    var state := {
        "name": "Ричи", "level": level, "night": room.night, "needs": needs,
        "furniture": {"placed": [] if furniture.is_empty() else [furniture]},
    }
    state.merge(extra, true)
    room._sync_state([JSON.stringify(state)])

func _gap(a: String, b: String) -> float:
    var skeleton: Skeleton3D = actor.skeleton
    return skeleton.get_bone_global_pose(skeleton.find_bone(a)).origin.distance_to(skeleton.get_bone_global_pose(skeleton.find_bone(b)).origin)

func _shader(key: String) -> float:
    return float(actor.gaze.surface.get_shader_parameter(key))

func _interaction() -> Dictionary:
    return JSON.parse_string(room._interaction_state([]))

func _screen(point: Dictionary) -> Vector2:
    return Vector2(point.x, point.y) * root.get_visible_rect().size

func _tap(control: String) -> bool:
    var point: Variant = _interaction().controls[control]
    _expect(point != null, "Visible control required for " + control)
    if point == null:
        return false
    _touch(_screen(point), true)
    _touch(_screen(point), false)
    return true

func _touch(point: Vector2, pressed: bool) -> void:
    var event := InputEventScreenTouch.new()
    event.position = point
    event.pressed = pressed
    root.push_input(event, true)

func _until(condition: Callable, seconds: float, what: String) -> bool:
    var timeout := create_timer(seconds)
    while not condition.call() and timeout.time_left > 0.0:
        await process_frame
    var reached: bool = condition.call()
    _expect(reached, "Timed out waiting for " + what)
    return reached

func _capture(label: String) -> void:
    if output.is_empty():
        return
    await RenderingServer.frame_post_draw
    _expect(root.get_texture().get_image().save_png(output.path_join(label + ".png")) == OK, "Capture " + label)

func _expect(value: bool, what: String) -> void:
    if not value:
        failures += 1
        push_error(what)
