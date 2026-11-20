@tool
extends Node3D

signal meal_finished

const WAIT := &"Offer_Apple"
const EAT := &"Eat_Apple"
const SLEEP := &"Sleep_Normally"
const FURNITURE_SLEEP := &"Sleep/Curled"
const SLEEP_LIBRARY := preload("res://Art/Characters/Sleep/CurledSleep.tres")
const WASH := &"Wash_Face"
const REST := &"Idle"
const RUB_EYES := &"Rub_Eyes"
const WALK := &"Casual_Walk"
const PURCHASE_JUMP := &"Regular_Jump"
const PURCHASE_CLAP := &"Stand_Clap_and_Sit_Down"
@export_node_path("AnimationPlayer") var animation_player_path := NodePath("Модель/AnimationPlayer")
@onready var player: AnimationPlayer = get_node(animation_player_path)
@onready var skeleton: Skeleton3D = $"Модель/SmartRigArmature/Skeleton3D"
@onready var left_palm := skeleton.find_bone("mixamorig_LeftHandMiddle1")
@onready var right_palm := skeleton.find_bone("mixamorig_RightHandMiddle1")
@onready var gaze = skeleton.get_node("Взгляд")
@onready var paw_pose = skeleton.get_node("PawPose")
@onready var body: MeshInstance3D = gaze.actor_mesh
@onready var baby_mesh := body.mesh
@onready var hat_seat: Node3D = skeleton.get_node("Headwear/Seat")
@onready var baby_hat_scale := hat_seat.scale
var eating_finished := false
var resting_at_home := false
var needs: Dictionary = {}
var mood: StringName
var age_stage := 0
var sleeping_on_furniture := false
var celebrating_purchase := false
var eyelid_tween: Tween

func _ready() -> void:
    paw_pose.player = player
    player.play(REST if player.has_animation(REST) else WAIT)
    player.advance(0)
    if Engine.is_editor_hint():
        player.pause()
    else:
        player.animation_finished.connect(_on_finished)

func wear_hat(style: String) -> void:
    for hat: Node3D in hat_seat.get_children():
        hat.visible = String(hat.name) == style

func set_age_level(level: int, growth_mesh: ArrayMesh) -> void:
    var next_stage := 2 if level >= 10 else 1 if level >= 4 else 0
    if next_stage == age_stage:
        return
    age_stage = next_stage
    body.mesh = baby_mesh if age_stage == 0 else growth_mesh
    body.set_surface_override_material(0, gaze.surface)
    if age_stage != 0:
        body.set_blend_shape_value(0, 1.0 if age_stage == 1 else 0.0)
        body.set_blend_shape_value(1, 1.0 if age_stage == 2 else 0.0)
    var adjustment := 1.0 - 0.035 * age_stage
    hat_seat.scale = baby_hat_scale * Vector3(adjustment, 1.0, adjustment)

func apple_grip() -> Vector3:
    var left := skeleton.get_bone_global_pose(left_palm).origin
    var right := skeleton.get_bone_global_pose(right_palm).origin
    return skeleton.to_global(right.lerp(left, 0.5) + Vector3(0, 0, 0.028))

func accept_apple() -> void:
    if not eating_finished and player.current_animation != EAT:
        player.play(EAT, 0.12)

func offer_apple() -> void:
    _clear_expression()
    eating_finished = false
    gaze.suspended = false
    player.play(WAIT, 0.18)

func sleep() -> void:
    _clear_expression()
    gaze.surface.set_shader_parameter("eyelids", 1.0)
    player.play(SLEEP, 0.24)

func sleep_on_bed(animate := true) -> void:
    resting_at_home = false
    sleeping_on_furniture = true
    gaze.mood_angles = Vector2.ZERO
    gaze.reset_attention()
    gaze.suspended = true
    if not player.has_animation_library(&"Sleep"):
        player.add_animation_library(&"Sleep", SLEEP_LIBRARY)
    player.play(FURNITURE_SLEEP, 0.70 if animate else 0.0)
    _set_eyelids(1.0, 0.55 if animate else 0.0)
    if not animate:
        player.advance(0.0)

func wash_face() -> void:
    _clear_expression()
    player.play(WASH, 0.24)

func reach_for_ball() -> void:
    _clear_expression()
    gaze.suspended = false
    player.play(WAIT, 0.20)

func step_toward_ball() -> void:
    _clear_expression()
    player.play(WALK, 0.20, 0.73)

func idle_in_home() -> void:
    var waking := sleeping_on_furniture
    sleeping_on_furniture = false
    stop_purchase_celebration()
    resting_at_home = true
    gaze.suspended = false
    _apply_mood(true, 0.60 if waking else 0.0)

func set_needs(values: Dictionary) -> void:
    needs = values
    if resting_at_home:
        _apply_mood(false)

func celebrate_purchase() -> void:
    _clear_expression()
    celebrating_purchase = true
    gaze.reset_attention()
    gaze.suspended = true
    player.play(PURCHASE_JUMP, 0.16, 1.35)

func stop_purchase_celebration() -> void:
    if not celebrating_purchase:
        return
    celebrating_purchase = false
    paw_pose.clapping = false
    gaze.suspended = false

func refuse() -> void:
    $Reactions.stop()
    $Reactions.play(&"refuse")
    $SoftMurmur.play()

func _clear_expression() -> void:
    resting_at_home = false
    sleeping_on_furniture = false
    stop_purchase_celebration()
    gaze.mood_angles = Vector2.ZERO
    _set_eyelids(0.0)

func _set_eyelids(value: float, duration := 0.0) -> void:
    if eyelid_tween:
        eyelid_tween.kill()
        eyelid_tween = null
    if duration <= 0.0:
        gaze.surface.set_shader_parameter("eyelids", value)
        return
    var material: ShaderMaterial = gaze.surface
    eyelid_tween = create_tween()
    eyelid_tween.tween_property(material, "shader_parameter/eyelids", value, duration).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)

func _need_is_low(key: String) -> bool:
    var amount: Variant = needs.get(key, 50.0)
    return (amount is int or amount is float) and is_finite(float(amount)) and float(amount) <= 25.0

func _apply_mood(force: bool, wake_duration := 0.0) -> void:
    var next_mood := &"rest"
    if _need_is_low("energy"):
        next_mood = &"sleepy"
    elif _need_is_low("food"):
        next_mood = &"hungry"
    elif _need_is_low("clean"):
        next_mood = &"dirty"
    elif _need_is_low("joy"):
        next_mood = &"lonely"
    if next_mood == mood and not force:
        return
    mood = next_mood
    var clip := REST
    var angles := Vector2(1.2, -3.5)
    var eyelids := 0.0
    match mood:
        &"sleepy":
            clip = RUB_EYES
            angles = Vector2(2.0, 7.5)
            eyelids = 0.48
        &"hungry":
            angles = Vector2(-2.0, -11.0)
        &"dirty":
            clip = WASH
            angles = Vector2(4.0, -3.0)
        &"lonely":
            angles = Vector2(-12.0, 6.0)
            eyelids = 0.22
    gaze.mood_angles = angles
    _set_eyelids(eyelids, wake_duration)
    player.play(clip, wake_duration if wake_duration > 0.0 else 0.22)

func meal_phase() -> float:
    if eating_finished:
        return 1.0
    if player.current_animation != EAT:
        return 0.0
    return player.current_animation_position / player.current_animation_length

func rest_after_meal() -> void:
    eating_finished = true
    player.play(EAT)
    player.seek(player.get_animation(EAT).length, true)
    player.pause()
    gaze.suspended = false

func _on_finished(clip: StringName) -> void:
    if clip == EAT:
        eating_finished = true
        meal_finished.emit()
    elif celebrating_purchase and clip == PURCHASE_JUMP:
        paw_pose.clapping = true
        player.play_section(PURCHASE_CLAP, 0.24, 1.86, 0.13, 1.3)
    elif celebrating_purchase and clip == PURCHASE_CLAP:
        idle_in_home()
    elif resting_at_home and clip in [WASH, RUB_EYES]:
        player.play(REST, 0.22)
