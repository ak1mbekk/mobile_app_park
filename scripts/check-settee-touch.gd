extends SceneTree

const HOME = preload("res://Scenes/Levels/Home.tscn")
var failures := PackedStringArray()
var output := ""

class IsolatedHome:
    extends "res://Scenes/Home/Home.gd"
    func _load_home() -> void:
        native_needs = {"food": 75.0, "energy": 50.0, "joy": 75.0, "clean": 75.0}
        native_needs_updated = Time.get_unix_time_from_system()
        _sync_native_shop()
        _update_native_stats()
    func _save_home() -> bool:
        return true

func _initialize() -> void:
    run.call_deferred()

func check(condition: bool, label: String) -> void:
    if not condition:
        failures.append(label)
        push_error(label)

func touch(view: Viewport, point: Vector2) -> void:
    for down in [true, false]:
        var event := InputEventScreenTouch.new()
        event.position = point
        event.index = 0
        event.pressed = down
        view.push_input(event, true)
        await process_frame

func run() -> void:
    var args := OS.get_cmdline_user_args()
    if not args.is_empty():
        output = args[0]
        DirAccess.make_dir_recursive_absolute(output)
    for phone: Vector2i in [Vector2i(320,568), Vector2i(390,844)]:
        await check_phone(phone)
    if failures.is_empty():
        print("PASS 320/390 real touch on Richi, clear floor, chest, sofa, pillow and sleeping pet, bridge targets, bed change and front-facing idle")
    quit(0 if failures.is_empty() else 1)

func bone_pixel(home, bone: StringName) -> Vector2:
    var sk: Skeleton3D = home.richi.skeleton
    return home.room_camera.unproject_position(sk.to_global(sk.get_bone_global_pose(sk.find_bone(bone)).origin))

func bridge_sleep(home, size: Vector2) -> Vector2:
    var state = JSON.parse_string(home._interaction_state([]))
    var point = state.controls.sleep
    return Vector2(point.x, point.y)*size

func capture(view: Viewport, name: String) -> void:
    if not output.is_empty():
        await RenderingServer.frame_post_draw
        view.get_texture().get_image().save_webp(output.path_join(name+".webp"),false,.94)

func check_phone(phone: Vector2i) -> void:
    var view := SubViewport.new()
    var factor := minf(phone.x/540.0,phone.y/960.0)
    view.size = Vector2i(Vector2(phone)/factor)
    view.own_world_3d = true
    view.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    root.add_child(view)
    var home = HOME.instantiate()
    var growth: ArrayMesh = home.growth_mesh
    home.set_script(IsolatedHome)
    home.growth_mesh = growth
    view.add_child(home)
    await process_frame
    home.native_owned.assign(["bed", "settee", "cushion"])
    home.native_placed.assign(["settee", "cushion"])
    home._apply_furniture({"placed":home.native_placed})
    home._show_room(false)
    var sofa: Node3D = home.bedroom.get_node("Диван")
    var pillow: Node3D = home.furnishings.get_node("cushion")
    check(pillow.is_visible_in_tree() and pillow.global_transform.is_equal_approx(sofa.get_node("Место для вышитой подушки").global_transform), "Bought pillow occupies the seat")
    for place in [home.KITCHEN,home.BATH,home.MAIN]:
        home._go_to_room(place)
        await create_timer(.45).timeout
        var direction: Vector3 = home.room_camera.global_position-home.richi.global_position
        direction.y = 0
        check(direction.normalized().dot(home.richi.global_basis.z.normalized())>.995, "Idle faces camera in "+str(place))
    var camera: Camera3D = home.room_camera
    var hit = home.get_node("%Sleep")
    var face := bone_pixel(home,"mixamorig_Head")
    var body := bone_pixel(home,"mixamorig_Spine1")
    for point: Vector2 in [face,body,Vector2(view.size)*Vector2(.49,.83)]:
        home.richi.gaze.reset_attention()
        await touch(view,point)
        check(not home.night and home.richi.gaze.pointing, "Standing pet and floor receive touch at "+str(point))
    var chest: Node3D = home.stations.get_node("Сундук с игрушками/Метка")
    await touch(view,camera.unproject_position(chest.global_position))
    check(home.game_room.visible and not home.night, "Chest opens its game menu")
    home.game_room.hide()
    home._close_games()
    var arm: Vector2 = camera.unproject_position(sofa.get_node("Левый валик").global_position)
    check(hit._has_point(arm-hit.global_position), "Visible sofa arm accepts touch")
    var target := bridge_sleep(home,view.size)
    check(target.distance_to(camera.unproject_position(pillow.global_position)) < 1.0, "Awake bridge points to visible cushion")
    var prefix := "settee" if phone.x==390 else "settee-320"
    await capture(view,prefix+"-awake")
    await touch(view,target)
    check(home.night, "Touching the pillow starts sleep")
    await create_timer(6.5).timeout
    await capture(view,prefix+"-sleep")
    target = bridge_sleep(home,view.size)
    check(target.distance_to(bone_pixel(home,"mixamorig_Head")) < 1.0, "Sleeping bridge points to Richi")
    await touch(view,target)
    check(not home.night,"Touching sleeping Richi wakes him")
    await create_timer(5.0).timeout
    home._set_sleep(true,false)
    await create_timer(.5).timeout
    var visible_seat := camera.unproject_position(pillow.global_position)
    if not view.get_visible_rect().has_point(visible_seat):
        visible_seat = camera.unproject_position(sofa.get_node("Сиденье").global_position)
    await touch(view,visible_seat)
    check(not home.night,"Touching the sofa also wakes him")
    await create_timer(5.0).timeout
    home._apply_furniture({"placed":["bed","cushion"]})
    check(pillow.transform.is_equal_approx(home.cushion_floor),"Switching beds restores the floor cushion")
    view.queue_free()
    await process_frame
