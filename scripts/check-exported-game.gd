extends SceneTree

## Run with --headless --main-pack <exported index.pck> --script <absolute path to this file>.
## This reads assets from the actual game package, including export remaps.
func _initialize() -> void:
    var missing := PackedStringArray()
    for resource in [
        "res://Scenes/Levels/FirstMeeting.tscn", "res://Scenes/Levels/Home.tscn",
        "res://Scenes/Characters/IdleFacing.tres", "res://Scenes/Games/Pairs.gd",
        "res://Scenes/Characters/Richi.gd", "res://Scenes/Home/Bathroom.gd",
        "res://Scenes/Home/Art/SoapFilm.gdshader"
    ]:
        var loaded := load(resource)
        if loaded == null or (loaded is Script and not loaded.can_instantiate()):
            missing.append(resource)
    for animal in ["bison", "capybara", "caracal", "lemur", "raccoon", "tamarin"]:
        var portrait := "res://Scenes/Games/Art/game-toy-%s.webp" % animal
        if not load(portrait) is Texture2D:
            missing.append(portrait)
    var packed_actor := load("res://Art/Characters/Richi.glb") as PackedScene
    if packed_actor:
        var actor := packed_actor.instantiate()
        var clips := actor.get_node("AnimationPlayer") as AnimationPlayer
        for clip in [&"Eat_Apple", &"Stand_to_Sit_Transition_M", &"Sit_Cross_Legged", &"Sit_to_Stand_Transition_M"]:
            if not clips.has_animation(clip):
                missing.append("Richi.glb / " + String(clip))
        actor.free()
    else:
        missing.append("Richi.glb")
    if not missing.is_empty():
        printerr("Missing or invalid export resources: ", ", ".join(missing))
        quit(1)
        return
    print("PASS exported game: both rooms, pet, bath, idle and six playable toy portraits")
    quit()
