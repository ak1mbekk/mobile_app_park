extends SceneTree
## Run Godot with the compatibility renderer, --fixed-fps 60, and -- <scratch directory>.
## The sleep pose, lighting, accessories and age morphs all come from the gameplay scene.

class ArtHome:
    extends "res://Scenes/Home/Home.gd"

    func _load_home() -> void:
        native_needs = {"food":76.0, "clean":64.0, "energy":25.0, "joy":65.0}
        native_needs_updated = Time.get_unix_time_from_system()
        _sync_native_shop()
        _refresh_native_needs()

    func _save_home() -> bool:
        return true

const HOME = preload("res://Scenes/Levels/Home.tscn")
const BEDS := ["bed", "bed-willow", "settee", "bed-oak", "bed-daybed"]
const LEVELS := {"kit": 1, "young": 4, "adult": 10}
const HATS := ["bare", "cap", "ranger", "crown"]
var stage := SubViewport.new()

func _initialize() -> void:
    run.call_deferred()

func run() -> void:
    var args := OS.get_cmdline_user_args()
    if args.size() != 1:
        push_error("Pass a destination directory after --")
        quit(1)
        return
    var output := args[0]
    DirAccess.make_dir_recursive_absolute(output)
    stage.size = Vector2i(540, 960)
    stage.own_world_3d = true
    stage.msaa_3d = Viewport.MSAA_4X
    stage.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    root.add_child(stage)
    var home = HOME.instantiate()
    var growth: ArrayMesh = home.growth_mesh
    home.set_script(ArtHome)
    home.growth_mesh = growth
    stage.add_child(home)
    for layer: CanvasLayer in home.find_children("*","CanvasLayer",true,false):
        layer.hide()
    await process_frame
    Engine.time_scale = 0
    for bed: String in BEDS:
        home._set_sleep(false, false)
        home._apply_furniture({"placed":[bed]})
        home._set_sleep(true, false)
        # Home selects the same gameplay camera as the native sleep and preview screens.
        for age: String in LEVELS:
            home.richi.set_age_level(LEVELS[age], growth)
            for hat: String in HATS:
                home.richi.wear_hat("" if hat == "bare" else hat)
                home.richi.player.play(home.richi.FURNITURE_SLEEP, 0, 0)
                home.richi.player.seek(0.65, true)
                for frame in 3:
                    await process_frame
                await RenderingServer.frame_post_draw
                var file := output.path_join("%s-%s-%s.png" % [bed,age,hat])
                if stage.get_texture().get_image().save_png(file) != OK:
                    push_error("Cannot save " + file)
                    quit(1)
                    return
        print("Captured sleep furniture ",bed)
    quit()
