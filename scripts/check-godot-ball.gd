extends SceneTree

const HOME = preload("res://Scenes/Levels/Home.tscn")
const LEVELS := [1, 4, 10]
const RESULTS := ["поймал мяч!", "вернул тебе мяч", "принёс тебе мяч"]

var room: Node3D
var failures := 0
var completed := 0


func _initialize() -> void:
    _run.call_deferred()


func _run() -> void:
    root.size = Vector2i(540, 960)
    room = HOME.instantiate()
    root.add_child(room)
    room.care.play_finished.connect(func(_stage: int): completed += 1)
    for level in LEVELS:
        await _check_level(level)
    await _check_cancellation()
    room.queue_free()
    await process_frame
    if failures == 0:
        print("PASS rope ball: catch, roll back, floor pickup, visible carry, return, pause and cancellation")
    quit(failures)


func _set_level(level: int) -> void:
    room._sync_state([JSON.stringify({
        "name": "Ричи", "level": level, "ball": true, "leaves": 0,
        "needs": {"food": 50, "clean": 50, "energy": 50, "joy": 50},
        "furniture": {"placed": ["bed"]},
    })])
    room.care.stop_toy()
    room._show_room()


func _check_level(level: int) -> void:
    _set_level(level)
    await create_timer(0.46).timeout
    var actor: Node3D = room.richi
    var ball: MeshInstance3D = room.care.ball
    var origin := actor.global_position
    var floor := ball.global_position
    var previous := floor
    var previous_finish := completed
    await _tap_ball()
    _expect(room.active_mode == &"ball", "An on-screen tap starts the ball at level %d" % level)
    var hold_samples := 0
    var carry_samples := 0
    var carry_start := Vector3.ZERO
    var carry_distance := 0.0
    var carry_clearance := INF
    var reach_gap := INF
    var longest_step := 0.0
    var maximum_walk := 0.0
    var lowest_ball := floor.y
    var skeleton: Skeleton3D = actor.skeleton
    var chest := skeleton.find_bone("mixamorig_Spine2")
    for sample in 320:
        await create_timer(0.016).timeout
        if room.active_mode != &"ball":
            break
        var clip: StringName = actor.player.current_animation
        var grip: Vector3 = actor.apple_grip()
        lowest_ball = minf(lowest_ball, ball.global_position.y)
        longest_step = maxf(longest_step, previous.distance_to(ball.global_position))
        previous = ball.global_position
        maximum_walk = maxf(maximum_walk, origin.distance_to(actor.global_position))
        if clip == &"Toy/PickUp" and ball.global_position.y < floor.y + 0.03:
            reach_gap = minf(reach_gap, grip.distance_to(ball.global_position))
        if room.care.holding:
            hold_samples += 1
            _expect(ball.global_position.distance_to(grip) < 0.024, "Held ball follows the grip continuously")
            for palm in [actor.left_palm, actor.right_palm]:
                var paw := skeleton.to_global(skeleton.get_bone_global_pose(palm).origin)
                _expect(ball.global_position.distance_to(paw) < 0.12, "Both paws stay close to the held ball")
        if clip == &"Toy/Carry" and room.care.holding:
            carry_samples += 1
            if carry_samples == 1:
                carry_start = actor.global_position
            carry_distance = maxf(carry_distance, carry_start.distance_to(actor.global_position))
            var chest_center := skeleton.to_global(skeleton.get_bone_global_pose(chest).origin)
            var forward := actor.global_basis.z.normalized()
            carry_clearance = minf(carry_clearance, forward.dot(ball.global_position - chest_center))
            if carry_samples == 6:
                await _check_pause(actor, ball)

    _expect(hold_samples >= 6, "The grip holds for multiple frames at level %d" % level)
    _expect(lowest_ball >= floor.y - 0.002, "The ball stays above the floor at level %d" % level)
    _expect(longest_step < 0.09, "The ball path has no position jump at level %d" % level)
    _expect(completed == previous_finish + 1, "The result is emitted once at level %d" % level)
    _expect(room.status.text.ends_with(RESULTS[LEVELS.find(level)]), "The age-specific result matches level %d" % level)
    var end_distance := ball.global_position.distance_to(floor)
    if level == 1:
        _expect(end_distance > 0.55, "The baby leaves the caught ball nearby")
    else:
        _expect(end_distance < 0.007, "The older pet returns the ball to its starting position")
    if level == 10:
        _expect(reach_gap < 0.14, "The adult reaches the ball down at floor height")
        _expect(carry_samples >= 18 and carry_distance > 0.20, "The adult takes several steps with the ball")
        _expect(carry_clearance > 0.13, "The held ball stays in front of the adult torso")
        _expect(maximum_walk > 0.62 and origin.distance_to(actor.global_position) < 0.01, "The adult returns to the rug")
        print("Adult floor grip gap ", reach_gap, ", carry ", carry_distance, ", clearance ", carry_clearance)
    else:
        _expect(maximum_walk < 0.01, "The younger pet plays from the rug")


func _check_pause(actor: Node3D, ball: MeshInstance3D) -> void:
    var position := ball.global_position
    var body := actor.global_transform
    room._sync_pause([true])
    await create_timer(0.14).timeout
    _expect(position.is_equal_approx(ball.global_position) and body.is_equal_approx(actor.global_transform), "Switching to the park freezes the held ball")
    room._sync_pause([false])


func _check_cancellation() -> void:
    _set_level(10)
    await create_timer(0.45).timeout
    var previous_finish := completed
    await _tap_ball()
    await create_timer(1.55).timeout
    room.care.stop_toy()
    room._show_room()
    _expect(room.care.ball.global_position.is_equal_approx(room.care.marker.global_position), "Cancellation returns the ball to its marker")
    _expect(room.care.playing_actor == null and room.richi.gaze.fruit == null, "Cancellation releases the grip and gaze")
    await create_timer(3.0).timeout
    _expect(previous_finish == completed, "The cancelled play emits no late result")


func _tap_ball() -> void:
    _tap(room.get_node("%Play"))
    await process_frame
    _expect(room.game_room.visible, "Tapping the toy chest opens the game picker")
    _tap(room.game_room.get_node("%Ball"))


func _tap(button: Button) -> void:
    for pressed in [true, false]:
        var event := InputEventScreenTouch.new()
        event.index = 0
        event.position = button.get_global_rect().get_center()
        event.pressed = pressed
        root.push_input(event, true)


func _expect(value: bool, label: String) -> void:
    if not value:
        failures += 1
        push_error(label)
