extends SceneTree

# Run from the Godot project with --fixed-fps 60 and -- <temporary output directory>.
# Render only the game camera. The light client draws controls, sponge, pitcher and effects.
class ArtHome:
    extends "res://Scenes/Home/Home.gd"

    func _load_home() -> void:
        native_needs = {"food": 76.0, "clean": 20.0, "energy": 75.0, "joy": 65.0}
        native_needs_updated = Time.get_unix_time_from_system()
        _sync_native_shop()
        _refresh_native_needs()

    func _save_home() -> bool:
        return true

const HOME := preload("res://Scenes/Levels/Home.tscn")
const STAGES := ["base-bath", "bath-carved", "bath", "bath-copper", "bath-faience"]
var output: String
var tile: Node3D
var bath: Node3D
var magenta := StandardMaterial3D.new()

func _initialize() -> void:
    run.call_deferred()

func run() -> void:
    if OS.get_cmdline_user_args().size() != 1:
        push_error("Specify a temporary output directory after --")
        quit(1)
        return
    output = OS.get_cmdline_user_args()[0]
    DirAccess.make_dir_recursive_absolute(output)
    root.size = Vector2i(540, 960)
    var home = HOME.instantiate()
    var mesh: ArrayMesh = home.growth_mesh
    home.set_script(ArtHome)
    home.growth_mesh = mesh
    root.add_child(home)
    await process_frame
    home._restore_navigation({"location":"bathroom", "mode":"bath"})
    await create_timer(.45).timeout
    bath = home.bathroom
    tile = home.bath_room.get_node("Архитектура/Плитка")
    magenta.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
    magenta.albedo_color = Color(1,0,1)
    for layer: CanvasLayer in home.find_children("*","CanvasLayer",true,false):
        layer.hide()
    bath.jug.hide()
    bath.soap.hide()
    bath.set_process(false)
    bath.guide.hide()
    await plates("wash")
    Engine.time_scale = 1
    bath._finish_rinse()
    await create_timer(.32).timeout
    bath.jug.hide()
    bath.effects.sparkle.hide()
    bath.set_process(false)
    await plates("clean")
    quit()

func plates(phase: String) -> void:
    Engine.time_scale = 0
    for variant: String in STAGES:
        bath.show_appearance(variant)
        var slug := phase + ("-" + variant if variant != "base-bath" else "")
        tile.hide()
        await capture(slug+"-bare")
        tile.show()
        await capture(slug+"-tiles")
        for sub: MeshInstance3D in tile.get_children():
            sub.material_override = magenta
        await capture(slug+"-mask")
        for sub: MeshInstance3D in tile.get_children():
            sub.material_override = null
    tile.hide()

func capture(label: String) -> void:
    await RenderingServer.frame_post_draw
    var result := root.get_texture().get_image().save_png(output.path_join(label+".png"))
    if result != OK:
        push_error(label + " saving failed")
        quit(1)
