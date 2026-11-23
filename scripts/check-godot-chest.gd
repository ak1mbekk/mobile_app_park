extends SceneTree

const HOME = preload("res://Scenes/Levels/Home.tscn")
var failures := 0


func _initialize() -> void:
    _run.call_deferred()


func _run() -> void:
    var view := SubViewport.new()
    view.own_world_3d = true
    root.add_child(view)
    for phone in [Vector2i(320, 568), Vector2i(390, 844), Vector2i(430, 932)]:
        view.size = Vector2i(540, maxi(960, roundi(540.0 * phone.y / phone.x)))
        var home = HOME.instantiate()
        view.add_child(home)
        home.ball_owned = true
        var combinations: Array = [[], ["chest"]]
        for bed in ["bed", "bed-willow", "settee", "bed-oak", "bed-daybed"]:
            combinations.append([bed])
            combinations.append([bed, "chest"])
        for placed: Array in combinations:
            home._apply_furniture({"placed": placed})
            home._show_room()
            for frame in 3:
                await process_frame
            var oak := placed.has("chest")
            var chest: Node3D = home.stations.get_node("Сундук с игрушками").get_node("Дубовый сундук" if oak else "Исходный сундук")
            var caption := "%s %s" % [phone, str(placed)]
            var bounds := _screen_bounds(chest, home.room_camera)
            var play: Button = home.get_node("%Play")
            for prop: Node3D in home.bedroom.get_children():
                if prop.is_visible_in_tree() and not prop.scene_file_path.is_empty():
                    _check_chest_sightlines(home.room_camera, bounds, chest, prop, caption)
            _expect(chest.is_visible_in_tree() and Rect2(Vector2.ZERO, view.size).encloses(bounds), "Whole chest in frame " + caption)
            for id in ["Header", "Dock", "RoomNavigation", "Sleep", "ToyBall"]:
                var ui: Control = home.get_node("%" + id)
                if ui.is_visible_in_tree():
                    _expect(not bounds.intersects(ui.get_global_rect()), "Chest clear of %s at %s (mesh %s / other %s)" % [id, caption, bounds, ui.get_global_rect()])
            _expect(play.get_global_rect().has_point(bounds.get_center()), "Actual chest centre is interactive " + caption)
            for down in [true, false]:
                var touch := InputEventScreenTouch.new()
                touch.position = bounds.get_center()
                touch.pressed = down
                view.push_input(touch, true)
            _expect(home.game_room.visible, "Tap on visible chest opens games " + caption)
            if home.game_room.visible:
                home.game_room.get_node("%Back").pressed.emit()
        home.queue_free()
        await process_frame
    if failures == 0:
        print("PASS both chests, first bed prompt, all five installed beds and purchased toy across three portrait viewports")
    quit(mini(1, failures))


func _screen_bounds(model: Node3D, camera: Camera3D) -> Rect2:
    var bounds := Rect2()
    var first := true
    for mesh: MeshInstance3D in model.find_children("*", "MeshInstance3D", true, false):
        var box := mesh.get_aabb()
        for i in 8:
            var pixel := camera.unproject_position(mesh.to_global(box.get_endpoint(i)))
            bounds = Rect2(pixel, Vector2.ZERO) if first else bounds.expand(pixel)
            first = false
    return bounds


func _triangles(prop: Node3D) -> PackedVector3Array:
    var triangles := PackedVector3Array()
    for mesh: MeshInstance3D in prop.find_children("*", "MeshInstance3D", true, false):
        if mesh.mesh and mesh.is_visible_in_tree():
            triangles.append_array(mesh.global_transform * mesh.mesh.get_faces())
    return triangles

func _nearest(origin: Vector3, direction: Vector3, triangles: PackedVector3Array) -> float:
    var distance := INF
    for i in range(0, triangles.size(), 3):
        var hit = Geometry3D.ray_intersects_triangle(origin, direction, triangles[i], triangles[i+1], triangles[i+2])
        if hit != null:
            distance = minf(distance, origin.distance_to(hit))
    return distance

func _check_chest_sightlines(camera: Camera3D, bounds: Rect2, chest: Node3D, bed: Node3D, label: String) -> void:
    var chest_faces := _triangles(chest)
    var bed_faces := _triangles(bed)
    var sampled := 0
    for v in [0.35, 0.55, 0.75]:
        for u in [0.30, 0.50, 0.70]:
            var pixel := bounds.position + bounds.size * Vector2(u, v)
            var origin := camera.project_ray_origin(pixel)
            var ray := camera.project_ray_normal(pixel)
            var chest_depth := _nearest(origin, ray, chest_faces)
            if is_finite(chest_depth):
                sampled += 1
                _expect(chest_depth < _nearest(origin, ray, bed_faces), "Furniture hides chest mesh from the camera: %s at %s" % [label, pixel])
    _expect(sampled >= 3, "At least three rays hit the visible chest in " + label)
func _expect(condition: bool, message: String) -> void:
    if not condition:
        failures += 1
        push_error(message)
