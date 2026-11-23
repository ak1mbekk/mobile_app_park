extends SceneTree

## Run with --headless --main-pack <exported index.pck> --script <absolute path to this file>.
## This reads assets from the actual game package, including export remaps.
func _initialize() -> void:
    var missing := PackedStringArray()
    for resource in [
        "res://Scenes/Levels/FirstMeeting.tscn", "res://Scenes/Levels/Home.tscn",
        "res://Scenes/Characters/IdleFacing.tres", "res://Scenes/Games/Pairs.gd",
        "res://Scenes/Characters/Richi.gd", "res://Scenes/Home/Bathroom.gd",
        "res://Scenes/Home/Art/SoapFilm.gdshader",
        "res://Scenes/Games/OrchardWater.gdshader", "res://Scenes/Games/OrchardMeadow.gdshader",
        "res://Scenes/Props/Furniture/EnamelBath.tscn", "res://Art/TrailHouse/Furniture/enamel-bath.glb"
    ]:
        var loaded := load(resource)
        if loaded == null or (loaded is Script and not loaded.can_instantiate()):
            missing.append(resource)
    for animal in ["bison", "capybara", "caracal", "lemur", "raccoon", "tamarin"]:
        var portrait := "res://Scenes/Games/Art/game-toy-%s.webp" % animal
        if not load(portrait) is Texture2D:
            missing.append(portrait)
    var orchard := (load("res://Scenes/Games/Orchard.tscn") as PackedScene).instantiate()
    var cutout := orchard.get_node_or_null("PlayFrame/Board/Walker/Richi")
    if cutout == null or cutout.get_node_or_null("Skeleton2D/Pelvis/NearThigh/Shin/Foot") == null:
        missing.append("Orchard: playable Richi rig")
    else:
        for slot in ["head_texture", "torso_texture", "tail_texture", "upper_arm_texture", "forearm_texture", "hand_texture", "thigh_texture", "shin_texture", "foot_texture"]:
            var region = cutout.get(slot)
            if not region is AtlasTexture or region.atlas == null or not region.region.has_area():
                missing.append("Orchard Richi / " + slot)
    orchard.free()
    for layer in ["orchard-distance", "orchard-bough", "orchard-grass"]:
        if not load("res://Scenes/Games/Art/%s.webp" % layer) is Texture2D:
            missing.append(layer)
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
    print("PASS exported game: home, first meeting, pet clips, shop bath, six portraits, layered orchard and nine rig regions")
    quit()
