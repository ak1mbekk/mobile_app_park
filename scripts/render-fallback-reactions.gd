extends SceneTree
## Render transparent frames from the live rig. Run this with the Godot project
## and pass the destination after `--`.

const RICHI = preload("res://Scenes/Characters/Richi.tscn")
const GROWTH = preload("res://Art/Characters/RichiGrowth.res")
const MEETING = preload("res://Scenes/Levels/FirstMeeting.tscn")
const AGE_LEVELS := {"kit": 1, "young": 4, "adult": 10}
const HATS := ["bare", "cap", "ranger", "crown"]
const CELL := Vector2i(232, 258)
const COLUMNS := 6
const ROWS := 5
const LOOK_FRAMES := 4
const JUMP_FRAMES := 10
const CLAP_FRAMES := 16
const MEETING_CELL := Vector2i(420, 840)

var stage := SubViewport.new()
var actor: Node3D

func _initialize() -> void:
    render.call_deferred()

func render() -> void:
    var args := OS.get_cmdline_user_args()
    if args.is_empty():
        push_error("Pass the destination atlas directory after --")
        quit(1)
        return
    var destination := args[0]
    DirAccess.make_dir_recursive_absolute(destination)
    stage.size = CELL
    stage.transparent_bg = true
    stage.own_world_3d = true
    stage.msaa_3d = Viewport.MSAA_4X
    stage.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    root.add_child(stage)

    var world := WorldEnvironment.new()
    world.environment = Environment.new()
    world.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
    world.environment.ambient_light_color = Color("#fff0dd")
    world.environment.ambient_light_energy = 0.62
    stage.add_child(world)
    light(Vector3(-0.8, 1.8, 2.0), 0.94, Color("#fff0dc"))
    light(Vector3(1.4, 0.8, 1.1), 0.43, Color("#e5edff"))
    light(Vector3(0.3, 1.5, -1.5), 0.62, Color("#ffdeae"))
    var camera := Camera3D.new()
    camera.projection = Camera3D.PROJECTION_ORTHOGONAL
    camera.size = 1.05
    stage.add_child(camera)
    var target := Vector3(0, 0.43, 0.0)
    camera.position = target + Vector3(0.13, 0.22, 2.4)
    camera.look_at(target)
    camera.current = true

    actor = RICHI.instantiate()
    stage.add_child(actor)
    for age: String in AGE_LEVELS:
        actor.set_age_level(AGE_LEVELS[age], GROWTH)
        for hat: String in HATS:
            actor.wear_hat("" if hat == "bare" else hat)
            var atlas := Image.create_empty(CELL.x * COLUMNS, CELL.y * ROWS, false, Image.FORMAT_RGBA8)
            await capture_looks(atlas)
            await capture_celebration(atlas)
            var file := destination.path_join("%s-%s.webp" % [age, hat])
            if atlas.save_webp(file, true, 0.87) != OK:
                push_error("Could not write " + file)
                quit(1)
                return
            print("Wrote ", file)
    await capture_meeting(destination)
    quit()

func light(position: Vector3, energy: float, color: Color) -> void:
    var source := DirectionalLight3D.new()
    stage.add_child(source)
    source.position = position
    source.look_at(Vector3(0, 0.45, 0))
    source.light_energy = energy
    source.light_color = color

func freeze(clip: StringName, seconds: float) -> void:
    # Keep the player active so the rig applies its clip-dependent paw retargeting.
    actor.player.play(clip, 0.0, 0.0)
    actor.player.seek(seconds, true)

func capture_looks(atlas: Image) -> void:
    actor.paw_pose.clapping = false
    await capture_gaze(atlas, false)

func capture_gaze(atlas: Image, meeting: bool) -> void:
    actor.gaze.reset_attention()
    actor.gaze.mood_angles = Vector2.ZERO
    freeze(actor.WAIT if meeting else actor.REST, 0.55)
    var eyes := [0.0, 14.0, 14.0, 7.0]
    var head := [0.0, 0.0, 10.0, 4.0]
    for frame in LOOK_FRAMES:
        actor.gaze.head_angles = Vector2(head[frame], 0.0)
        actor.gaze.surface.set_shader_parameter("gaze", Vector2(eyes[frame], 0.0))
        await capture(atlas, frame, 2 if meeting else COLUMNS)

func capture_celebration(atlas: Image) -> void:
    actor.gaze.reset_attention()
    var jump: StringName = actor.PURCHASE_JUMP
    var clap: StringName = actor.PURCHASE_CLAP
    var jump_length: float = actor.player.get_animation(jump).length
    for frame in JUMP_FRAMES:
        freeze(jump, lerpf(0.02, jump_length - 0.02, float(frame) / (JUMP_FRAMES - 1)))
        await capture(atlas, LOOK_FRAMES + frame)
    actor.paw_pose.clapping = true
    for frame in CLAP_FRAMES:
        freeze(clap, lerpf(0.24, 1.86, float(frame) / (CLAP_FRAMES - 1)))
        await capture(atlas, LOOK_FRAMES + JUMP_FRAMES + frame)

func capture_meeting(destination: String) -> void:
    stage.queue_free()
    stage = SubViewport.new()
    stage.size = MEETING_CELL
    stage.own_world_3d = true
    stage.msaa_3d = Viewport.MSAA_4X
    stage.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    root.add_child(stage)
    var meeting := MEETING.instantiate()
    var welcome: CanvasLayer = meeting.get_node("Знакомство")
    welcome.introduction_enabled = false
    stage.add_child(meeting)
    meeting.get_node("Яблоко").hide()
    actor = meeting.get_node("Аки")
    var atlas := Image.create_empty(MEETING_CELL.x * 2, MEETING_CELL.y * 2, false, Image.FORMAT_RGBA8)
    await capture_gaze(atlas, true)
    var file := destination.path_join("meeting.webp")
    if atlas.save_webp(file, true, 0.87) != OK:
        push_error("Could not write " + file)
    else:
        print("Wrote ", file)

func capture(atlas: Image, frame: int, columns := COLUMNS) -> void:
    await process_frame
    await RenderingServer.frame_post_draw
    var image := stage.get_texture().get_image()
    image.convert(Image.FORMAT_RGBA8)
    var cell := Vector2i(frame % columns, floori(float(frame) / columns)) * stage.size
    atlas.blit_rect(image, Rect2i(Vector2i.ZERO, stage.size), cell)
