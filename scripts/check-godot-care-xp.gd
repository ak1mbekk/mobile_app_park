extends SceneTree

const HOME := preload("res://Scenes/Levels/Home.tscn")
var cabin
var failures := 0
var round_id := 0

func _initialize() -> void:
    _run.call_deferred()

func _expect(ok: bool, message: String) -> void:
    if not ok:
        failures += 1
        push_error(message)

func _open() -> void:
    cabin = HOME.instantiate()
    root.add_child(cabin)
    # Freeze wall-clock decay in this fixture. Exact thresholds must not depend on CPU speed.
    cabin.native_needs_updated = Time.get_unix_time_from_system() + 600.0

func _reopen() -> void:
    cabin.free()
    _open()

func _care(key: String, before: float, after: float, xp: int) -> void:
    cabin.native_needs[key] = before
    var old_xp: int = cabin.native_xp
    if key == "food":
        cabin._on_fed()
    else:
        cabin._on_washed()
    _expect(is_equal_approx(float(cabin.native_needs[key]), after) and cabin.native_xp == old_xp + xp,
        "%s from %s must reach %s and give %d XP" % [key, before, after, xp])

func _round(joy: float, xp: int) -> void:
    round_id += 1
    cabin.native_needs.joy = joy
    var old_xp: int = cabin.native_xp
    var wallet: int = cabin.native_leaves
    cabin._store_round("pairs", {"id": round_id, "finished": false})
    var result := {"id": round_id, "finished": true, "won": true}
    cabin._store_round("pairs", result)
    cabin._store_round("pairs", result)
    _expect(cabin.native_rounds.pairs.reward == {"xp": xp, "leaves": 5}
        and cabin.native_xp == old_xp + xp and cabin.native_leaves == wallet + 5,
        "Winning at joy %s must pay %d XP and five leaves exactly once" % [joy, xp])

func _sleep(recovered: float, xp: int) -> void:
    cabin.native_needs.energy = 50.0
    var before: int = cabin.native_xp
    cabin._toggle_sleep()
    _expect(cabin.night and cabin.native_xp == before, "Falling asleep alone must not pay XP")
    _reopen()
    _expect(cabin.night and is_equal_approx(cabin.native_sleep_start_energy, 50.0), "Sleep baseline survives relaunch")
    cabin.native_needs.energy = 50.0 + recovered
    cabin._toggle_sleep()
    _expect(not cabin.night and cabin.native_xp == before + xp, "Wake after %s recovered: expected %d XP" % [recovered, xp])
    _reopen()
    _expect(cabin.native_xp == before + xp and cabin.native_sleep_start_energy < 0.0, "Relaunch cannot repeat the wake award")

func _run() -> void:
    var original := OS.get_user_data_dir()
    var folder := "animal-park-xp-qa-%d-%d" % [OS.get_process_id(), Time.get_ticks_usec()]
    ProjectSettings.set_setting("application/config/use_custom_user_dir", true)
    ProjectSettings.set_setting("application/config/custom_user_dir_name", folder)
    var sandbox := OS.get_user_data_dir()
    if sandbox == original or sandbox.get_file() != folder or DirAccess.dir_exists_absolute(sandbox) or DirAccess.make_dir_recursive_absolute(sandbox) != OK:
        push_error("Cannot isolate the economy test profile")
        quit(1)
        return
    _open()
    # Offline recovery uses the same 40/h rate as a live sleeping profile.
    for sample: Vector2 in [Vector2(0, 2.5), Vector2(50, 1.25), Vector2(0, 2.49)]:
        cabin.night = true
        cabin.native_needs.energy = sample.x
        cabin.native_needs_updated = Time.get_unix_time_from_system() - sample.y * 3600.0
        cabin._advance_native_needs()
        _expect(absf(cabin.native_needs.energy - minf(100.0, sample.x + sample.y * 40.0)) < 0.01, "Sleep/offline recovery is 40 energy/hour")
    cabin.night = false
    cabin.native_needs_updated = Time.get_unix_time_from_system() + 600.0
    _care("food", 50, 82, 3)
    _care("food", 84, 100, 1)
    _care("food", 100, 100, 0)
    _care("clean", 0, 100, 3)
    _care("clean", 45, 100, 1)
    _care("clean", 50, 100, 1)
    _care("clean", 99, 100, 0)
    _care("clean", 100, 100, 0)
    _round(50, 10)
    _round(95, 2)
    _round(100, 0)
    cabin.native_owned.append("bed")
    cabin.native_placed.append("bed")
    cabin._sync_native_shop()
    _sleep(9.99, 0)
    _sleep(10.0, 1)
    _sleep(29.99, 2)
    _sleep(50.0, 3)
    # A sleeping profile from before the new field must not receive invented XP.
    var legacy := ConfigFile.new()
    _expect(legacy.load("user://home.cfg") == OK, "Can read the isolated profile")
    legacy.set_value("home", "night", true)
    _expect(legacy.save("user://home.cfg") == OK, "Can prepare a legacy sleeping profile")
    _reopen()
    var before: int = cabin.native_xp
    cabin._toggle_sleep()
    _expect(not cabin.night and cabin.native_xp == before, "Legacy wake without a baseline awards zero XP")
    cabin.free()
    _expect(DirAccess.remove_absolute(sandbox.path_join("home.cfg")) == OK, "Removed isolated save")
    _expect(DirAccess.remove_absolute(sandbox) == OK, "Removed isolated profile directory")
    if failures == 0:
        print("PASS native care XP: partial/full needs, replays, sleep thresholds, relaunch and old save")
    quit(1 if failures else 0)
