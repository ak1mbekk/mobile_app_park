extends SceneTree
var stage: SubViewport
var room: Node3D
var out: String

func _initialize() -> void:
    _run.call_deferred()

func _run() -> void:
    out = OS.get_cmdline_user_args()[0]
    DirAccess.make_dir_recursive_absolute(out)
    ProjectSettings.set_setting("application/config/use_custom_user_dir", true)
    ProjectSettings.set_setting("application/config/custom_user_dir_name", "animal-park-food-capture-%d" % OS.get_process_id())
    DirAccess.make_dir_recursive_absolute(OS.get_user_data_dir())
    stage = SubViewport.new()
    stage.size = Vector2i(390, 844)
    stage.size_2d_override = Vector2i(540, 1169)
    stage.size_2d_override_stretch = true
    stage.own_world_3d = true
    stage.msaa_3d = Viewport.MSAA_4X
    stage.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    root.add_child(stage)
    room = preload("res://Scenes/Levels/Home.tscn").instantiate()
    stage.add_child(room)
    room.native_leaves = 3
    room.native_needs.food = 50.0
    room.native_needs_updated = Time.get_unix_time_from_system()
    room._update_native_stats()
    room._go_to_room(&"kitchen")
    await create_timer(1.0).timeout
    await shot("native-01-bowl")
    room._offer_food("pear")
    await create_timer(0.8).timeout
    await shot("native-02-pear")
    var camera: Camera3D = room.room_camera
    var from := camera.unproject_position(room.apple.global_position + room.apple.center_offset())
    var to := camera.unproject_position(room.apple.palm_center())
    room.apple.try_grab(from, 0)
    room.apple.drag_to(from.lerp(to, 0.55))
    await shot("native-03-drag")
    room.apple.drop_at(to)
    await create_timer(0.4).timeout
    await shot("native-04-in-paws")
    await create_timer(3.5).timeout
    await shot("native-05-finished")
    print("CAPTURE native kitchen food, wallet=", room.native_leaves, "; pantry=", room.kitchen_food.state, "; food=", room.native_needs.food)
    quit()

func shot(name: String) -> void:
    for frame in 3:
        await process_frame
    await RenderingServer.frame_post_draw
    stage.get_texture().get_image().save_png(out.path_join(name + ".png"))
