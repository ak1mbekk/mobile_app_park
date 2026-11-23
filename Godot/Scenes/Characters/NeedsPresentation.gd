extends Node3D

const FULL := &"full"
const WAKE := &"wake"
const RUMBLE_INTERVAL := 13.0
const FLIES := 3

var actor: Node3D
var skin: ShaderMaterial
var pose: SkeletonModifier3D
var audible := false
var rumble := AudioStreamPlayer.new()
var sigh := AudioStreamPlayer.new()
var sleep_sigh := AudioStreamPlayer.new()
var air := Node3D.new()
var odor := ImmediateMesh.new()
var odor_material := StandardMaterial3D.new()
var flies: Array[Node3D] = []
var reaction := &""
var reaction_time := 0.0
var rumble_wait := 0.45
var rumble_started_at := -10.0
var clock := 0.0
var fullness := 0.0
var expression := 0.0
var eyelid_weight := 0.0
var tear_weight := 0.0
var mouth_weight := 0.0

func attach(pet: Node3D, gesture_modifier: SkeletonModifier3D) -> void:
    actor = pet
    skin = actor.gaze.surface
    pose = gesture_modifier
    pose.presenter = self
    audible = DisplayServer.get_name() != "headless"
    rumble.volume_db = -11.0
    sigh.volume_db = -19.0
    add_child(rumble)
    add_child(sigh)
    sleep_sigh.volume_db = -23.0
    add_child(sleep_sigh)
    add_child(air)
    _create_air_effects()
    air.hide()

func settle_to_sleep() -> void:
    if not sleep_sigh.stream:
        sleep_sigh.stream = _make_breath(true)
    if audible:
        sleep_sigh.play()

func start_reaction(kind: StringName) -> void:
    if not actor.resting_at_home or actor.celebrating_purchase:
        return
    reaction = kind
    reaction_time = 0.0
    if kind == FULL:
        fullness = maxf(fullness, 0.8)
        if not sigh.stream:
            sigh.stream = _make_breath(true)
        if audible:
            sigh.play()

func cancel_reaction() -> void:
    reaction = &""
    reaction_time = 0.0
    if pose:
        pose.full = 0.0
        pose.stretch = 0.0
        pose.mood = 0.0
    if sigh.playing:
        sigh.stop()

func _process(delta: float) -> void:
    if not actor:
        return
    var clip: StringName = actor.player.current_animation
    var idle: bool = actor.resting_at_home and clip == &"Idle"
    var dining_wait := clip == &"Dining/Offer_Apple"
    var handling_object := is_instance_valid(actor.gaze.fruit)
    var observing: bool = actor.gaze.pointing or handling_object
    var touch_in_progress: bool = actor.gaze.finger >= 0 or handling_object
    var available: bool = actor.is_visible_in_tree() and actor.gaze.enabled and not actor.sleeping_on_furniture
    var showing := available and (idle or dining_wait)
    if not idle or not available:
        cancel_reaction()
    elif not reaction.is_empty():
        reaction_time += delta
        if reaction_time >= (2.5 if reaction == FULL else 2.05):
            cancel_reaction()

    var food: float = actor.need_amount("food")
    var hungry := showing and food < 30.0
    var dirty: bool = showing and actor.need_amount("clean") < 30.0
    var sleepy: bool = showing and actor.need_amount("energy") < 30.0
    var joy: float = actor.need_amount("joy")
    var very_sad := showing and joy < 30.0
    var happy := showing and joy > 80.0
    var sad := showing and (joy < 50.0 or (hungry and not happy))
    var expressive_idle := idle and available and not observing and reaction.is_empty()

    clock += delta
    var belly_motion := _hunger_motion(hungry, observing, delta)
    air.visible = dirty
    if dirty:
        _animate_air()
    var gesture_weight := 0.0
    var yawn := 0.0
    if reaction == FULL:
        gesture_weight = _envelope(reaction_time, 0.10, 0.50, 1.58, 2.1)
    elif reaction == WAKE:
        gesture_weight = _envelope(reaction_time, 0.2, 0.80, 1.29, 1.95)
        yawn = _envelope(reaction_time, 0.10, 0.55, 1.03, 1.64)
    var weight := 0.0 if touch_in_progress else gesture_weight
    pose.full = weight if reaction == FULL else 0.0
    pose.stretch = weight if reaction == WAKE else 0.0
    var mood_target := 0.0
    if expressive_idle and not sleepy:
        mood_target = -0.75 if very_sad else -0.62 if joy < 50.0 else 1.0 if happy else 0.0
    pose.mood = move_toward(pose.mood, mood_target, delta * (8.0 if not expressive_idle else 3.6))
    var rest_bias := Vector2(0.0, -2.0) if idle else Vector2.ZERO
    if not observing:
        if sad:
            rest_bias.y += 3.0
        if sleepy:
            rest_bias.y += 7.0
        rest_bias.y -= 13.0 * yawn + 6.0 * pose.full + 7.6 * pose.mood
    actor.gaze.face_camera = showing and (idle or hungry)
    actor.gaze.mood_angles = rest_bias
    var since_rumble := clock - rumble_started_at
    var search := _envelope(since_rumble, 0.02, 0.20, 0.96, 1.40) if hungry else 0.0
    actor.gaze.resting_angles = Vector2(4.5 * sin(since_rumble * 4.8), -0.6) * search

    expression = move_toward(expression, -0.75 if very_sad else -0.65 if sad else 1.0 if happy else 0.0, delta * 3.8)
    eyelid_weight = move_toward(eyelid_weight, maxf(0.40 if sleepy and not observing else 0.0, 0.65 * yawn), delta * 3.3)
    tear_weight = 0.0
    var mouth_target := 0.33 + 0.25 * absf(belly_motion) if hungry else 0.28 if happy and expressive_idle else 0.0
    mouth_weight = move_toward(mouth_weight, maxf(yawn, mouth_target), delta * 4.0)
    fullness = move_toward(fullness, smoothstep(88.0, 100.0, food), delta * 1.5)
    skin.set_shader_parameter("expression", expression)
    skin.set_shader_parameter("expression_lid", eyelid_weight)
    skin.set_shader_parameter("wet_eyes", tear_weight)
    skin.set_shader_parameter("mouth_open", mouth_weight)
    skin.set_shader_parameter("belly_motion", 0.0 if not showing else 0.079 * fullness + belly_motion * 0.032)

func _hunger_motion(hungry: bool, tracking: bool, delta: float) -> float:
    if not hungry:
        rumble_wait = 0.45
        rumble_started_at = -10.0
        if rumble.playing:
            rumble.stop()
        return 0.0
    rumble_wait -= delta
    if rumble_wait <= 0.0 and not tracking:
        if not rumble.stream:
            rumble.stream = _make_breath(false)
        if audible:
            rumble.play()
        rumble_started_at = clock
        rumble_wait = RUMBLE_INTERVAL
    var beat := clock - rumble_started_at
    if beat >= 1.0:
        return 0.24 * sin(clock * 3.7)
    return sin(beat * 24.0) * sin(clampf(beat, 0.0, 1.0) * PI)

func _make_breath(exhale: bool) -> AudioStreamWAV:
    const RATE := 22050
    var pcm := PackedByteArray()
    pcm.resize(RATE * 2)
    var rng := RandomNumberGenerator.new()
    rng.seed = 50796
    var smoothed := 0.0
    for i in RATE:
        var t := float(i) / RATE
        smoothed = lerpf(smoothed, rng.randf_range(-1.0, 1.0), 0.049 if exhale else 0.12)
        var pulsation := 0.64 + 0.36 * sin(t * TAU * 5.5 + 0.4)
        var phase := TAU * (77.0 * t - 31.0 * t * t + 1.4 * sin(t * 18.0))
        var pulse := 0.54 * sin(phase) + 0.19 * sin(phase * 1.98 + 0.8)
        var envelope := pow(sin(PI * t), 1.7)
        var value := (smoothed * 2.1 if exhale else pulsation * pulse + 0.51 * smoothed) * envelope
        pcm.encode_s16(i * 2, roundi(clampf(value,-1.0,1.0) * 21000.0))
    var sound := AudioStreamWAV.new()
    sound.mix_rate = RATE
    sound.format = AudioStreamWAV.FORMAT_16_BITS
    sound.data = pcm
    return sound

func _create_air_effects() -> void:
    var trails := MeshInstance3D.new()
    trails.mesh = odor
    trails.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    air.add_child(trails)
    odor_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
    odor_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
    odor_material.cull_mode = BaseMaterial3D.CULL_DISABLED
    odor_material.vertex_color_use_as_albedo = true
    var black := StandardMaterial3D.new()
    black.albedo_color = Color(0.17, 0.12, 0.085)
    var wing := StandardMaterial3D.new()
    wing.albedo_color = Color(0.91, 0.78, 0.56, 0.71)
    wing.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
    var grain := SphereMesh.new()
    grain.radius = 0.012
    grain.height = 0.024
    grain.radial_segments = 6
    grain.rings = 3
    for i in FLIES:
        var fly := Node3D.new()
        air.add_child(fly)
        flies.append(fly)
        _add_fly_part(fly,grain,black,Vector3(0.70,0.67,1.16),Vector3.ZERO)
        _add_fly_part(fly,grain,wing,Vector3(0.84,0.19,0.49),Vector3(0.010,0.008,0))
        _add_fly_part(fly,grain,wing,Vector3(0.84,0.19,0.49),Vector3(-0.010,0.008,0))

func _add_fly_part(fly: Node3D, mesh: Mesh, material: Material, proportions: Vector3, offset: Vector3) -> void:
    var part := MeshInstance3D.new()
    part.mesh = mesh
    part.material_override = material
    part.scale = proportions
    part.position = offset
    part.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    fly.add_child(part)

func _animate_air() -> void:
    for i in flies.size():
        var fly := flies[i]
        var phase := clock * (2.4 + float(i) * 0.21) + i * TAU / FLIES
        fly.position = Vector3(cos(phase) * (0.24 + i * 0.018), 0.49 + 0.16 * sin(phase * 1.8) + 0.045 * i, 0.08 + sin(phase) * 0.15)
        fly.rotation.y = -phase
        fly.get_child(1).rotation.z = 0.8 * sin(clock * 137.0)
        fly.get_child(2).rotation.z = -fly.get_child(1).rotation.z
    odor.clear_surfaces()
    for i in 2:
        odor.surface_begin(Mesh.PRIMITIVE_TRIANGLE_STRIP, odor_material)
        var phase := fposmod(clock * 0.64 + i * 0.51, 1.0)
        for point in 13:
            var s := float(point) / 12.0
            var width := 0.013 * sin(PI * s)
            var curve := Vector3(-0.20 + i * 0.42 + sin(s * TAU + clock * 2.5) * 0.035, 0.30 + 0.19 * phase + s * 0.19, 0.18)
            var color := Color(0.38, 0.43, 0.20, 0.57 * sin(PI * s) * sin(PI * phase))
            odor.surface_set_color(color)
            odor.surface_add_vertex(curve - Vector3(width,0,0))
            odor.surface_set_color(color)
            odor.surface_add_vertex(curve + Vector3(width,0,0))
        odor.surface_end()

func _envelope(t: float, fade_in: float, peak: float, hold_until: float, fade_out: float) -> float:
    return smoothstep(fade_in,peak,t) * (1.0-smoothstep(hold_until,fade_out,t))
