extends SceneTree

const Rig := preload("res://Scenes/Characters/Cutout/CutoutWalkRig.gd")
const RIG_SCENE := preload("res://Scenes/Characters/Cutout/CutoutWalkRig.tscn")
const Walker := preload("res://Scenes/Games/OrchardWalker.gd")
const TOLERANCE := 0.012
const PATH_SEGMENTS := [Vector2(38, 108), Vector2(19, 0), Vector2(31, -103), Vector2(11, 83), Vector2(22, -93)]
const PELVIS := "Skeleton2D/Pelvis/"
const NEAR_SOLE := PELVIS + "NearThigh/Shin/Foot/Art"
const FAR_SOLE := PELVIS + "FarThigh/Shin/Foot/Art"

var failures := 0
var comparisons := 0
var support_samples := 0
var maximum_drift := 0.0


func _initialize() -> void:
    _run.call_deferred()


func _expect(condition: bool, message: String) -> void:
    comparisons += 1
    if condition:
        return
    failures += 1
    if failures <= 15:
        push_error(message)


func _make(parent: Node = null) -> Rig:
    var rig := RIG_SCENE.instantiate() as Rig
    (root if parent == null else parent).add_child(rig)
    rig.reset_at(Vector2(125.0, 320.0))
    return rig


func _positions(rig: Rig) -> Array[Vector2]:
    var result: Array[Vector2] = [rig.global_position]
    for path in [NEAR_SOLE, FAR_SOLE, PELVIS + "NearThigh/Shin", PELVIS + "FarThigh/Shin",
        PELVIS + "NearShoulder/Forearm/Hand", PELVIS + "FarShoulder/Forearm/Hand"]:
        var part := rig.get_node(path) as Node2D
        result.append(part.global_position)
    return result


func _measure_pose(rig: Rig) -> void:
    for near_side: bool in [true, false]:
        var prefix := PELVIS + ("NearThigh" if near_side else "FarThigh")
        var hip := rig.to_local((rig.get_node(prefix) as Bone2D).global_position)
        var knee := rig.to_local((rig.get_node(prefix + "/Shin") as Bone2D).global_position)
        var ankle := rig.to_local((rig.get_node(prefix + "/Shin/Foot") as Bone2D).global_position)
        var foot := rig.get_node(prefix + "/Shin/Foot/Art") as Sprite2D
        _expect(absf(hip.distance_to(knee) - rig.thigh_length) < TOLERANCE, "Thigh changed length")
        _expect(absf(knee.distance_to(ankle) - rig.shin_length) < TOLERANCE, "Shin changed length")
        _expect(foot.global_position.distance_to(rig.sole_world_position(near_side)) < TOLERANCE, "Visible sole misses its world anchor")
        if rig.is_sole_planted(near_side):
            _expect(absf(foot.global_position.y - rig.global_position.y) < TOLERANCE, "Planted sole left ground")
            _expect(absf(foot.global_rotation) < 0.00005, "Planted foot rotated")
    var near_arm := rig.get_node(PELVIS + "NearShoulder") as Bone2D
    var far_arm := rig.get_node(PELVIS + "FarShoulder") as Bone2D
    _expect(absf(near_arm.rotation + far_arm.rotation) < TOLERANCE, "Arms are out of sync")


func _move(rig: Rig, delta_x: float) -> void:
    var old_support: Array[bool] = [rig.is_sole_planted(true), rig.is_sole_planted(false)]
    var soles: Array[Sprite2D] = [rig.get_node(NEAR_SOLE), rig.get_node(FAR_SOLE)]
    var old_position: Array[Vector2] = [soles[0].global_position, soles[1].global_position]
    rig.advance_distance(delta_x)
    _expect(rig.is_sole_planted(true) or rig.is_sole_planted(false), "Both soles left the ground")
    for leg: int in [0, 1]:
        if old_support[leg] and rig.is_sole_planted(leg == 0):
            var drift := old_position[leg].distance_to(soles[leg].global_position)
            maximum_drift = maxf(maximum_drift, drift)
            support_samples += 1
            _expect(drift < TOLERANCE, "Support sole slid by %s px" % drift)
    _measure_pose(rig)


func _sample_at(fps: int) -> Array:
    var rig := _make()
    var snapshots: Array = []
    var subsamples := roundi(fps / 30.0)
    for segment: Vector2 in PATH_SEGMENTS:
        for frame in int(segment.x) * subsamples:
            _move(rig, segment.y / fps)
            if (frame + 1) % subsamples == 0:
                snapshots.append(_positions(rig))
    rig.free()
    return snapshots


func _verify_pause_and_reversal() -> void:
    var rig := _make()
    for progress: float in [0.1, 0.5, 0.9]:
        rig.reset_at(Vector2(125.0, 320.0))
        _move(rig, rig.step_length * progress)
        var before := _positions(rig)
        var pitch := (rig.get_node(NEAR_SOLE) as Sprite2D).global_rotation
        for frame in 60:
            _move(rig, 0.0)
        _expect(before == _positions(rig), "Pause advanced the pose")
        _move(rig, -0.001)
        var after := _positions(rig)
        for part in range(before.size()):
            _expect(before[part].distance_to(after[part]) < 0.025, "Part jumped on reversal at %s" % progress)
        _expect(absf((rig.get_node(NEAR_SOLE) as Sprite2D).global_rotation - pitch) < 0.005, "Airborne foot pitch jumped on reversal")

    rig.reset_at(Vector2(125.0, 320.0))
    for reversal in 40:
        for frame in 15:
            _move(rig, 1.5)
        for frame in 7:
            _move(rig, -0.8)
    rig.free()


func _verify_normal_step() -> void:
    var rig := _make()
    var near_start := rig.sole_world_position(true)
    var far_start := rig.sole_world_position(false)
    _move(rig, rig.step_length * 0.5)
    _expect(rig.sole_world_position(true).y < near_start.y - 5.0, "Swing did not lift the sole")
    _expect(rig.sole_world_position(false) == far_start, "The first step moved the opposite foot")
    _expect(absf((rig.get_node(PELVIS + "NearShoulder") as Bone2D).rotation) > 0.05, "Arms did not swing")
    _move(rig, rig.step_length * 0.5)
    _expect(rig.is_sole_planted(true) and rig.sole_world_position(true).x > rig.global_position.x, "Swing did not finish ahead of the pelvis")
    _move(rig, 1.0)
    _expect(rig.is_sole_planted(true) and not rig.is_sole_planted(false), "Contact did not transfer to the new foot")
    rig.free()


func _verify_long_frame() -> void:
    var one_frame := _make()
    var many_frames := _make()
    one_frame.advance_distance(317.0)
    for frame in 317:
        many_frames.advance_distance(1.0)
    var large := _positions(one_frame)
    var small := _positions(many_frames)
    for part in range(large.size()):
        _expect(large[part].distance_to(small[part]) < TOLERANCE, "Large frame skipped a foot transfer")
    _measure_pose(one_frame)
    one_frame.free()
    many_frames.free()


func _verify_leg_proportions() -> void:
    for dimensions: Vector2 in [Vector2(13, 9), Vector2(11, 130), Vector2(130, 11), Vector2(97, 88)]:
        var rig := _make()
        rig.thigh_length = dimensions.x
        rig.shin_length = dimensions.y
        rig.step_length = 200.0
        rig.swing_height = 45.0
        rig.standing_extension = 0.99
        rig.knees_bend_right = false
        rig.reset_at(Vector2(125.0, 320.0), -1)
        for distance: float in [-0.8, 1.95, -1.1]:
            for frame in 50:
                _move(rig, distance)
        rig.free()


func _verify_skin_and_parent() -> void:
    var actor := Node2D.new()
    root.add_child(actor)
    actor.position = Vector2(77.0, 110.0)
    actor.scale = Vector2(1.6, 1.6)
    var rig := _make(actor)
    var foot := rig.get_node(NEAR_SOLE) as Sprite2D
    var far_foot := rig.get_node(FAR_SOLE) as Sprite2D
    var knee := rig.get_node(PELVIS + "NearThigh/Shin/KneeCap") as Sprite2D
    var far_knee := rig.get_node(PELVIS + "FarThigh/Shin/KneeCap") as Sprite2D
    _expect(foot.texture == null and far_foot.texture == null and knee.texture == null, "Unassigned skin is not empty")
    var support_start := far_foot.global_position
    actor.position.x += 10.0
    rig.follow_world_x(rig.global_position.x)
    _measure_pose(rig)
    _expect(support_start.distance_to(far_foot.global_position) < TOLERANCE, "Parent displacement dragged the planted sole")

    # Reference one existing resource without producing art for this scene.
    var source := load("res://Art/Brand/park-opening.png") as Texture2D
    _expect(source != null, "Texture fixture could not be loaded")
    rig.foot_texture = source
    rig.shin_texture = source
    rig.knee_cap_region = Rect2i(Vector2i(source.get_size() * 0.5), Vector2i(12, 13))
    rig.refresh_skin()
    var cap := knee.texture as ImageTexture
    _expect(foot.texture == source and far_foot.texture == source, "Legs duplicate the foot art")
    _expect(cap != null and cap == far_knee.texture, "Both knees must share a masked texture")
    if cap != null:
        _verify_knee_mask(source, cap, rig.knee_cap_region)
    _expect((rig.get_node(PELVIS + "FarThigh") as CanvasItem).modulate == rig.far_tint, "Far leg is not shaded")
    var planted_flip := far_foot.flip_h
    _move(rig, -1.0)
    _expect(far_foot.flip_h == planted_flip, "Reversal flipped the planted foot art")
    rig.foot_texture = null
    rig.shin_texture = null
    rig.refresh_skin()
    _expect(foot.texture == null and knee.texture == null, "Clearing slots retained stale art")
    actor.free()


func _verify_knee_mask(source: Texture2D, cap: ImageTexture, region: Rect2i) -> void:
    var original := source.get_image()
    if original.is_compressed():
        _expect(original.decompress() == OK, "Original patch could not be decoded")
    var mask := cap.get_image()
    _expect(mask.get_size() == region.size, "Patch changed dimensions")
    for corner: Vector2i in [Vector2i(0, 0), Vector2i(11, 0), Vector2i(0, 12), Vector2i(11, 12)]:
        _expect(original.get_pixelv(region.position + corner).a > 0.99, "Fixture needs opaque original corners")
        _expect(mask.get_pixelv(corner).a == 0.0, "Opaque source corner survived the round mask")
    var center := Vector2i(6, 6)
    _expect(mask.get_pixelv(center).is_equal_approx(original.get_pixelv(region.position + center)), "Center source pixel was altered")
    var edge := mask.get_pixel(1, 2).a
    _expect(edge > 0.0 and edge < 1.0, "Knee circle has no antialiased edge")


func _verify_real_skeleton() -> void:
    var rig := _make()
    var skeleton := rig.get_node("Skeleton2D") as Skeleton2D
    _expect(skeleton != null and skeleton.get_bone_count() == 14, "The scene lacks fourteen registered skeleton bones")
    for i in skeleton.get_bone_count():
        var bone := skeleton.get_bone(i)
        _expect(bone.get_index_in_skeleton() == i and bone.rest.determinant() > 0.99, "Skeleton bone has invalid index or rest transform")
    for side: String in ["Near", "Far"]:
        var thigh := rig.get_node(PELVIS + side + "Thigh") as Bone2D
        var shin := thigh.get_node("Shin") as Bone2D
        var foot := shin.get_node("Foot") as Bone2D
        var shoulder := rig.get_node(PELVIS + side + "Shoulder") as Bone2D
        var forearm := shoulder.get_node("Forearm") as Bone2D
        var hand := forearm.get_node("Hand") as Bone2D
        for bone: Bone2D in [thigh, shin, foot, shoulder, forearm, hand]:
            _expect(bone.get_node("Art") is Sprite2D, "A rendered segment is detached from its bone")
        var foot_art := foot.get_node("Art") as Sprite2D
        var hand_art := hand.get_node("Art") as Sprite2D
        var sole_before := foot_art.global_position
        var hand_before := hand_art.global_position
        thigh.rotation += 0.25
        shoulder.rotation -= 0.25
        rig._update_editor_preview()
        _expect(foot_art.global_position.distance_to(sole_before) > 5.0, "A manual thigh rotation did not move the sole through the chain")
        _expect(hand_art.global_position.distance_to(hand_before) > 5.0, "A manual shoulder rotation did not move the hand through the chain")
    rig.preview_standing_pose = true
    rig._update_editor_preview()
    _measure_pose(rig)
    rig.free()


func _verify_tail() -> void:
    var rig := _make()
    var tail := rig.get_node(PELVIS + "Tail") as Bone2D
    var art := tail.get_node("Art") as Sprite2D
    _expect(tail.get_index_in_skeleton() >= 0 and art.texture == null, "Empty tail is not bound to the real skeleton")
    rig.tail_texture = load("res://Art/Brand/park-opening.png") as Texture2D
    rig.tail_offset = Vector2(-14.0, -6.0)
    rig.refresh_skin()
    rig.reset_at(Vector2(125.0, 320.0), 1)
    rig._process(0.30)
    var idle_angle := tail.rotation
    _expect(art.texture == rig.tail_texture and absf(idle_angle) > 0.015, "Tail did not sway at rest")
    _expect(tail.position == rig.tail_offset and not art.flip_h, "Right-facing tail attachment is misplaced")
    rig.advance_distance(rig.step_length * 0.5)
    rig._process(0.06)
    _expect(absf(tail.rotation - sin(0.72) * 0.07) > 0.015, "Walking adds no tail motion")
    rig.reset_at(Vector2(125.0, 320.0), -1)
    rig._process(0.30)
    _expect(tail.position == Vector2(14.0, -6.0) and art.material.get_shader_parameter("turn_mix") == 1.0, "Left-facing tail attachment is not mirrored")
    _expect(absf(tail.rotation + idle_angle) < 0.0001, "Tail swing did not mirror with facing")
    rig.free()


func _verify_split_stance() -> void:
    var rig := _make()
    rig.shoulder_span = 36.0
    rig.hip_span = 29.0
    rig.shoulder_offset.x = 4.0
    rig.idle_arm_spread_degrees = 12.0
    var near_thigh := rig.get_node(PELVIS + "NearThigh") as Bone2D
    var far_thigh := rig.get_node(PELVIS + "FarThigh") as Bone2D
    var near_shoulder := rig.get_node(PELVIS + "NearShoulder") as Bone2D
    var far_shoulder := rig.get_node(PELVIS + "FarShoulder") as Bone2D
    var authored_hip := near_thigh.rest
    authored_hip.origin.x = 2.0
    near_thigh.rest = authored_hip
    for facing: int in [1, -1]:
        rig.reset_at(Vector2(125.0, 320.0), facing)
        _expect(near_thigh.position.x == 16.5 * facing and far_thigh.position.x == -14.5 * facing, "Hip spacing or authored hip failed to mirror")
        _expect(near_shoulder.position.x == 22.0 * facing and far_shoulder.position.x == -14.0 * facing, "Shoulder spacing failed to mirror")
        _expect(near_shoulder.rotation * facing < -0.2 and far_shoulder.rotation * facing > 0.2, "Idle arm spread does not point outwards")
        _expect((rig.sole_world_position(true).x - rig.sole_world_position(false).x) * facing > 10.0, "Rest stance failed to mirror")
        _measure_pose(rig)
        for frame in 25:
            _move(rig, 1.6 * facing)
        var before := _positions(rig)
        _move(rig, -0.001 * facing)
        var after := _positions(rig)
        for index in before.size():
            _expect(before[index].distance_to(after[index]) < 0.03, "Split stance jumped on reversal")
        for frame in 50:
            _move(rig, -1.6 * facing)
        _expect(near_thigh.position.x * facing < 0.0 and near_shoulder.position.x * facing < 0.0, "Split joints did not finish mirroring in motion")
    rig.free()


func _settle(rig: Rig, delta: float) -> bool:
    var planted: Array[bool] = [rig.is_sole_planted(true), rig.is_sole_planted(false)]
    var soles: Array[Sprite2D] = [rig.get_node(NEAR_SOLE), rig.get_node(FAR_SOLE)]
    var before: Array[Vector2] = [soles[0].global_position, soles[1].global_position]
    var ground := rig.global_position
    var done := rig.settle(delta)
    _expect(rig.global_position == ground, "Settling moved the controller ground position")
    _expect(rig.is_sole_planted(true) or rig.is_sole_planted(false), "Settling lost both supports")
    for leg in [0, 1]:
        if planted[leg] and rig.is_sole_planted(leg == 0):
            var drift := before[leg].distance_to(soles[leg].global_position)
            maximum_drift = maxf(maximum_drift, drift)
            support_samples += 1
            _expect(drift < TOLERANCE, "Settling slid a real planted sole by %s px" % drift)
    _measure_pose(rig)
    return done


func _settle_samples(fps: int, progress: float, split: bool, facing: int) -> Array:
    var rig := _make()
    rig.hip_span = 29.0 if split else 0.0
    rig.reset_at(Vector2(125.0, 320.0), facing)
    var approach := rig.step_length * progress * facing
    while absf(approach) > 0.00001:
        var stride := clampf(approach, -1.0, 1.0)
        _move(rig, stride)
        approach -= stride
    var snapshots: Array = []
    for frame in fps:
        _settle(rig, 1.0 / fps)
        if (frame + 1) % (fps / 30) == 0:
            snapshots.append(_positions(rig))
    _expect(rig.is_sole_planted(true) and rig.is_sole_planted(false), "Stop left an airborne leg")
    var expected := _make()
    expected.hip_span = rig.hip_span
    expected.reset_at(rig.global_position, facing)
    var neutral := _positions(expected)
    var stopped := _positions(rig)
    for part in stopped.size():
        _expect(stopped[part].distance_to(neutral[part]) < TOLERANCE, "Stop did not reach neutral stance")
    expected.free()
    rig.free()
    return snapshots


func _verify_settling() -> void:
    for split: bool in [false, true]:
        for facing: int in [-1, 1]:
            for phase: float in [0.01, 0.1, 0.5, 0.9, 1.0, 1.4, 1.95]:
                var at30 := _settle_samples(30, phase, split, facing)
                var at60 := _settle_samples(60, phase, split, facing)
                for frame in at30.size():
                    for part in at30[frame].size():
                        _expect(at30[frame][part].distance_to(at60[frame][part]) < TOLERANCE, "Settling differs at 30/60 FPS")
    for stop_time: float in [0.05, 0.16, 0.26, 0.38, 0.5]:
        for direction: float in [-1.0, 1.0]:
            var rig := _make()
            _move(rig, rig.step_length * 0.5)
            for frame in roundi(stop_time * 120.0):
                _settle(rig, 1.0 / 120.0)
            var before := _positions(rig)
            _settle(rig, 0.0)
            _expect(before == _positions(rig), "Zero active time changed the stop pose")
            _move(rig, direction * 0.001)
            var after := _positions(rig)
            for part in before.size():
                _expect(before[part].distance_to(after[part]) < 0.03, "New target jumped during settling")
            for frame in 50:
                _move(rig, direction * 1.0)
            for frame in 60:
                _settle(rig, 1.0 / 60.0)
            _expect(rig.is_sole_planted(true) and rig.is_sole_planted(false), "Resumed gait failed to stop again")
            rig.free()


func _make_walker(parent: Control) -> Control:
    var walker := Control.new()
    walker.set_script(Walker)
    walker.size = Vector2(400, 600)
    var rig := RIG_SCENE.instantiate() as Rig
    rig.name = "Richi"
    rig.tail_texture = load("res://Art/Brand/park-opening.png") as Texture2D
    walker.add_child(rig)
    parent.add_child(walker)
    return walker


func _walker_samples(fps: int) -> Array:
    var screen := Control.new()
    root.add_child(screen)
    var walker := _make_walker(screen)
    var rig := walker.get_node("Richi") as Rig
    var snapshots: Array = []
    walker.follow_basket(0.6)
    for frame in fps * 2:
        if frame == fps / 2:
            walker.follow_basket(0.4)
        walker._process(1.0 / fps)
        _measure_pose(rig)
        if (frame + 1) % (fps / 30) == 0:
            snapshots.append(_positions(rig))
    _expect(not walker.is_processing(), "Controller never slept after second target")
    screen.free()
    return snapshots


func _verify_walker_activity() -> void:
    var at30 := _walker_samples(30)
    var at60 := _walker_samples(60)
    for frame in at30.size():
        for part in at30[frame].size():
            _expect(at30[frame][part].distance_to(at60[frame][part]) < TOLERANCE, "Walker arrival or retarget differs at 30/60 FPS")
    var screen := Control.new()
    root.add_child(screen)
    var walker := _make_walker(screen)
    var rig := walker.get_node("Richi") as Rig
    walker.follow_basket(0.85)
    walker._process(0.12)
    walker.follow_basket(inverse_lerp(0.21, 0.79, rig.position.x / walker.size.x))
    walker._process(0.08)
    _move(rig, -0.001)
    paused = true
    var stopped := _positions(rig)
    var tail_angle: float = rig.get_node(PELVIS + "Tail").rotation
    var turn_progress := rig._turn_progress
    for frame in 4:
        await process_frame
    _expect(_positions(rig) == stopped, "Game pause continued the settling animation")
    _expect(rig.get_node(PELVIS + "Tail").rotation == tail_angle, "Game pause continued tail animation")
    _expect(rig._turn_progress == turn_progress, "Game pause continued the face turn")
    paused = false
    for cycle in 5:
        screen.hide()
        _expect(not walker.is_processing() and not rig.can_process(), "Hidden screen kept actor processing")
        stopped = _positions(rig)
        tail_angle = rig.get_node(PELVIS + "Tail").rotation
        turn_progress = rig._turn_progress
        for frame in 3:
            await process_frame
        _expect(_positions(rig) == stopped and rig.get_node(PELVIS + "Tail").rotation == tail_angle, "Hidden screen advanced rig or tail")
        _expect(rig._turn_progress == turn_progress, "Hidden screen advanced the face turn")
        screen.show()
    for frame in 60:
        walker._process(1.0 / 60.0)
    _expect(not walker.is_processing(), "Stationary walker kept its per-frame callback")
    _expect(rig.is_sole_planted(true) and rig.is_sole_planted(false), "Walker did not complete standing after returning")
    walker.follow_basket(0.1)
    _expect(walker.is_processing(), "New basket target did not wake walker")
    screen.free()


func _turn_samples(fps: int) -> Array:
    var rig := _make()
    var texture := load("res://Scenes/Characters/Cutout/RichiCutout.tscn").instantiate() as Rig
    rig.head_texture = texture.head_texture
    rig.tail_texture = texture.tail_texture
    rig.register_head_turn = texture.register_head_turn
    rig.head_eye_left = texture.head_eye_left
    rig.head_eye_right = texture.head_eye_right
    rig.head_nose = texture.head_nose
    rig.head_ears = texture.head_ears
    rig.head_ear_tips = texture.head_ear_tips
    texture.free()
    rig.refresh_skin()
    var head := rig.get_node(PELVIS + "Head") as Sprite2D
    var tail := rig.get_node(PELVIS + "Tail") as Bone2D
    var art := tail.get_node("Art") as Sprite2D
    var snapshots: Array = []
    _move(rig, 4.0)
    var anchor := (rig.get_node(FAR_SOLE) as Sprite2D).global_transform
    _move(rig, -0.001)
    _expect(head.material.get_shader_parameter("turn_mix") == 0.0, "Head mirrored instantly on reversal")
    _expect(tail.position.x == rig.tail_offset.x, "Tail crossed the torso instantly on reversal")
    for frame in fps:
        if frame == fps / 10 or frame == fps * 3 / 10:
            var before_mix: float = head.material.get_shader_parameter("turn_mix")
            var before_tail := tail.position
            _move(rig, 0.001 if frame == fps / 10 else -0.001)
            _expect(head.material.get_shader_parameter("turn_mix") == before_mix, "Retarget reset the current face blend")
            _expect(tail.position == before_tail, "Retarget reset the current tail position")
        rig._process(1.0 / fps)
        var head_mix: float = head.material.get_shader_parameter("turn_mix")
        _expect(absf(head.scale.x) >= 0.85, "Turn squeezed the face too thin")
        _expect(tail.z_index < 0, "Turning tail is not behind the torso")
        var tail_mix: float = art.material.get_shader_parameter("turn_mix")
        _expect(tail_mix == 0.0 or tail_mix == 1.0, "Tail drew two simultaneous silhouettes")
        _expect(is_equal_approx(art.scale.x, absf(1.0 - 2.0 * head_mix)), "Tail did not turn edge-on behind the body")
        _expect((rig.get_node(FAR_SOLE) as Sprite2D).global_transform.is_equal_approx(anchor), "Upper body turn changed the planted foot transform")
        if (frame + 1) % (fps / 30) == 0:
            snapshots.append(Vector3(head_mix, tail.position.x, art.offset.x))
    _expect(head.material.get_shader_parameter("turn_mix") == 1.0, "Turn never reached its new orientation")
    var atlas := rig.head_texture as AtlasTexture
    var rect: Vector4 = head.material.get_shader_parameter("source_rect")
    _expect(is_equal_approx(rect.z, atlas.region.size.x / atlas.atlas.get_width()), "Turn shader mirrored across the complete atlas")
    _expect(head.material.get_shader_parameter("register_face") == true, "Richi did not enable face registration")
    _expect(head.material.get_shader_parameter("eye_left") == rig.head_eye_left, "Face landmark was not sent to GPU")
    rig.free()
    return snapshots


func _verify_turning() -> void:
    var at30 := _turn_samples(30)
    var at60 := _turn_samples(60)
    for frame in at30.size():
        _expect(at30[frame].distance_to(at60[frame]) < 0.0001, "Turn differs at 30/60 FPS")
    var rig := _make()
    _move(rig, -0.001)
    _expect(rig.is_processing(), "Textureless turn did not wake its clock")
    rig._process(1.0)
    _expect(not rig.is_processing(), "Finished turn without a tail kept a frame callback")
    rig.free()


func _render_turn_proof(folder: String) -> void:
    DirAccess.make_dir_recursive_absolute(folder)
    var viewport := SubViewport.new()
    viewport.size = Vector2i(1260, 630)
    viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    root.add_child(viewport)
    var background := ColorRect.new()
    background.z_index = -100
    background.color = Color(0.72, 0.79, 0.70)
    background.size = Vector2(viewport.size)
    viewport.add_child(background)
    var scene := load("res://Scenes/Characters/Cutout/RichiCutout.tscn") as PackedScene
    for frame in 7:
        var rig := scene.instantiate() as Rig
        viewport.add_child(rig)
        rig.reset_at(Vector2(90.0 + frame * 180.0, 340.0))
        rig.set_process(false)
        rig._turn_progress = float(frame) / 6.0
        rig._orient_upper_body()
        rig._pose_tail()
        var head := rig.get_node(PELVIS + "Head") as Sprite2D
        var closeup := head.duplicate() as Sprite2D
        closeup.position = Vector2(90.0 + frame * 180.0, 580.0)
        closeup.scale = Vector2.ONE * 1.1
        viewport.add_child(closeup)
        var label := Label.new()
        label.text = "%.2f" % head.material.get_shader_parameter("turn_mix")
        label.position = Vector2(65.0 + frame * 180.0, 370.0)
        label.add_theme_color_override("font_color", Color(0.1, 0.15, 0.1))
        viewport.add_child(label)
    for frame in 3:
        await process_frame
        await RenderingServer.frame_post_draw
    var captured := viewport.get_texture().get_image()
    var output := folder.path_join("registered-turn.png")
    _expect(captured.save_png(output) == OK, "Could not save GPU turn proof")
    print("GPU turn proof: ", output)
    viewport.free()
    quit(1 if failures else 0)


func _run() -> void:
    var arguments := OS.get_cmdline_user_args()
    if arguments.size() == 2 and arguments[0] == "--turn-proof":
        await _render_turn_proof(arguments[1])
        return
    var at30 := _sample_at(30)
    var at60 := _sample_at(60)
    _expect(at30.size() == at60.size(), "FPS runs did not cover the same time range")
    var maximum_frame_delta := 0.0
    for sample in range(mini(at30.size(), at60.size())):
        for part in at30[sample].size():
            var difference: float = at30[sample][part].distance_to(at60[sample][part])
            maximum_frame_delta = maxf(maximum_frame_delta, difference)
            _expect(difference < TOLERANCE, "30/60 FPS pose mismatch at sample %s" % sample)
    _verify_pause_and_reversal()
    _verify_normal_step()
    _verify_long_frame()
    _verify_leg_proportions()
    _verify_skin_and_parent()
    _verify_real_skeleton()
    _verify_tail()
    _verify_split_stance()
    _verify_settling()
    _verify_turning()
    await _verify_walker_activity()
    if failures == 0:
        print("PASS %s checks, %s planted samples, drift %.6f px, 30/60 pose delta %.6f px" % [comparisons, support_samples, maximum_drift, maximum_frame_delta])
    quit(1 if failures else 0)
