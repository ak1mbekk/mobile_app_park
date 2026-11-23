extends Node3D

signal washed

const NO_POINTER := -2
const MOUSE := -1
const SCRUB_DISTANCE := 0.51
const POUR_SECONDS := 1.65
const CLEAN_SECONDS := 1.15
const FULL_WATER_Y := 0.244
const POUR_TILT := 0.94

@onready var soap: MeshInstance3D = $Губка
@onready var jug: Node3D = $Кувшин
@onready var jug_water: MeshInstance3D = $Кувшин/Вода
@onready var jug_surface: ShaderMaterial = jug_water.material_override
@onready var jug_spout: Marker3D = $Кувшин/Носик
@onready var jug_handle: Marker3D = $Кувшин/Ручка
@onready var effects = $Эффекты
@onready var animation: AnimationPlayer = $AnimationPlayer
@onready var indicator: Control = $Отклик/ХодКупания
@onready var exit_button: Button = $Отклик/Выход
@onready var lather_bar: ProgressBar = $Отклик/ХодКупания/Намыливание
@onready var rinse_bar: ProgressBar = $Отклик/ХодКупания/Ополаскивание
@onready var guide: Node3D = $Подсказка
@onready var soap_rest := soap.position
@onready var soap_rest_rotation := soap.rotation
@onready var jug_rest := jug.transform

var actor: Node3D
var pointer := NO_POINTER
var previous := Vector2.ZERO
var grab_offset := Vector2.ZERO
var grabbed_at := Vector2.ZERO
var moved_tool := false
var rub_angle := 0.0
var scrub := 0.0
var rinse_progress := 0.0
var foam_amount := 0.0
var effect_time := 0.0
var clean_time := CLEAN_SECONDS
var phase := &"scrub"
var pouring := false

func _ready() -> void:
    preview()

func start(richi: Node3D) -> void:
    actor = richi
    phase = &"scrub"
    scrub = 0.0
    rinse_progress = 0.0
    foam_amount = 0.0
    clean_time = CLEAN_SECONDS
    effect_time = 0.0
    soap.position = soap_rest
    soap.rotation = soap_rest_rotation
    _refill_jug()
    indicator.show()
    exit_button.show()
    exit_button.disabled = false
    _show_phase()
    animation.play("float")
    set_process(true)
    set_process_input(true)
    set_process_unhandled_input(true)

func show_appearance(id: String) -> void:
    var variants := {
        "base-bath": $"Купель/Деревянная купель",
        "bath-carved": $"Купель/Резная дубовая купель",
        "bath": $"Купель/Эмалированная купель",
        "bath-copper": $"Купель/Медная купель",
        "bath-faience": $"Купель/Фаянсовая купель",
    }
    var selected := id if variants.has(id) else "base-bath"
    for variant in variants:
        variants[variant].visible = variant == selected

func preview() -> void:
    cancel_gesture()
    var settling := is_instance_valid(actor) and is_visible_in_tree()
    set_process(settling)
    set_process_input(false)
    set_process_unhandled_input(false)
    animation.stop()
    soap.visible = is_instance_valid(actor)
    if not settling:
        soap.position = soap_rest
        soap.rotation = soap_rest_rotation
        _refill_jug()
    jug.show()
    indicator.hide()
    exit_button.hide()
    guide.hide()
    effects.clear_effects()

func navigation_checkpoint() -> Dictionary:
    return {"phase": str(phase), "scrub": scrub, "rinse": rinse_progress}

func restore_navigation(checkpoint: Dictionary) -> void:
    var restored := StringName(str(checkpoint.get("phase", "scrub")))
    phase = restored if restored in [&"scrub", &"ready", &"done"] else &"scrub"
    scrub = clampf(float(checkpoint.get("scrub", 0.0)), 0.0, SCRUB_DISTANCE)
    rinse_progress = clampf(float(checkpoint.get("rinse", 0.0)), 0.0, 1.0)
    if phase != &"scrub":
        scrub = SCRUB_DISTANCE
    if phase == &"done":
        rinse_progress = 1.0
        clean_time = 0.0
    foam_amount = scrub / SCRUB_DISTANCE * (1.0 - rinse_progress)
    _show_phase()

func chest_point() -> Vector3:
    var skeleton: Skeleton3D = actor.skeleton
    var chest := skeleton.get_bone_global_pose(skeleton.find_bone("mixamorig_Spine2")).origin
    return skeleton.to_global(chest) + actor.global_basis.z.normalized() * 0.15 + Vector3.DOWN * 0.035

func jug_point() -> Vector3:
    return jug_handle.global_position

func pour_target(camera: Camera3D) -> Vector2:
    var width := _screen_width()
    var target := camera.unproject_position(chest_point()) + Vector2(0.35, -0.19) * width
    target.x = minf(target.x, get_viewport().get_visible_rect().size.x - width * 0.10)
    return target

func _refill_jug() -> void:
    jug.transform = jug_rest
    _set_water_surface(0.0)
    jug_water.show()

func _set_water_surface(used: float) -> void:
    # Liquid stays level as the ceramic turns. The lowest point of the rim limits its height.
    var tilt := jug.rotation.x
    var height := minf(lerpf(FULL_WATER_Y, 0.069, used), 0.256 - 0.095 * tan(tilt))
    if not is_equal_approx(jug_water.rotation.x, -tilt) or not is_equal_approx(jug_water.position.y, height):
        jug_water.rotation.x = -tilt
        jug_water.position.y = height
        jug_surface.set_shader_parameter("pitcher_tilt", tilt)
        jug_surface.set_shader_parameter("fill_height", height)

func cancel_gesture() -> void:
    pointer = NO_POINTER
    moved_tool = false
    rub_angle = 0.0
    pouring = false
    if is_instance_valid(effects):
        effects.water.hide()

func _screen_width() -> float:
    var size := get_viewport().get_visible_rect().size
    return maxf(1.0, minf(size.x, size.y))

func _show_phase() -> void:
    soap.show()
    jug.show()
    guide.visible = phase != &"done"
    lather_bar.value = scrub / SCRUB_DISTANCE
    rinse_bar.value = rinse_progress
    lather_bar.accessibility_name = "Намыливание"
    rinse_bar.accessibility_name = "Смывание"

func _process(delta: float) -> void:
    if not is_instance_valid(actor):
        return
    effect_time += delta
    var speed := 1.0 - exp(-12.0 * delta)
    if not indicator.visible:
        soap.position = soap.position.lerp(soap_rest, speed)
        soap.rotation = soap.rotation.lerp(soap_rest_rotation, speed)
        jug.transform = jug.transform.interpolate_with(jug_rest, speed)
        if soap.position.distance_to(soap_rest) < 0.002 and jug.position.distance_to(jug_rest.origin) < 0.002:
            soap.position = soap_rest
            soap.rotation = soap_rest_rotation
            _refill_jug()
            set_process(false)
        return
    var camera := get_viewport().get_camera_3d()
    var chest := chest_point()
    if is_instance_valid(camera):
        _move_tools(camera, chest, speed, delta)
    if phase == &"done":
        if clean_time < CLEAN_SECONDS:
            clean_time += delta
            effects.show_sparkle(chest + Vector3.UP * 0.40, clean_time / CLEAN_SECONDS)
        else:
            effects.sparkle.hide()
    foam_amount = lerpf(foam_amount, scrub / SCRUB_DISTANCE * (1.0 - rinse_progress), speed)
    effects.show_foam(chest, foam_amount, effect_time)
    lather_bar.value = scrub / SCRUB_DISTANCE
    rinse_bar.value = rinse_progress

func _move_tools(camera: Camera3D, chest: Vector3, speed: float, delta: float) -> void:
    var held := pointer != NO_POINTER
    guide.visible = not held and phase != &"done"
    guide.position = (soap_rest if phase == &"scrub" else jug_rest.origin) + Vector3.DOWN * 0.055
    guide.rotation = Vector3.ZERO
    guide.scale = Vector3.ONE * (0.90 + 0.07 * sin(effect_time * 4.0))
    var depth := -camera.to_local(chest).z
    var hand := previous + grab_offset
    var rubbing := held and phase == &"scrub"
    var soap_target := to_local(camera.project_position(hand, maxf(0.1, depth - 0.24))) if rubbing else soap_rest
    soap.position = soap.position.lerp(soap_target, speed)
    soap.rotation.x = lerp_angle(soap.rotation.x, soap_rest_rotation.x - (0.23 if rubbing else 0.0), speed)
    soap.rotation.z = lerp_angle(soap.rotation.z, soap_rest_rotation.z + rub_angle, speed)
    rub_angle = move_toward(rub_angle, 0.0, delta * 1.7)
    if phase == &"scrub":
        return
    var width := _screen_width()
    var hand_depth := maxf(0.1, depth - 0.20)
    var rest_handle := camera.unproject_position(to_global(jug_rest * jug_handle.position))
    var lift := smoothstep(0.035, 0.18, (rest_handle.y - hand.y) / width) if held and moved_tool else 0.0
    var grip := to_local(camera.project_position(hand, hand_depth)) if held else Vector3.ZERO
    var handle_before_turn := to_local(jug_point())
    var chest_screen := camera.unproject_position(chest)
    var side := clampf((hand.x - chest_screen.x) / (width * 0.19), -1.0, 1.0)
    var toward := global_basis.inverse() * (-camera.global_basis.x * side - camera.global_basis.z * 0.40)
    var yaw := atan2(toward.x, toward.z) + 0.34 if held and moved_tool else jug_rest.basis.get_euler().y
    jug.rotation.y = lerp_angle(jug.rotation.y, yaw, speed)
    jug.rotation.x = lerpf(jug.rotation.x, POUR_TILT * lift, speed)
    if held:
        jug.position = handle_before_turn.lerp(grip, speed) - jug.basis * jug_handle.position
    else:
        jug.position = jug.position.lerp(jug_rest.origin, speed)
    _set_water_surface(rinse_progress)
    pouring = held and moved_tool and jug.rotation.x > 0.38
    if pouring:
        var source := jug_spout.global_position
        var heading := (jug.global_basis * Vector3(-0.32, 0.0, 1.0)).slide(Vector3.UP).normalized()
        var fall_height := maxf(0.05, source.y - to_global(Vector3.UP * 0.315).y)
        var landing := source + heading * sqrt(fall_height) * 0.72 + Vector3.DOWN * fall_height
        var source_px := camera.unproject_position(source)
        var end_px := camera.unproject_position(landing)
        # The stream meets the visible front of the seated animal or continues down into the bath.
        var fur_width := camera.unproject_position(chest + camera.global_basis.x * 0.205).distance_to(chest_screen)
        var t := _fur_intersection(source_px, end_px, chest_screen, Vector2(fur_width, fur_width * 0.84))
        if t >= 0.0:
            landing = camera.project_position(source_px.lerp(end_px, t), depth)
            rinse_progress = minf(1.0, rinse_progress + delta / POUR_SECONDS)
        effects.show_stream(source, landing, effect_time)
        if rinse_progress >= 1.0:
            _finish_rinse()
    else:
        effects.water.hide()

func _fur_intersection(start: Vector2, end: Vector2, center: Vector2, radius: Vector2) -> float:
    var origin := (start - center) / radius
    var ray := (end - start) / radius
    var length_sq := ray.length_squared()
    var b := origin.dot(ray)
    var discriminant := b * b - length_sq * (origin.length_squared() - 1.0)
    if discriminant < 0.0 or length_sq <= 0.00001:
        return -1.0
    if origin.length_squared() <= 1.0:
        # Water crosses a short visible stretch of fur when the spout overlaps it on screen.
        var exit_t := (-b + sqrt(discriminant)) / length_sq
        return clampf(exit_t * 0.5, 0.0, 0.28)
    var entry := (-b - sqrt(discriminant)) / length_sq
    return entry if entry >= 0.0 and entry <= 1.0 else -1.0

func _finish_rinse() -> void:
    cancel_gesture()
    phase = &"done"
    clean_time = 0.0
    _show_phase()
    set_process_input(false)
    set_process_unhandled_input(false)
    washed.emit()

func _unhandled_input(event: InputEvent) -> void:
    if event is InputEventScreenTouch and event.pressed and not event.canceled:
        _grab(event.position, event.index)
    elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
        _grab(event.position, MOUSE)

func _input(event: InputEvent) -> void:
    if event is InputEventScreenTouch and pointer == event.index and (not event.pressed or event.canceled):
        _release()
    elif event is InputEventScreenDrag and pointer == event.index:
        _drag(event.position)
    elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and pointer == MOUSE and not event.pressed:
        _release()
    elif event is InputEventMouseMotion and pointer == MOUSE:
        _drag(event.position)

func _grab(point: Vector2, id: int) -> void:
    var camera := get_viewport().get_camera_3d()
    if pointer != NO_POINTER or phase == &"done" or not camera:
        return
    var tool := soap.global_position if phase == &"scrub" else jug_point()
    var radius := maxf(28.0, _screen_width() * 0.079)
    var on_tool := camera.unproject_position(tool).distance_to(point) <= radius
    if phase == &"ready" and not on_tool:
        on_tool = camera.unproject_position(jug.to_global(Vector3.UP * 0.13)).distance_to(point) <= radius
    if on_tool:
        pointer = id
        previous = point
        grabbed_at = point
        moved_tool = false
        grab_offset = camera.unproject_position(tool) - point
        get_viewport().set_input_as_handled()

func _drag(point: Vector2) -> void:
    var camera := get_viewport().get_camera_3d()
    if phase == &"scrub" and camera:
        var center := camera.unproject_position(chest_point())
        var width := _screen_width()
        if center.distance_to(point) <= width * 0.18 and center.distance_to(previous) <= width * 0.18:
            rub_angle = clampf((point.x - previous.x) / width * 3.0, -0.27, 0.27)
            scrub = minf(SCRUB_DISTANCE, scrub + minf(previous.distance_to(point) / width, 0.09))
            if scrub >= SCRUB_DISTANCE:
                cancel_gesture()
                phase = &"ready"
                _show_phase()
    if pointer != NO_POINTER and point.distance_to(grabbed_at) > _screen_width() * 0.035:
        moved_tool = true
    previous = point
    get_viewport().set_input_as_handled()

func _release() -> void:
    cancel_gesture()
    get_viewport().set_input_as_handled()

func _notification(what: int) -> void:
    if is_node_ready() and what in [NOTIFICATION_PAUSED, NOTIFICATION_APPLICATION_FOCUS_OUT]:
        cancel_gesture()
