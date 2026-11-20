extends Node3D

signal play_finished(stage: int)

const TOY_LIBRARY := &"Toy"
const CATCH := &"Toy/Catch"
const PICKUP := &"Toy/PickUp"
const CARRY := &"Toy/Carry"
const PICKUP_SECONDS := 0.60

@export var toy_actions: AnimationLibrary
@onready var ball: MeshInstance3D = $Мяч
@onready var marker: Marker3D = $Метка

var motion: Tween
var playing_actor: Node3D
var holding := false
var release_from := Vector3.ZERO
var release_angle := 0.0


func play_toy(actor: Node3D, stage: int) -> void:
    if motion and motion.is_running():
        return
    playing_actor = actor
    if not actor.player.has_animation_library(TOY_LIBRARY):
        actor.player.add_animation_library(TOY_LIBRARY, toy_actions)

    var start := ball.global_position
    var ready_pose := actor.global_transform
    var approach := ready_pose.origin.lerp(start, 0.48)
    var delivery := approach.lerp(start, 0.43)
    approach.y = ready_pose.origin.y
    delivery.y = ready_pose.origin.y
    motion = create_tween().set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
    if stage == 2:
        actor.step_toward_ball()
        motion.tween_property(actor, "global_transform", _face_from(ready_pose, approach, start), 0.74)
        motion.tween_callback(_reach.bind(true))
        motion.tween_interval(0.06)
    else:
        _reach()

    motion.tween_method(_bring_to_paws.bind(start, ball.rotation.x, stage == 2), 0.0, 1.0, PICKUP_SECONDS)
    motion.tween_callback(_hold)
    motion.tween_interval(0.40 if stage == 0 else 0.26)
    if stage == 2:
        motion.tween_callback(_carry)
        motion.tween_property(actor, "global_position", delivery, 0.68)
        motion.tween_interval(0.10)

    motion.tween_callback(_release.bind(stage))
    motion.tween_method(_return_ball.bind(start, stage), 0.0, 1.0, 0.48 if stage == 0 else 0.70)
    if stage == 2:
        motion.tween_callback(actor.step_toward_ball)
        motion.tween_property(actor, "global_transform", _face_from(ready_pose, delivery, ready_pose.origin), 0.24)
        motion.tween_property(actor, "global_position", ready_pose.origin, 0.78)
        motion.tween_property(actor, "global_transform", ready_pose, 0.20)
    motion.tween_callback(_finish.bind(stage))


func _face_from(pose: Transform3D, origin: Vector3, target: Vector3) -> Transform3D:
    var direction := target - origin
    var heading := Basis(Vector3.UP, atan2(direction.x, direction.z)).scaled_local(pose.basis.get_scale())
    return Transform3D(heading, origin)


func _reach(from_floor := false) -> void:
    playing_actor.reach_for_ball()
    playing_actor.player.play(PICKUP if from_floor else CATCH, 0.18)
    playing_actor.gaze.follow_apple(ball)


func _carry() -> void:
    playing_actor.player.play(CARRY, 0.18, 0.90)


func _process(_delta: float) -> void:
    if holding and is_instance_valid(playing_actor):
        ball.global_position = playing_actor.apple_grip()


func _bring_to_paws(progress: float, start: Vector3, angle: float, from_floor: bool) -> void:
    var grip: Vector3 = playing_actor.apple_grip()
    var arrival := smoothstep(0.0, 0.58, progress) if from_floor else progress
    var lift := smoothstep(0.54 if from_floor else 0.27, 1.0, progress)
    var position_on_approach := start.lerp(grip, arrival)
    position_on_approach.y = lerpf(start.y, grip.y, lift)
    ball.global_position = position_on_approach
    ball.rotation.x = angle - progress * PI


func _hold() -> void:
    holding = true
    ball.global_position = playing_actor.apple_grip()


func _release(stage: int) -> void:
    release_from = playing_actor.apple_grip()
    ball.global_position = release_from
    release_angle = ball.rotation.x
    holding = false
    if stage == 2:
        playing_actor.player.play(CATCH, 0.21)
        playing_actor.player.seek(0.92)


func _return_ball(progress: float, target: Vector3, stage: int) -> void:
    var at_floor := Vector3(release_from.x, target.y, release_from.z)
    var drop := minf(progress / 0.42, 1.0)
    var roll := 0.0 if stage == 0 else smoothstep(0.18, 1.0, progress)
    var position_on_return := at_floor.lerp(target, roll)
    position_on_return.y = lerpf(release_from.y, target.y, drop * drop)
    ball.global_position = position_on_return
    var travel := Vector2(position_on_return.x - at_floor.x, position_on_return.z - at_floor.z)
    var radius := ball.mesh.get_aabb().size.x * ball.global_basis.x.length() * 0.5
    ball.rotation.x = release_angle + travel.length() / radius


func _finish(stage: int) -> void:
    _clear_play()
    play_finished.emit(stage)


func _clear_play() -> void:
    if is_instance_valid(playing_actor):
        playing_actor.gaze.release_apple()
    playing_actor = null
    holding = false
    motion = null


func stop_toy() -> void:
    if motion:
        motion.kill()
    _clear_play()
    ball.global_position = marker.global_position
    ball.rotation = Vector3.ZERO
