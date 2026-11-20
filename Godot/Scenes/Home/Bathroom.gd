extends Node3D

signal washed

const NO_POINTER := -2
const MOUSE := -1
const SCRUB_DISTANCE := 0.51
const POUR_SECONDS := 1.65
const CLEAN_SECONDS := 1.15
const FULL_WATER_Y := 0.244

@onready var soap: MeshInstance3D = $Губка
@onready var jug: Node3D = $Кувшин
@onready var jug_water: MeshInstance3D = $Кувшин/Вода
@onready var jug_spout: Marker3D = $Кувшин/Носик
@onready var effects = $Эффекты
@onready var animation: AnimationPlayer = $AnimationPlayer
@onready var indicator: Control = $Отклик/ХодКупания
@onready var exit_button: Button = $Отклик/Выход
@onready var lather_bar: ProgressBar = $Отклик/ХодКупания/Намыливание
@onready var rinse_bar: ProgressBar = $Отклик/ХодКупания/Ополаскивание
@onready var guide: Node3D = $Подсказка
@onready var soap_rest := soap.position
@onready var jug_rest := jug.transform

var actor: Node3D
var pointer := NO_POINTER
var previous := Vector2.ZERO
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
    _refill_jug()
    indicator.show()
    exit_button.show()
    exit_button.disabled = false
    _show_phase()
    animation.play("float")
    set_process(true)
    set_process_input(true)
    set_process_unhandled_input(true)

func show_appearance(enamel: bool) -> void:
    $"Купель/Деревянная купель".visible = not enamel
    $"Купель/Эмалированная купель".visible = enamel

func preview() -> void:
    cancel_gesture()
    set_process(false)
    set_process_input(false)
    set_process_unhandled_input(false)
    animation.stop()
    soap.hide()
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
    return jug.to_global(Vector3(0.0, 0.13, 0.0))

func pour_target(camera: Camera3D) -> Vector2:
    return camera.unproject_position(chest_point()) + Vector2(0.245, -0.24) * _screen_width()

func _refill_jug() -> void:
    jug.transform = jug_rest
    jug_water.position.y = FULL_WATER_Y
    jug_water.scale = Vector3.ONE
    jug_water.show()

func cancel_gesture() -> void:
    pointer = NO_POINTER
    pouring = false
    if is_instance_valid(effects):
        effects.water.hide()

func _screen_width() -> float:
    var size := get_viewport().get_visible_rect().size
    return maxf(1.0, minf(size.x, size.y))

func _show_phase() -> void:
    soap.visible = phase == &"scrub"
    jug.visible = phase != &"done"
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
    var camera := get_viewport().get_camera_3d()
    var chest := chest_point()
    if phase == &"done":
        if clean_time < CLEAN_SECONDS:
            clean_time += delta
            effects.show_sparkle(chest + Vector3.UP * 0.40, clean_time / CLEAN_SECONDS)
        else:
            effects.sparkle.hide()
    elif is_instance_valid(camera):
        _move_tools(camera, chest, speed, delta)
    foam_amount = lerpf(foam_amount, scrub / SCRUB_DISTANCE * (1.0 - rinse_progress), speed)
    effects.show_foam(chest, foam_amount, effect_time)
    lather_bar.value = scrub / SCRUB_DISTANCE
    rinse_bar.value = rinse_progress

func _move_tools(camera: Camera3D, chest: Vector3, speed: float, delta: float) -> void:
    var held := pointer != NO_POINTER
    guide.visible = not held
    guide.position = (soap_rest if phase == &"scrub" else jug_rest.origin) + Vector3.DOWN * 0.055
    guide.rotation = Vector3.ZERO
    guide.scale = Vector3.ONE * (0.90 + 0.07 * sin(effect_time * 4.0))
    var depth := camera.to_local(chest).z * -1.0
    if phase == &"scrub":
        var target := to_local(camera.project_position(previous, maxf(0.1, depth - 0.28))) if held else soap_rest
        soap.position = soap.position.lerp(target, speed)
        return
    var target := to_local(camera.project_position(previous, maxf(0.1, depth - 0.20))) - Vector3.UP * 0.13 if held else jug_rest.origin
    jug.position = jug.position.lerp(target, speed)
    var aim_point := pour_target(camera)
    var aimed := held and previous.distance_to(aim_point) <= _screen_width() * 0.13
    if held and not aimed:
        guide.show()
        guide.global_position = camera.project_position(aim_point, depth - 0.24)
        guide.rotation.x = PI * 0.5 + camera.rotation.x
        guide.scale *= 0.72
    var impact := chest + camera.global_basis.x * 0.105 + Vector3.DOWN * 0.02
    var toward := to_local(impact) - jug.position
    var yaw := atan2(toward.x, toward.z) + 0.53 if aimed else jug_rest.basis.get_euler().y
    jug.rotation.y = lerp_angle(jug.rotation.y, yaw, speed)
    jug.rotation.x = lerpf(jug.rotation.x, 0.94 if aimed else 0.0, speed)
    jug_water.position.y = lerpf(FULL_WATER_Y, 0.069, rinse_progress)
    var water_radius := lerpf(0.075, 0.093, sin(rinse_progress * PI))
    jug_water.scale = Vector3(water_radius / 0.075, 1.0, water_radius / 0.075)
    pouring = aimed and jug.position.distance_to(target) < 0.15 and jug.rotation.x > 0.38
    if pouring:
        effects.show_stream(jug_spout.global_position, impact, effect_time)
        rinse_progress = minf(1.0, rinse_progress + delta / POUR_SECONDS)
        if rinse_progress >= 1.0:
            _finish_rinse()
    else:
        effects.water.hide()

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
    if camera.unproject_position(tool).distance_to(point) <= maxf(28.0, _screen_width() * 0.079):
        pointer = id
        previous = point
        get_viewport().set_input_as_handled()

func _drag(point: Vector2) -> void:
    var camera := get_viewport().get_camera_3d()
    if phase == &"scrub" and camera:
        var center := camera.unproject_position(chest_point())
        var width := _screen_width()
        if center.distance_to(point) <= width * 0.18 and center.distance_to(previous) <= width * 0.18:
            scrub = minf(SCRUB_DISTANCE, scrub + minf(previous.distance_to(point) / width, 0.09))
            if scrub >= SCRUB_DISTANCE:
                cancel_gesture()
                phase = &"ready"
                _show_phase()
    previous = point
    get_viewport().set_input_as_handled()

func _release() -> void:
    cancel_gesture()
    get_viewport().set_input_as_handled()

func _notification(what: int) -> void:
    if is_node_ready() and what in [NOTIFICATION_PAUSED, NOTIFICATION_APPLICATION_FOCUS_OUT]:
        cancel_gesture()
