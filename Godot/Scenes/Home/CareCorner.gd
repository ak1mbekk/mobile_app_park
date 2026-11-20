extends Node3D

signal play_finished(stage: int)

@onready var ball: MeshInstance3D = $Мяч
@onready var marker: Marker3D = $Метка

var motion: Tween
var holder: Node3D

func play_toy(actor: Node3D, stage: int) -> void:
    var start := ball.global_position
    var resting_pose := actor.global_transform
    var actor_start := resting_pose.origin
    var approach := actor_start.lerp(start, 0.38)
    approach.y = actor_start.y
    motion = create_tween().set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
    if stage == 2:
        actor.step_toward_ball()
        motion.tween_property(actor, "global_position", approach, 0.64)
        motion.tween_callback(actor.reach_for_ball)
        motion.tween_interval(0.20)
    else:
        actor.reach_for_ball()
    motion.tween_callback(actor.gaze.follow_apple.bind(ball))
    motion.tween_method(_bring_to_paws.bind(start, actor), 0.0, 1.0, 0.58)
    motion.tween_callback(_hold.bind(actor))
    motion.tween_interval(0.48 if stage == 0 else 0.29)
    if stage == 2:
        motion.tween_callback(actor.step_toward_ball)
        var deliver := approach.lerp(start, 0.18)
        deliver.y = actor_start.y
        motion.tween_property(actor, "global_position", deliver, 0.47)
        motion.tween_callback(actor.reach_for_ball)
        motion.tween_interval(0.18)
    motion.tween_callback(_release)
    motion.tween_method(_return_ball.bind(actor, start, stage), 0.0, 1.0, 0.44 if stage == 0 else 0.68)
    if stage == 2:
        var returning := approach.lerp(start, 0.18)
        returning.y = actor_start.y
        var direction := actor_start - returning
        var heading := Basis(Vector3.UP, atan2(direction.x, direction.z)).scaled_local(resting_pose.basis.get_scale())
        motion.tween_callback(actor.step_toward_ball)
        motion.tween_property(actor, "global_transform", Transform3D(heading, returning), 0.18)
        motion.tween_property(actor, "global_position", actor_start, 0.66)
        motion.tween_property(actor, "global_transform", resting_pose, 0.18)
    motion.tween_callback(play_finished.emit.bind(stage))

func _process(_delta: float) -> void:
    if is_instance_valid(holder):
        ball.global_position = holder.apple_grip()

func _bring_to_paws(progress: float, start: Vector3, actor: Node3D) -> void:
    ball.global_position = start.lerp(actor.apple_grip(), progress)
    ball.rotation.x = -progress * TAU

func _hold(actor: Node3D) -> void:
    holder = actor

func _release() -> void:
    if is_instance_valid(holder):
        holder.gaze.release_apple()
    holder = null

func _return_ball(progress: float, actor: Node3D, target: Vector3, stage: int) -> void:
    var grip: Vector3 = actor.apple_grip()
    var at_floor := Vector3(grip.x, target.y, grip.z)
    var dropping := clampf(progress * 2.5, 0.0, 1.0)
    ball.global_position = grip.lerp(at_floor, dropping * dropping)
    if progress >= 0.4:
        if stage != 0:
            ball.global_position = at_floor.lerp(target, inverse_lerp(0.4, 1.0, progress))
        ball.rotation.x = progress * TAU

func stop_toy() -> void:
    if motion:
        motion.kill()
    _release()
    ball.global_position = marker.global_position
    ball.rotation = Vector3.ZERO
