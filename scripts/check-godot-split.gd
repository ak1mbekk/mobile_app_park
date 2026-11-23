extends SceneTree

# --headless --main-pack index.pck --script <this file> -- home.pck <temporary save path>
func _initialize() -> void:
    check.call_deferred()

func expect(ok: bool, message: String) -> bool:
    if not ok:
        printerr(message)
        quit(1)
    return ok

func check() -> void:
    var args := OS.get_cmdline_user_args()
    if not expect(args.size() == 2, "Expected home pack and temporary save path"):
        return
    if not expect(not ResourceLoader.exists("res://Scenes/Levels/Home.tscn"), "Home leaked into boot pack"):
        return
    var intro := load("res://Scenes/Levels/FirstMeeting.tscn") as PackedScene
    if not expect(intro != null, "Missing first meeting"):
        return
    var scene := intro.instantiate()
    var welcome = scene.get_node("Знакомство")
    if not expect(welcome.get_script() != null and welcome.get_script().can_instantiate(), "Welcome script dependencies are incomplete"):
        return
    welcome.save_path = args[1]
    root.add_child(scene)
    await process_frame
    await process_frame
    var actor = welcome.aki
    actor.accept_apple()
    actor.player.advance(actor.player.current_animation_length + 0.1)
    await process_frame
    if not expect(actor.eating_finished and welcome.panel.visible, "First meal and naming must work without home pack"):
        return
    scene.queue_free()
    await process_frame
    scene = intro.instantiate()
    welcome = scene.get_node("Знакомство")
    welcome.save_path = args[1]
    root.add_child(scene)
    await process_frame
    if not expect(welcome.aki.eating_finished and welcome.panel.visible, "Saved meal must restore before home pack is mounted"):
        return
    print("PASS boot-only first meeting: meal, name panel and saved-meal restoration")
    if not expect(ProjectSettings.load_resource_pack(args[0], false), "Could not mount home pack"):
        return
    scene.queue_free()
    await process_frame
    var home := load("res://Scenes/Levels/Home.tscn") as PackedScene
    if not expect(home != null, "Home unavailable after mount"):
        return
    scene = home.instantiate()
    root.add_child(scene)
    await process_frame
    await process_frame
    for game: String in ["Pairs", "MatchThree", "Orchard"]:
        var packed := load("res://Scenes/Games/" + game + ".tscn") as PackedScene
        if not expect(packed != null, "Missing game " + game):
            return
        var instance := packed.instantiate()
        instance.free()
    for bed: String in ["WillowBed", "OakBed", "BlueDaybed", "Settee"]:
        var packed := load("res://Scenes/Props/Furniture/" + bed + ".tscn") as PackedScene
        if not expect(packed != null, "Missing bed " + bed):
            return
        var instance := packed.instantiate()
        instance.free()
    var original_bed := load("res://Scenes/Environment/TrailHouse/Furniture/FleeceBed.tscn") as PackedScene
    if not expect(original_bed != null, "Missing original fleece bed"):
        return
    original_bed.instantiate().free()
    print("PASS same live engine: mounted Home, three games and legacy/new bed models")
    quit()
