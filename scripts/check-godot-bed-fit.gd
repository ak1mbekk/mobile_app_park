extends SceneTree

# For deterministic travel sampling, use --fixed-fps 30. Optional user arguments:
# -- <screenshot directory or -> [viewport width] [viewport height]
# The contact checks run headless. Saving frames requires a rendering backend.
func _initialize() -> void:
    check.call_deferred()

func skinned_body(actor: Node3D) -> PackedVector3Array:
    var skeleton: Skeleton3D = actor.skeleton
    var skin: Skin = actor.body.skin
    var mesh: ArrayMesh = actor.body.mesh
    var surface := mesh.surface_get_arrays(0)
    var points: PackedVector3Array = surface[Mesh.ARRAY_VERTEX]
    if actor.age_stage > 0:
        points = mesh.surface_get_blend_shape_arrays(0)[actor.age_stage - 1][Mesh.ARRAY_VERTEX]
    var bones: PackedInt32Array = surface[Mesh.ARRAY_BONES]
    var weights: PackedFloat32Array = surface[Mesh.ARRAY_WEIGHTS]
    var stride := int(bones.size() / points.size())
    var transforms: Array[Transform3D] = []
    for bind in skin.get_bind_count():
        var index := skeleton.find_bone(skin.get_bind_name(bind))
        if index < 0:
            index = skin.get_bind_bone(bind)
        transforms.append(skeleton.global_transform * skeleton.get_bone_global_pose(index) * skin.get_bind_pose(bind))
    var vertices := PackedVector3Array()
    for i in points.size():
        var world := Vector3.ZERO
        for k in stride:
            var index := i * stride + k
            if weights[index] > 0:
                world += (transforms[bones[index]] * points[i]) * weights[index]
        vertices.append(world)
    return vertices

const STAGES := ["bed", "bed-willow", "settee", "bed-oak", "bed-daybed"]
const PRICES := [5, 20, 40, 70, 110]
const CATALOG := preload("res://Scenes/Shop/ShopCatalog.gd")
var home
var failures := 0
var picture_dir := ""
var comparison_camera: Transform3D
var comparison_fov: float

func expect(ok: bool, label: String) -> bool:
    if not ok:
        failures += 1
        push_error(label)
    return ok

func load_room() -> void:
    home = load("res://Scenes/Levels/Home.tscn").instantiate()
    root.add_child(home)

func discard_room() -> void:
    home.queue_free()
    await process_frame
    home = null

func shown_bed() -> Node3D:
    var furniture: Array[Node3D] = []
    for node: Node3D in home.bedroom.get_children():
        if node.visible and not node.scene_file_path.is_empty():
            furniture.append(node)
    if not expect(furniture.size() <= 1, "Two bed models share the sleep position"):
        return null
    return furniture[0] if not furniture.is_empty() else null

func select(id: String) -> void:
    if not home.shop.visible:
        home.get_node("%Shop").pressed.emit()
    home.shop.get_node("%Furniture").pressed.emit()
    home.shop.get_node("%" + id).pressed.emit()

func check() -> void:
    var args := OS.get_cmdline_user_args()
    if not args.is_empty() and args[0] != "-":
        picture_dir = args[0]
        if not expect(DirAccess.make_dir_recursive_absolute(picture_dir) == OK, "Create capture directory"):
            quit(1)
            return
    root.size = Vector2i(args[1].to_int(), args[2].to_int()) if args.size() == 3 else Vector2i(390, 844)
    # A runner can allocate APPDATA/XDG_DATA_HOME before engine startup and supply
    # the expected empty profile. This keeps the GPU shader cache at its boot path.
    var dedicated := OS.get_environment("RICHI_SLEEP_TEST_PROFILE").replace("\\", "/").trim_suffix("/")
    var profile := OS.get_user_data_dir()
    if dedicated.is_empty():
        var folder := "animal-park-sleep-qa-%d-%d" % [OS.get_process_id(), Time.get_ticks_usec()]
        ProjectSettings.set_setting("application/config/use_custom_user_dir", true)
        ProjectSettings.set_setting("application/config/custom_user_dir_name", folder)
        profile = OS.get_user_data_dir()
        if not expect(profile.get_file() == folder and not DirAccess.dir_exists_absolute(profile)
                and DirAccess.make_dir_recursive_absolute(profile) == OK, "Isolate QA save"):
            quit(1)
            return
    elif not expect(dedicated == profile and not FileAccess.file_exists("user://home.cfg")
            and not FileAccess.file_exists("user://first_meeting.cfg"), "Native runner supplies an empty dedicated profile"):
        quit(1)
        return
    var legacy := ConfigFile.new()
    legacy.set_value("home", "owned", ["bed", "settee", "chest"])
    legacy.set_value("home", "placed", ["bed", "settee", "chest"])
    legacy.set_value("home", "night", true)
    legacy.set_value("home", "leaves", 19)
    expect(legacy.save("user://home.cfg") == OK, "Seed previous release save")
    load_room()
    expect(home.night and home.richi.sleeping_on_furniture and home.native_placed.has("settee")
            and not home.native_placed.has("bed") and home.native_owned.has("bed"), "Restore a sleeping legacy owner with both beds installed on the settee")
    await discard_room()
    var fixture := ConfigFile.new()
    fixture.set_value("home", "owned", ["chest"])
    fixture.set_value("home", "placed", ["chest"])
    fixture.set_value("home", "leaves", 245)
    expect(fixture.save("user://home.cfg") == OK, "Seed exact purchase funds")
    load_room()
    var balance := 245
    var resources := {}
    for i in STAGES.size():
        var id: String = STAGES[i]
        if not expect(CATALOG.ITEMS.get(id, {}).get("price", -1) == PRICES[i] and home.shop.has_node("%" + id), "Missing shop card or changed price: " + id):
            break
        var before := shown_bed()
        var owned: Array = home.native_owned.duplicate()
        var placed: Array = home.native_placed.duplicate()
        select(id)
        var preview := shown_bed()
        expect(preview != null and preview != before, "Preview the new bed in the room: " + id)
        await create_timer(0.7).timeout
        if preview:
            var preview_pixels := projected_bounds(preview)
            var panel: Control = home.shop.get_node("%Detail")
            expect(root.get_visible_rect().grow(-2).encloses(preview_pixels) and not panel.get_global_rect().intersects(preview_pixels),
                    "Whole bed visible above shop detail panel: %s (%s vs %s)" % [id, preview_pixels, panel.get_global_rect()])
            await capture("%02d-%s-preview" % [i + 1, id])
        home.shop.get_node("%Back").pressed.emit()
        expect(shown_bed() == before and home.native_owned == owned and home.native_placed == placed
                and home.native_leaves == balance, "Cancel restores the old bed and balance: " + id)
        select(id)
        home.shop.get_node("%Confirm").pressed.emit()
        balance -= int(PRICES[i])
        expect(shown_bed() == preview and home.native_leaves == balance, "Install the preview for exactly its ticket price: " + id)
        await discard_room()
        load_room()
        var installed := shown_bed()
        if not expect(installed != null, "Installed bed visible after restart: " + id):
            break
        resources[installed.scene_file_path] = true
        expect(home.native_leaves == balance and home.native_placed.has("chest") and home.native_placed.has(id)
                and home.native_placed.size() == 2, "Saved bed is exclusive and coexists with chest: " + id)
        for level in [1, 4, 10]:
            home.native_xp = (level - 1) * 30
            home._update_native_stats()
            home.native_needs.energy = 42.0
            var floor_pos: Vector3 = home.richi.position
            await travel(id, true)
            await create_timer(0.70).timeout
            home.sleep_signals._process(0.0)
            expect(home.sleep_signals.visible and home.sleep_signals.head_bone >= 0
                    and root.get_visible_rect().has_point(home.sleep_signals.anchor),
                    "%s level %d shows sleep Zs above a visible head" % [id, level])
            expect(home.active_mode == &"sleep" and home.richi.sleeping_on_furniture and home.richi.player.is_playing()
                    and home.richi.eyelid_value > 0.95, "%s level %d settled, breathing with closed eyes" % [id, level])
            var support := PackedVector3Array()
            var footprint := AABB()
            var first := true
            for mesh: MeshInstance3D in installed.find_children("*", "MeshInstance3D", true, false):
                if mesh.mesh and mesh.is_visible_in_tree():
                    var box := mesh.global_transform * mesh.get_aabb()
                    footprint = box if first else footprint.merge(box)
                    first = false
                    support.append_array(mesh.global_transform * mesh.mesh.get_faces())
            var vertices := skinned_body(home.richi)
            var pet := AABB(vertices[0], Vector3.ZERO)
            var lowest := vertices[0]
            var outline_points := PackedVector2Array()
            var lowest_by_xz := {}
            for point in vertices:
                pet = pet.expand(point)
                var xz := Vector2(point.x, point.z)
                outline_points.append(xz)
                lowest_by_xz[xz] = minf(lowest_by_xz.get(xz, INF), point.y)
                if point.y < lowest.y:
                    lowest = point
            var surface := surface_height(support, lowest)
            var gap := lowest.y - surface
            var unsupported := 0
            for xz in Geometry2D.convex_hull(outline_points):
                var edge := Vector3(xz.x, lowest_by_xz[xz], xz.y)
                var beneath := surface_height(support, edge)
                if not is_finite(beneath) or beneath < surface - 0.035 or beneath > edge.y + 0.025:
                    unsupported += 1
                    if unsupported == 1:
                        print("OUTLINE ", id, " level ", level, " point ", edge, " support ", beneath)
            expect(unsupported == 0, "%s level %d complete curved outline over mattress (%d unsupported points)" % [id, level, unsupported])
            var margin := minf(minf(pet.position.x - footprint.position.x, footprint.end.x - pet.end.x),
                    minf(pet.position.z - footprint.position.z, footprint.end.z - pet.end.z))
            print("SLEEP FIT ", id, " level ", level, " margin ", margin, " measured contact ", gap)
            expect(margin >= -0.005 and gap >= -0.035 and gap <= 0.025,
                    "%s level %d curled skin on the actual mattress (margin %.3f, contact %.3f)" % [id, level, margin, gap])
            var closeup := root.get_camera_3d()
            var pet_frame := Rect2(closeup.unproject_position(vertices[0]), Vector2.ZERO)
            for point in vertices:
                pet_frame = pet_frame.expand(closeup.unproject_position(point))
            expect(root.get_visible_rect().grow(-2).encloses(pet_frame), "%s level %d complete pet in closeup" % [id, level])
            if home._raised_bed():
                expect(pet_frame.size.x > root.get_visible_rect().size.x * 0.34,
                        "%s level %d pet occupies at least 34 percent of phone width" % [id, level])
            print("SLEEP FRAME ", id, " level ", level, " pet pixels ", pet_frame)
            if level == 10:
                var camera := root.get_camera_3d()
                var sleep_pixels := projected_bounds(installed)
                var phone := root.get_visible_rect().grow(-2)
                expect(phone.intersects(sleep_pixels), "Sleeping cushion remains in frame: %s %s" % [id, sleep_pixels])
                var pet_pixels := Rect2(camera.unproject_position(vertices[0]), Vector2.ZERO)
                for point in vertices:
                    pet_pixels = pet_pixels.expand(camera.unproject_position(point))
                expect(phone.encloses(pet_pixels), "Adult curled actor in frame: " + id)
                if i == 0:
                    comparison_camera = camera.global_transform
                    comparison_fov = camera.fov
                expect(is_equal_approx(camera.fov, comparison_fov) and pet_pixels.size.x > phone.size.x * 0.20,
                        "Sleep camera fits this complete bed at a readable pet size: " + id)
                await capture("%02d-%s-sleep" % [i + 1, id])
            await travel(id, false)
            home.sleep_signals._process(0.0)
            expect(not home.sleep_signals.visible and is_zero_approx(home.sleep_signals.elapsed),
                    "%s level %d removes sleep Zs immediately on wake" % [id, level])
            expect(home.active_mode == &"home" and not home.richi.sleeping_on_furniture and home.richi.position.distance_to(floor_pos) < 0.012,
                    "%s level %d returns to previous floor position" % [id, level])
            if level == 10:
                await capture("%02d-%s-awake" % [i + 1, id])
    if resources.size() == 5:
        select("bed-willow")
        home.shop.get_node("%Confirm").pressed.emit()
        expect(home.native_leaves == 0 and home.native_owned.size() == 6 and home.native_placed.has("bed-willow")
                and not home.native_placed.has("bed-daybed"), "Free reinstall at zero balance retains entire collection")
    expect(resources.size() == 5, "Five distinct equipped scenes after reload")
    await discard_room()
    DirAccess.remove_absolute(profile.path_join("home.cfg"))
    if dedicated.is_empty():
        DirAccess.remove_absolute(profile)
    if failures == 0:
        print("PASS five beds, three growth stages, true mattress contact, continuous entry/exit, native catalog, preview, purchases, legacy migration, free reinstall")
    quit(0 if failures == 0 else 1)

func projected_bounds(prop: Node3D) -> Rect2:
    var rect := Rect2()
    var first := true
    var camera := root.get_camera_3d()
    for piece: MeshInstance3D in prop.find_children("*", "MeshInstance3D", true, false):
        if not piece.is_visible_in_tree() or not piece.mesh:
            continue
        for index in piece.mesh.get_surface_count():
            var points: PackedVector3Array = piece.mesh.surface_get_arrays(index)[Mesh.ARRAY_VERTEX]
            for point in points:
                var pixel := camera.unproject_position(piece.to_global(point))
                rect = Rect2(pixel, Vector2.ZERO) if first else rect.expand(pixel)
                first = false
    return rect

func surface_height(triangles: PackedVector3Array, sample: Vector3) -> float:
    var top := -INF
    var from := Vector3(sample.x, sample.y + 1.0, sample.z)
    for i in range(0, triangles.size(), 3):
        var hit = Geometry3D.ray_intersects_triangle(from, Vector3.DOWN, triangles[i], triangles[i+1], triangles[i+2])
        if hit != null:
            top = maxf(top, hit.y)
    return top

func travel(id: String, to_bed: bool) -> void:
    var start: Vector3 = home.richi.position
    var end: Vector3 = home._sleep_pose().origin if to_bed else home._day_pose().origin
    var previous := start
    var moving_frames := 0
    var largest_step := 0.0
    var lifted := -INF
    var jumped := false
    var stood := false
    var deadline := create_timer(8.0)
    var button: Button = home.get_node("%Sleep")
    expect(button.is_visible_in_tree() and not button.disabled, "Available sleep/wake control for " + id)
    button.pressed.emit()
    expect(home.sleep_moving, "Use the animated sleep/wake path for " + id)
    while home.sleep_moving and deadline.time_left > 0.0:
        await process_frame
        var position: Vector3 = home.richi.position
        var step := previous.distance_to(position)
        if step > 0.00001:
            moving_frames += 1
        largest_step = maxf(largest_step, step)
        lifted = maxf(lifted, position.y - maxf(start.y, end.y))
        previous = position
        var clip := String(home.richi.player.current_animation).to_lower()
        jumped = jumped or clip.contains("jump")
        stood = stood or clip.contains("stand")
    var raised := id in ["settee", "bed-oak", "bed-daybed"]
    expect(deadline.time_left > 0.0 and moving_frames >= 5 and largest_step < 0.095
            and home.richi.position.distance_to(end) < 0.012, "%s %s continuous motion, %d frames, max step %.3f" % [id, to_bed, moving_frames, largest_step])
    expect(jumped == raised and (lifted > 0.008 if raised else lifted < 0.085),
            "%s %s appropriate low step / elevated hop (jump %s, lift %.3f)" % [id, to_bed, jumped, lifted])
    expect(to_bed or stood, "Uncurl and stand before leaving " + id)

func capture(label: String) -> void:
    if picture_dir.is_empty():
        return
    await RenderingServer.frame_post_draw
    var picture := root.get_texture().get_image()
    expect(picture != null and picture.save_png(picture_dir.path_join(label + ".png")) == OK, "Save gameplay screenshot " + label)
