extends SceneTree

# Samples the final SkeletonModifier3D output, not the animation's unmodified pose.
class FinalPose:
    extends SkeletonModifier3D
    var bones: Array[Transform3D] = []
    func _process_modification_with_delta(_delta: float) -> void:
        bones.clear()
        for index in get_skeleton().get_bone_count():
            bones.append(get_skeleton().get_bone_global_pose(index))

var failures := 0
var minimum_gap := INF
var maximum_error := 0.0
var samples := 0

func _initialize() -> void:
    run.call_deferred()

func expect(ok: bool, label: String) -> void:
    if not ok:
        failures += 1
        push_error(label)

func run() -> void:
    var world := Node3D.new()
    root.add_child(world)
    var camera := Camera3D.new()
    camera.position = Vector3(0.2, 0.4, 1.65)
    world.add_child(camera)
    camera.current = true
    var actor = load("res://Scenes/Characters/Richi.tscn").instantiate()
    world.add_child(actor)
    var probe := FinalPose.new()
    actor.skeleton.add_child(probe)
    for level in [1, 4, 10]:
        actor.set_age_level(level, load("res://Art/Characters/RichiGrowth.res"))
        actor.set_needs({"food": 100, "energy": 80, "joy": 70, "clean": 80})
        for direction in [-0.70, 0.70]:
            actor.idle_in_home()
            actor.rotation.y = direction
            await create_timer(0.5).timeout
            actor.react_to_full_meal()
            await create_timer(0.15).timeout
            expect(absf(angle_difference(direction, actor.rotation.y)) > 0.01, "Turn begins smoothly from either side")
            expect(absf(actor.rotation.y - atan2(camera.position.x, camera.position.z)) > 0.01, "Turn does not snap to camera")
            await create_timer(0.55).timeout
            expect(absf(actor.rotation.y - atan2(camera.position.x, camera.position.z)) < 0.002, "Chest faces camera before belly contact")
            expect(not actor.presentation.meal_exhaled, "Breath follows the hand arc")
            for at in [0.70, 0.85, 1.00, 1.15, 1.30, 1.50]:
                while actor.presentation.reaction_time < at:
                    await process_frame
                await process_frame
                var palm: Vector3 = probe.bones[actor.skeleton.find_bone("mixamorig_RightHandMiddle1")].origin
                maximum_error = maxf(maximum_error, palm.distance_to(actor.presentation.pose.meal_contact))
                var gap := palm_surface_gap(actor, probe, palm)
                minimum_gap = minf(minimum_gap, gap)
                expect(gap > 0.015 and gap < 0.15, "Palm stays outside the full belly and close to its surface, age %d at %.2f: %.4f" % [level, at, gap])
                samples += 1
            await create_timer(0.25).timeout
            expect(actor.presentation.meal_exhaled, "Exhale starts after the completed arc")
            await create_timer(0.85).timeout
            expect(actor.presentation.reaction.is_empty() and actor.presentation.pose.full == 0.0, "Gesture releases to idle once")
    expect(maximum_error < 0.003, "Reach is physically reachable during contact")
    actor.react_to_full_meal()
    await create_timer(0.12).timeout
    actor.celebrate_purchase()
    await create_timer(0.5).timeout
    expect(actor.presentation.reaction.is_empty() and actor.presentation.pose.full == 0.0, "Another activity cancels the meal pose and turn")
    print("Full meal pose: ", samples, " mesh contacts, minimum gap ", minimum_gap, ", maximum IK error ", maximum_error, ", failures ", failures)
    world.queue_free()
    await process_frame
    quit(0 if failures == 0 else 1)

func palm_surface_gap(actor: Node3D, probe: FinalPose, palm: Vector3) -> float:
    var mesh: ArrayMesh = actor.body.mesh
    var skin: Skin = actor.body.skin
    var surface := mesh.surface_get_arrays(0)
    var vertices: PackedVector3Array = surface[Mesh.ARRAY_VERTEX]
    var normals: PackedVector3Array = surface[Mesh.ARRAY_NORMAL]
    if actor.age_stage > 0:
        var shape := mesh.surface_get_blend_shape_arrays(0)[actor.age_stage - 1]
        vertices = shape[Mesh.ARRAY_VERTEX]
        normals = shape[Mesh.ARRAY_NORMAL]
    var bindings: PackedInt32Array = surface[Mesh.ARRAY_BONES]
    var weights: PackedFloat32Array = surface[Mesh.ARRAY_WEIGHTS]
    var stride := int(bindings.size() / vertices.size())
    var transforms: Array[Transform3D] = []
    for bind in skin.get_bind_count():
        var bone: int = actor.skeleton.find_bone(skin.get_bind_name(bind))
        if bone < 0:
            bone = skin.get_bind_bone(bind)
        transforms.append(probe.bones[bone] * skin.get_bind_pose(bind))
    var points := PackedVector3Array()
    var torso := PackedByteArray()
    for i in vertices.size():
        var point := Vector3.ZERO
        var normal := Vector3.ZERO
        var torso_weight := 0.0
        for k in stride:
            var index := i * stride + k
            var bind := bindings[index]
            point += (transforms[bind] * vertices[i]) * weights[index]
            normal += (transforms[bind].basis * normals[i]) * weights[index]
            if bind < 4:
                torso_weight += weights[index]
        # Include the full-belly vertex shader, with a conservative extra 4 mm
        # in rig space for the textured coat. No reference to the IK target.
        var region := (point - Vector3(0, 0.58, 0.43)) / Vector3(0.42, 0.34, 0.31)
        point += normal.normalized() * (0.079 * (1.0 - smoothstep(0.02, 1.0, region.length())) * smoothstep(0.35, 0.84, torso_weight))
        points.append(point)
        torso.append(1 if torso_weight > 0.75 else 0)
    # Fur contains disconnected triangles: use the front envelope across the
    # whole palm footprint so a ray cannot accidentally pass through a seam.
    var front := -INF
    for i in points.size():
        if torso[i] and absf(points[i].x - palm.x) < 0.065 and absf(points[i].y - palm.y) < 0.075:
            front = maxf(front, points[i].z)
    expect(is_finite(front), "Palm footprint overlaps the animated torso")
    return palm.z - front - 0.004
