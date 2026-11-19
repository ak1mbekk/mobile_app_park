@tool
extends Node3D

signal meal_finished

const WAIT := &"Offer_Apple"
const EAT := &"Eat_Apple"
@onready var player: AnimationPlayer = $"Модель/AnimationPlayer"
@onready var skeleton: Skeleton3D = $"Модель/SmartRigArmature/Skeleton3D"
@onready var left_palm := skeleton.find_bone("mixamorig_LeftHandMiddle1")
@onready var right_palm := skeleton.find_bone("mixamorig_RightHandMiddle1")
@onready var gaze = skeleton.get_node("Взгляд")
var eating_finished := false

func _ready() -> void:
    player.play(WAIT)
    player.advance(0)
    if Engine.is_editor_hint():
        player.pause()
    else:
        player.animation_finished.connect(_on_finished)

func apple_grip() -> Vector3:
    var left := skeleton.get_bone_global_pose(left_palm).origin
    var right := skeleton.get_bone_global_pose(right_palm).origin
    return skeleton.to_global(right.lerp(left, 0.5) + Vector3(0, 0, 0.028))

func accept_apple() -> void:
    if not eating_finished and player.current_animation != EAT:
        player.play(EAT, 0.12)

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

func _on_finished(clip: StringName) -> void:
    if clip == EAT:
        eating_finished = true
        meal_finished.emit()
