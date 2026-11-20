extends SceneTree

const HOME := preload("res://Scenes/Levels/Home.tscn")

class IsolatedHome:
    extends "res://Scenes/Home/Home.gd"

    func _load_home() -> void:
        native_needs = {"food": 76.0, "clean": 20.0, "energy": 75.0, "joy": 65.0}
        native_needs_updated = Time.get_unix_time_from_system()
        _sync_native_shop()
        _update_native_stats()
        _refresh_native_needs()

    func _save_home() -> bool:
        return true

var room: Node3D
var bath: Node3D
var output := ""
var failures := 0
var washes := 0

func _initialize() -> void:
    _run.call_deferred()

func _run() -> void:
    var args := OS.get_cmdline_user_args()
    if not args.is_empty():
        output = args[0]
    root.size = Vector2i(390, 844)
    room = HOME.instantiate()
    var growth_mesh: ArrayMesh = room.growth_mesh
    room.set_script(IsolatedHome)
    room.growth_mesh = growth_mesh
    root.add_child(room)
    bath = room.bathroom
    bath.washed.connect(func(): washes += 1)
    await process_frame
    if not _tap_control("bath"):
        quit(1)
        return
    var standing_hips := _hips().y
    if not _tap_control("wash") or not await _until(func(): return not room.bath_moving and bath.soap.visible, 10.0, "animated entry and sponge"):
        quit(1)
        return
    await create_timer(0.45).timeout
    _expect(room.active_mode == &"bath" and room.richi.player.current_animation == &"Sit_Cross_Legged", "Richi enters and uses a seated pose")
    _expect(_hips().y - bath.get_node("Место для Ричи").global_position.y < standing_hips - 0.03, "Hip height lowers when Richi sits")
    _expect(bath.jug_water.is_visible_in_tree() and bath.jug_water.position.y > 0.21, "The upright pitcher starts full of visible water")
    _expect(bath.indicator.visible and bath.exit_button.visible and not room.get_node("%Dock").visible, "Only the progress and small exit remain below the action")
    await _capture("01-seated-water-in-jug")

    var sponge := _point(_state().sponge)
    var center := _point(_state().scrubCenter)
    _touch(sponge, true)
    _touch(sponge, false)
    _expect(bath.scrub == 0.0, "A sponge tap does not lather")
    _touch(sponge, true)
    _drag(center)
    var stroke := Vector2(root.get_visible_rect().size.x * 0.105, 0.0)
    for index in range(3):
        _drag(center + (stroke if index % 2 == 0 else -stroke))
        await create_timer(0.10).timeout
    _touch(center, false)
    _expect(bath.scrub > 0.20 and bath.scrub < 0.51 and bath.effects.foam.visible, "Scrubbing generates an intermediate visible foam and meter")
    _expect(washes == 0 and room.native_needs.clean < 21.0, "An incomplete wash grants nothing")
    await _capture("02-lather-progress")
    var partial: Dictionary = room._navigation_state()
    if not _tap_control("back") or not await _until(func(): return room.active_mode == &"home" and not room.bath_moving, 9.0, "manual cancellation"):
        quit(1)
        return
    _expect(washes == 0 and room.native_needs.clean < 21.0, "Leaving before rinse grants nothing")
    room._restore_navigation(partial)
    await process_frame
    _expect(is_equal_approx(bath.scrub, partial.bath.scrub) and bath.soap.visible, "Reopening a partial lather restores exactly its progress")

    sponge = _point(_state().sponge)
    center = _point(_state().scrubCenter)
    _touch(sponge, true)
    _drag(center)
    for index in range(8):
        _drag(center + (stroke if index % 2 == 0 else -stroke))
        await process_frame
    _touch(center, false)
    _expect(bath.phase == &"ready" and bath.lather_bar.value == 1.0 and bath.rinse_progress == 0.0, "Full lather makes the pitcher usable and preserves both meters")
    await _capture("03-ready-to-rinse")

    var jug := _point(_state().jug)
    var target := _point(_state().pourTarget)
    _touch(jug, true)
    _touch(jug, false)
    await create_timer(0.22).timeout
    _expect(bath.rinse_progress == 0.0 and not bath.pouring, "A pitcher tap releases no stream")
    _touch(jug, true)
    _drag(target + Vector2(-146.0, 0.0))
    await create_timer(0.30).timeout
    _expect(bath.rinse_progress == 0.0 and not bath.pouring, "Holding the pitcher away from Richi releases no stream")
    _drag(target)
    await create_timer(0.62).timeout
    _expect(bath.pouring and bath.effects.water.visible and bath.rinse_progress > 0.17 and bath.rinse_progress < 0.75, "A held pitcher over Richi creates an arc and advances rinse gradually")
    await _capture("04-stream-and-rinse-progress")
    var rinse_snapshot: float = bath.rinse_progress
    _touch(target, false)
    await create_timer(0.24).timeout
    _expect(not bath.pouring and is_equal_approx(bath.rinse_progress, rinse_snapshot), "Releasing stops the stream and keeps progress")

    _touch(_point(_state().jug), true)
    _drag(target)
    await create_timer(0.12).timeout
    room._sync_pause([true])
    await process_frame
    var paused_snapshot: float = bath.rinse_progress
    await create_timer(0.30).timeout
    _expect(not bath.pouring and bath.pointer == -2 and is_equal_approx(bath.rinse_progress, paused_snapshot), "Parking pauses the rinse and releases the held prop")
    room._sync_pause([false])
    await create_timer(0.26).timeout
    _expect(is_equal_approx(bath.rinse_progress, paused_snapshot), "Returning alone does not resume pouring")
    var before := float(room.native_needs.clean)
    _touch(_point(_state().jug), true)
    _drag(target)
    await _until(func(): return washes == 1, 3.4, "one wash signal")
    _expect(bath.phase == &"done" and not bath.pouring and bath.rinse_bar.value >= 0.99, "One complete rinse stops the water and fills the indicator")
    await create_timer(0.34).timeout
    _expect(bath.effects.sparkle.visible, "A completed wash shows the cleanliness sparkle")
    await _capture("05-clean-sparkle")
    _touch(target, false)
    await _until(func(): return room.active_mode == &"home" and not room.bath_moving, 9.0, "automatic exit")
    _expect(washes == 1 and room.location == &"bathroom" and room.native_needs.clean > before + 54.0, "After the clean reaction, Richi exits and receives exactly one gain")
    await _capture("06-back-on-the-mat")
    if failures == 0:
        print("PASS seated wash, visible jug/foam/stream/sparkle, incremental rinse, cancel/pause/restore, one care reward, and automatic exit")
    quit(0 if failures == 0 else 1)

func _hips() -> Vector3:
    var skeleton: Skeleton3D = room.richi.skeleton
    return skeleton.to_global(skeleton.get_bone_global_pose(skeleton.find_bone("mixamorig_Hips")).origin)

func _state() -> Dictionary:
    return JSON.parse_string(room._interaction_state([]))

func _point(coordinates: Variant) -> Vector2:
    if coordinates is not Dictionary:
        _expect(false, "The required gesture point is missing")
        return Vector2(-1.0, -1.0)
    return Vector2(coordinates.x, coordinates.y) * root.get_visible_rect().size

func _tap_control(control: String) -> bool:
    var coordinates: Variant = _state().controls.get(control)
    if coordinates is not Dictionary:
        _expect(false, "Missing control: " + control)
        return false
    _touch(_point(coordinates), true)
    _touch(_point(coordinates), false)
    return true

func _touch(point: Vector2, pressed: bool) -> void:
    var event := InputEventScreenTouch.new()
    event.position = point
    event.pressed = pressed
    root.push_input(event, true)

func _drag(point: Vector2) -> void:
    var event := InputEventScreenDrag.new()
    event.position = point
    root.push_input(event, true)

func _until(condition: Callable, seconds: float, label: String) -> bool:
    var timeout := create_timer(seconds)
    while not condition.call() and timeout.time_left > 0.0:
        await process_frame
    var reached: bool = condition.call()
    _expect(reached, "Timed out: " + label)
    return reached

func _capture(label: String) -> void:
    if output.is_empty():
        return
    await RenderingServer.frame_post_draw
    var image := root.get_texture().get_image()
    _expect(image.save_png(output.path_join(label + ".png")) == OK, "Write screenshot " + label)

func _expect(result: bool, label: String) -> void:
    if not result:
        failures += 1
        push_error(label)
