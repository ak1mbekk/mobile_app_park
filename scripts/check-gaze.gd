extends SceneTree

# Run with --fixed-fps 30 or 60. A directory after -- enables the 30 fps take.
var stage := SubViewport.new()
var scene: Node
var marker := Control.new()
var gaze
var apple
var camera: Camera3D
var dest := ""
var frame := 0
var elapsed := 0.0
var held := false
var point := Vector2.ZERO
var failures := PackedStringArray()
var start_pose: Transform3D
var rendered_head: Basis
var rendered_spine: Basis
var neutral_head: Basis
var neutral_spine: Basis
const EDGES := [Vector2(0.5,0.5), Vector2(0.02,0.5), Vector2(0.98,0.5), Vector2(0.5,0.02), Vector2(0.5,0.98)]
const EDGE_NAMES := ["centre", "left", "right", "top", "bottom"]

func _initialize() -> void:
    setup.call_deferred()

func setup() -> void:
    var args := OS.get_cmdline_user_args()
    if not args.is_empty():
        dest = args[0]
        DirAccess.make_dir_recursive_absolute(dest)
    stage.size = Vector2i(810,1440)
    stage.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    stage.own_world_3d = true
    # A standalone test viewport has no window focus of its own.
    root.add_child(stage)
    scene = load("res://Scenes/Levels/FirstMeeting.tscn").instantiate()
    scene.get_node("Знакомство").save_path = "user://gaze-qa-unused.cfg"
    stage.add_child(scene)
    gaze = scene.get_node("Аки").gaze
    apple = scene.get_node("Яблоко")
    camera = stage.get_camera_3d()
    if not gaze or not camera:
        push_error("Gaze acceptance scene did not initialize")
        quit(1)
        return
    start_pose = scene.get_node("Аки").transform
    var rig: Skeleton3D = gaze.skeleton
    var spine := rig.find_bone("mixamorig_Spine")
    rig.skeleton_updated.connect(func():
        rendered_head = rig.get_bone_global_pose(gaze.head).basis.orthonormalized()
        rendered_spine = rig.get_bone_global_pose(spine).basis.orthonormalized())
    var overlay := CanvasLayer.new()
    stage.add_child(overlay)
    overlay.add_child(marker)
    marker.mouse_filter = Control.MOUSE_FILTER_IGNORE
    marker.draw.connect(func():
        if held:
            marker.draw_circle(point, 12, Color(0.1,0.1,0.1,0.38))
            marker.draw_arc(point,12,0,TAU,40,Color.WHITE,2.5,true))
    process_frame.connect(tick)

func expect(ok: bool, message: String) -> void:
    if not ok:
        failures.append(message)
        push_error(message)

func touch(pos: Vector2, down: bool, index := 0, cancel := false) -> void:
    var e := InputEventScreenTouch.new()
    e.position=pos; e.index=index; e.pressed=down; e.canceled=cancel
    stage.push_input(e,true)

func drag(pos: Vector2, index := 0) -> void:
    var e := InputEventScreenDrag.new()
    e.position=pos; e.index=index
    stage.push_input(e,true)

func tick() -> void:
    elapsed += stage.get_process_delta_time()
    if elapsed + 0.000001 < 1.0 / 30.0:
        return
    elapsed -= 1.0 / 30.0
    frame += 1
    var size := Vector2(stage.size)
    var centre := Vector2(.58,.43)
    var stops := [centre,Vector2(.12,.52),Vector2(.88,.14),Vector2(.87,.80)]
    if frame == 26:
        held=true; point=centre*size; touch(point,true)
    if held and frame <= 242:
        var leg := clampi((frame-26)/70,0,2)
        var t := smoothstep(0.0,1.0,clampf(float(frame-31-leg*70)/18.0,0,1))
        point = stops[leg].lerp(stops[leg+1],t)*size
        drag(point)
    if frame == 243:
        held=false; touch(point,false)
    marker.queue_redraw()
    if frame in [24,52,90,160,231,296]:
        print("frame=",frame," eye=",gaze.angles," head=",gaze.head_angles," finger=",gaze.finger)
    if frame==90:
        expect(gaze.angles.x < -9 and gaze.head_angles.x < -3,"Left target")
        touch(Vector2(.95,.10)*size,true,1); drag(Vector2(.95,.10)*size,1)
        expect(gaze.finger==0 and gaze.screen_point.is_equal_approx(point),"Second finger changed target")
        touch(Vector2(.95,.10)*size,false,1)
    if frame==160:
        expect(gaze.angles.x>5 and gaze.angles.y < -2 and gaze.head_angles.x>1,"Upper right target")
    if frame==231:
        expect(gaze.angles.x>4 and gaze.angles.y>2 and gaze.head_angles.y>0.5,"Lower right target")
    if frame==296:
        expect(gaze.angles.length()<0.1 and gaze.head_angles.length()<0.1,"Release did not settle")
        expect(scene.get_node("Аки").transform==start_pose,"Actor moved when only head and eyes should move")
    if frame<=300 and not dest.is_empty():
        RenderingServer.force_draw(false)
        capture(frame)
    if frame==301:
        point=Vector2(.08,.45)*size; touch(point,true)
    if frame==304:
        expect(gaze.angles.length()>1 and gaze.head_angles.length()<0.1,"Head must start after the eyes")
        touch(point,false,0,true)
    if frame==320:
        point=camera.unproject_position(apple.to_global(apple.mesh.get_aabb().get_center()))
        touch(point,true)
        expect(gaze.fruit==apple,"Grip did not take gaze priority")
        drag(point+Vector2(35,-24));touch(point+Vector2(35,-24),false)
        expect(gaze.fruit==apple,"Gaze lost the returning apple")
    if frame==339:
        expect(gaze.fruit==null and not apple.delivered,"Miss did not return to floor")
        touch(point,true)
        paused=true
        expect(gaze.fruit==null and gaze.angles.is_zero_approx() and apple.pointer==apple.NO_POINTER,"Paused drag remained active")
        paused=false
    if frame==357:
        expect(not apple.delivered,"Paused drag delivered a meal")
        scene.get_node("Аки").player.pause()
    if frame==362:
        neutral_head = rendered_head
        neutral_spine = rendered_spine
    if frame >= 365 and frame < 515:
        var i := floori(float(frame-365) / 30.0)
        var t := (frame-365) % 30
        if t == 0:
            held = true
            point = EDGES[i] * size
            var motion := InputEventMouseMotion.new()
            motion.position = point
            stage.push_input(motion,true)
            marker.queue_redraw()
        if t == 28:
            expect(absf(gaze.angles.x) <= gaze.horizontal_degrees and absf(gaze.angles.y) <= gaze.vertical_degrees,"Eye limits")
            if i == 1:
                expect(rad_to_deg(rendered_head.get_rotation_quaternion().angle_to(neutral_head.get_rotation_quaternion())) > 4.0, "Head did not turn in the final skeleton pose")
                expect(rendered_spine.is_equal_approx(neutral_spine), "Spine changed with head turn")
            if not dest.is_empty():
                RenderingServer.force_draw(false)
                capture_still(EDGE_NAMES[i])
    if frame==515:
        gaze.notification(Node.NOTIFICATION_APPLICATION_FOCUS_OUT)
        expect(gaze.angles.is_zero_approx() and gaze.head_angles.is_zero_approx(),"Focus loss")
    if frame==522:
        print("Gaze / drag checks: ", "PASS" if failures.is_empty() else failures)
        quit(0 if failures.is_empty() else 1)

func capture(number: int) -> void:
    stage.get_texture().get_image().save_jpg(dest.path_join("frame-%03d.jpg"%number),0.95)

func capture_still(label: String) -> void:
    stage.get_texture().get_image().save_jpg(dest.path_join("edge-%s.jpg"%label),0.97)
