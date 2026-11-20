extends SkeletonModifier3D

@export var enabled := true:
    set(value):
        enabled = value
        if is_node_ready() and not value:
            reset_attention()
@export_range(0, 22, 0.5) var horizontal_degrees := 16.0
@export_range(0, 15, 0.5) var vertical_degrees := 9.0
@export_range(0.03, 0.25, 0.01) var response_seconds := 0.10
@export_range(0.15, 0.7, 0.01) var return_seconds := 0.40
@export_range(0, 14, 0.5) var head_yaw_degrees := 13.0
@export_range(0, 8, 0.5) var head_pitch_degrees := 4.0
@export_range(0.05, 0.40, 0.01) var head_delay_seconds := 0.16
@export var skeleton: Skeleton3D
@export var actor_mesh: MeshInstance3D

@export var surface: ShaderMaterial
const NO_TOUCH := -1
const TAP_LOOK_SECONDS := 0.48
var finger := NO_TOUCH
var pointing := false
var tap_look_left := 0.0
var screen_point := Vector2.ZERO
var fruit: MeshInstance3D
var suspended := false
var angles := Vector2.ZERO
var head_angles := Vector2.ZERO
var head_wait := 0.0
var last_direction := Vector2.ZERO
var head: int
var rest_eye: Vector3
var mood_angles := Vector2.ZERO
var reaction_yaw := 0.0

func _ready() -> void:
    var painted := actor_mesh.get_active_material(0) as StandardMaterial3D
    surface.set_shader_parameter("coat", painted.albedo_texture)
    surface.set_shader_parameter("relief", painted.normal_texture)
    surface.set_shader_parameter("orm", painted.roughness_texture)
    actor_mesh.set_surface_override_material(0, surface)
    head = skeleton.find_bone("mixamorig_Head")
    rest_eye = skeleton.get_bone_global_rest(head).affine_inverse() * Vector3(0, 1.25, 0.40)
    set_process(false)

func _input(event: InputEvent) -> void:
    # Release the tracked contact even when the finger ends over a UI control.
    if event is InputEventScreenTouch and event.index == finger and (event.canceled or not event.pressed):
        finger = NO_TOUCH
        pointing = not event.canceled and not suspended and fruit == null
        tap_look_left = TAP_LOOK_SECONDS if pointing else 0.0
        set_process(true)
    elif event is InputEventScreenDrag and event.index == finger:
        point_at(event.position)

func _unhandled_input(event: InputEvent) -> void:
    if not enabled or suspended or fruit != null:
        return
    if event is InputEventScreenTouch:
        if event.pressed and not event.canceled and finger == NO_TOUCH:
            finger = event.index
            point_at(event.position)
    elif event is InputEventMouseMotion and finger == NO_TOUCH and event.device != InputEvent.DEVICE_ID_EMULATION:
        point_at(event.position)

func point_at(target: Vector2) -> void:
    screen_point = target
    pointing = true
    tap_look_left = 0.0
    set_process(true)

func follow_apple(target: MeshInstance3D) -> void:
    if not enabled or suspended:
        return
    finger = NO_TOUCH
    pointing = false
    tap_look_left = 0.0
    fruit = target
    set_process(true)

func release_apple() -> void:
    fruit = null
    set_process(true)

func finish_tracking() -> void:
    suspended = true
    pointing = false
    tap_look_left = 0.0
    finger = NO_TOUCH
    release_apple()

func reset_attention() -> void:
    finger = NO_TOUCH
    pointing = false
    tap_look_left = 0.0
    fruit = null
    angles = Vector2.ZERO
    head_angles = Vector2.ZERO
    head_wait = 0.0
    last_direction = Vector2.ZERO
    surface.set_shader_parameter("gaze", angles)
    set_process(false)

func _notification(what: int) -> void:
    if is_node_ready() and what in [NOTIFICATION_PAUSED, NOTIFICATION_APPLICATION_FOCUS_OUT]:
        reset_attention()
    elif is_node_ready() and what == NOTIFICATION_WM_MOUSE_EXIT and finger == NO_TOUCH and not fruit:
        pointing = false
        set_process(true)

func _process(delta: float) -> void:
    var camera := get_viewport().get_camera_3d()
    if not camera:
        return
    if tap_look_left > 0.0:
        tap_look_left -= delta
        pointing = tap_look_left > 0.0
    var desired := Vector2.ZERO
    var head_target := Vector2.ZERO
    var following := enabled and not suspended and (pointing or is_instance_valid(fruit))
    if following:
        var target := screen_point
        if is_instance_valid(fruit):
            target = camera.unproject_position(fruit.to_global(fruit.mesh.get_aabb().get_center()))
        var eye := skeleton.to_global(skeleton.get_bone_global_pose(head) * rest_eye)
        var span := get_viewport().get_visible_rect().size
        var offset := (target - camera.unproject_position(eye)) / (span * Vector2(0.38, 0.32))
        var direction := offset.limit_length(1.0)
        desired = direction * Vector2(horizontal_degrees, vertical_degrees)
        if direction.length() > 0.17:
            if direction.normalized().dot(last_direction) < 0.65:
                head_wait = 0.0
            last_direction = direction.normalized()
            head_wait += delta
            if head_wait >= head_delay_seconds:
                head_target = direction * smoothstep(0.17, 0.54, direction.length()) * Vector2(head_yaw_degrees, head_pitch_degrees)
        else:
            head_wait = 0.0
    else:
        head_wait = 0.0
    var duration := response_seconds if following else return_seconds
    head_angles = head_angles.lerp(head_target, 1.0 - exp(-3.0 * delta / return_seconds))
    angles = angles.lerp(desired, 1.0 - exp(-3.0 * delta / duration))
    if angles.distance_to(desired) < 0.035:
        angles = desired
        if head_angles.distance_to(head_target) < 0.025 and not following:
            head_angles = head_target
            set_process(false)
    surface.set_shader_parameter("gaze", angles)

func _process_modification_with_delta(_delta: float) -> void:
    var turn_angles := head_angles + mood_angles + Vector2(reaction_yaw, 0.0)
    if not enabled or turn_angles.is_zero_approx() or not is_instance_valid(skeleton):
        return
    var camera := get_viewport().get_camera_3d()
    if not camera:
        return
    var camera_axes := skeleton.global_basis.orthonormalized().inverse() * camera.global_basis.orthonormalized()
    var turn := Basis(camera_axes.y.normalized(), deg_to_rad(turn_angles.x)) * Basis(camera_axes.x.normalized(), deg_to_rad(turn_angles.y))
    var pose := skeleton.get_bone_global_pose(head)
    pose.basis = turn * pose.basis
    skeleton.set_bone_global_pose(head, pose)
