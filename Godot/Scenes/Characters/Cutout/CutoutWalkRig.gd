@tool
extends Node2D

const NEAR := 0
const FAR := 1
const EPSILON := 0.00001
const SETTLE_STEP_SECONDS := 0.22
const TURN_SECONDS := 0.22
const TURN_SHADER := """
shader_type canvas_item;
uniform float turn_mix = 0.0;
uniform vec4 source_rect = vec4(0.0, 0.0, 1.0, 1.0);
uniform bool register_face = false;
uniform vec2 eye_left = vec2(0.35, 0.6);
uniform vec2 eye_right = vec2(0.65, 0.6);
uniform vec2 nose = vec2(0.5, 0.75);
uniform vec4 ears = vec4(0.25, 0.2, 0.75, 0.2);
uniform vec2 ear_tips = vec2(0.02, 0.02);
varying vec4 vertex_tint;
void vertex() {
    vertex_tint = COLOR;
}
vec2 landmark(int row, int column) {
    if (row == 0 || row == 5) {
        return vec2(float(column) * 0.25, float(row) * 0.2);
    }
    vec2 left = row <= 2 ? ears.xy : eye_left;
    vec2 right = row <= 2 ? ears.zw : eye_right;
    if (row == 1) {
        left.y = ear_tips.x;
        right.y = ear_tips.y;
    }
    vec2 middle = (left + right) * 0.5;
    if (row == 4) {
        left.y = nose.y;
        right.y = nose.y;
        middle = nose;
    }
    if (column == 0) { return vec2(0.0, left.y); }
    if (column == 1) { return left; }
    if (column == 2) { return middle; }
    if (column == 3) { return right; }
    return vec2(1.0, right.y);
}
vec2 reflected_landmark(int row, int column) {
    vec2 p = landmark(row, 4 - column);
    return vec2(1.0 - p.x, p.y);
}
vec3 barycentric(vec2 p, vec2 a, vec2 b, vec2 c) {
    vec2 v = b - a;
    vec2 w = c - a;
    vec2 q = p - a;
    float determinant = v.x * w.y - w.x * v.y;
    float y = (q.x * w.y - w.x * q.y) / determinant;
    float z = (v.x * q.y - q.x * v.y) / determinant;
    return vec3(1.0 - y - z, y, z);
}
// Inverse-warp each side to the same interpolated landmark mesh before mixing.
// The nose and both pupils occupy a single position even at a half turn.
vec4 registered_uvs(vec2 p) {
    vec4 result = vec4(p, vec2(1.0 - p.x, p.y));
    for (int row = 0; row < 5; row++) {
        for (int column = 0; column < 4; column++) {
            vec2 a = landmark(row, column);
            vec2 b = landmark(row, column + 1);
            vec2 c = landmark(row + 1, column);
            vec2 d = landmark(row + 1, column + 1);
            vec2 al = reflected_landmark(row, column);
            vec2 bl = reflected_landmark(row, column + 1);
            vec2 cl = reflected_landmark(row + 1, column);
            vec2 dl = reflected_landmark(row + 1, column + 1);
            vec2 at = mix(a, al, turn_mix);
            vec2 bt = mix(b, bl, turn_mix);
            vec2 ct = mix(c, cl, turn_mix);
            vec2 dt = mix(d, dl, turn_mix);
            vec3 weights = barycentric(p, at, bt, ct);
            if (min(weights.x, min(weights.y, weights.z)) >= -0.00001) {
                vec2 r = a * weights.x + b * weights.y + c * weights.z;
                vec2 l = al * weights.x + bl * weights.y + cl * weights.z;
                return vec4(r, vec2(1.0 - l.x, l.y));
            }
            weights = barycentric(p, bt, dt, ct);
            if (min(weights.x, min(weights.y, weights.z)) >= -0.00001) {
                vec2 r = b * weights.x + d * weights.y + c * weights.z;
                vec2 l = bl * weights.x + dl * weights.y + cl * weights.z;
                return vec4(r, vec2(1.0 - l.x, l.y));
            }
        }
    }
    return result;
}
void fragment() {
    vec2 p = (UV - source_rect.xy) / source_rect.zw;
    vec4 coords = vec4(p, vec2(1.0 - p.x, p.y));
    // Normal walking and both endpoints retain the inexpensive single sample.
    if (turn_mix <= 0.0) {
        COLOR = vertex_tint * texture(TEXTURE, UV);
    } else if (turn_mix >= 1.0) {
        COLOR = vertex_tint * texture(TEXTURE, source_rect.xy + coords.zw * source_rect.zw);
    } else {
    if (register_face) { coords = registered_uvs(p); }
    vec4 right_art = texture(TEXTURE, source_rect.xy + coords.xy * source_rect.zw);
    vec4 left_art = texture(TEXTURE, source_rect.xy + coords.zw * source_rect.zw);
    // Blend in premultiplied space so transparent cutout edges stay clean.
    float opacity = mix(right_art.a, left_art.a, turn_mix);
    vec3 premultiplied = mix(right_art.rgb * right_art.a, left_art.rgb * left_art.a, turn_mix);
    COLOR = vertex_tint * vec4(premultiplied / max(opacity, 0.00001), opacity);
    }
}
"""

@export_group("Корпус")
@export var torso_texture: Texture2D
@export var torso_pivot := Vector2(0.5, 0.85)
@export var torso_offset := Vector2.ZERO
@export var head_texture: Texture2D
@export var head_pivot := Vector2(0.5, 0.85)
@export var head_offset := Vector2(0.0, -51.0)
## Optional normalised landmarks for asymmetric face art. Disabled for generic skins.
@export var register_head_turn := false
@export var head_eye_left := Vector2(0.35, 0.6)
@export var head_eye_right := Vector2(0.65, 0.6)
@export var head_nose := Vector2(0.5, 0.75)
@export var head_ears := Vector4(0.25, 0.2, 0.75, 0.2)
@export var head_ear_tips := Vector2(0.02, 0.02)
@export var tail_texture: Texture2D
@export var tail_pivot := Vector2(0.8, 0.33)
@export var tail_offset := Vector2(-9.0, -8.0)

@export_group("Ноги")
@export var thigh_texture: Texture2D
@export var thigh_pivot := Vector2(0.5, 0.15)
@export var shin_texture: Texture2D
@export var shin_pivot := Vector2(0.5, 0.17)
@export var foot_texture: Texture2D
@export var foot_sole_pivot := Vector2(0.4, 0.9)
## Область округлой накладки в пикселях текстуры голени. Нулевой размер использует верхнюю квадратную область.
@export var knee_cap_region := Rect2i()
@export_range(4.0, 500.0, 0.5) var thigh_length := 42.0
@export_range(4.0, 500.0, 0.5) var shin_length := 39.0
@export_range(0.0, 100.0, 0.5) var ankle_above_sole := 6.0
## Полное расстояние между бёдрами. Ближнее бедро справа при направлении вправо.
@export_range(0.0, 140.0, 0.5) var hip_span := 0.0
@export var knees_bend_right := true
@export var far_tint := Color(0.67, 0.71, 0.75)

@export_group("Руки")
@export var upper_arm_texture: Texture2D
@export var upper_arm_pivot := Vector2(0.5, 0.18)
@export var forearm_texture: Texture2D
@export var forearm_pivot := Vector2(0.5, 0.18)
@export var hand_texture: Texture2D
@export var hand_pivot := Vector2(0.5, 0.2)
@export var shoulder_offset := Vector2(0.0, -41.0)
## Полное расстояние между плечами. Ближнее плечо справа при направлении вправо.
@export_range(0.0, 220.0, 0.5) var shoulder_span := 0.0
@export_range(0.0, 45.0, 0.5) var idle_arm_spread_degrees := 0.0
@export_range(0.0, 500.0, 0.5) var upper_arm_length := 26.0
@export_range(0.0, 500.0, 0.5) var forearm_length := 23.0
@export_range(0.0, 45.0, 0.5) var elbow_bend_degrees := 10.0

@export_group("Шаг")
## Перемещение таза между касаниями, в локальных пикселях рига.
@export_range(1.0, 500.0, 0.5) var step_length := 35.0
@export_range(0.0, 100.0, 0.5) var swing_height := 13.0
@export_range(0.0, 100.0, 0.5) var stance_width := 18.0
@export_range(0.7, 0.99, 0.01) var standing_extension := 0.93
@export_range(0.0, 60.0, 0.5) var arm_swing_degrees := 21.0

@export_group("Редактор")
## Включает просмотр расчётной стойки. Выключите для ручного позирования костей.
@export var preview_standing_pose := false

@onready var _pelvis: Bone2D = $Skeleton2D/Pelvis
@onready var _torso: Sprite2D = _pelvis.get_node("Torso")
@onready var _head: Sprite2D = _pelvis.get_node("Head")
@onready var _tail: Bone2D = _pelvis.get_node("Tail")
@onready var _tail_art: Sprite2D = _tail.get_node("Art")
@onready var _thighs: Array[Bone2D] = [_pelvis.get_node("NearThigh"), _pelvis.get_node("FarThigh")]
@onready var _shins: Array[Bone2D] = [_thighs[NEAR].get_node("Shin"), _thighs[FAR].get_node("Shin")]
@onready var _feet: Array[Bone2D] = [_shins[NEAR].get_node("Foot"), _shins[FAR].get_node("Foot")]
@onready var _shoulders: Array[Bone2D] = [_pelvis.get_node("NearShoulder"), _pelvis.get_node("FarShoulder")]
@onready var _forearms: Array[Bone2D] = [_shoulders[NEAR].get_node("Forearm"), _shoulders[FAR].get_node("Forearm")]
@onready var _hands: Array[Bone2D] = [_forearms[NEAR].get_node("Hand"), _forearms[FAR].get_node("Hand")]
@onready var _thigh_art: Array[Sprite2D] = [_thighs[NEAR].get_node("Art"), _thighs[FAR].get_node("Art")]
@onready var _shin_art: Array[Sprite2D] = [_shins[NEAR].get_node("Art"), _shins[FAR].get_node("Art")]
@onready var _shoe_art: Array[Sprite2D] = [_feet[NEAR].get_node("Art"), _feet[FAR].get_node("Art")]
@onready var _caps: Array[Sprite2D] = [_shins[NEAR].get_node("KneeCap"), _shins[FAR].get_node("KneeCap")]
@onready var _shoulder_art: Array[Sprite2D] = [_shoulders[NEAR].get_node("Art"), _shoulders[FAR].get_node("Art")]
@onready var _forearm_art: Array[Sprite2D] = [_forearms[NEAR].get_node("Art"), _forearms[FAR].get_node("Art")]
@onready var _hand_art: Array[Sprite2D] = [_hands[NEAR].get_node("Art"), _hands[FAR].get_node("Art")]

var _ground := Vector2.ZERO
var _soles: Array[Vector2] = [Vector2.ZERO, Vector2.ZERO]
var _foot_facing: Array[int] = [1, 1]
var _foot_pitch: Array[float] = [0.0, 0.0]
var _support := -1
var _facing := 1
var _turn_progress := 0.0
var _turn_materials: Dictionary = {}
var _span_orientation := 1.0
var _knee_orientation := 1.0
var _swing_from := Vector2.ZERO
var _swing_to := Vector2.ZERO
var _pitch_from := 0.0
var _covered := 0.0
var _span := 0.0
var _arm_angle := 0.0
var _arm_from := 0.0
var _arm_to := 0.0
var _settling := false
var _settle_time := 0.0
var _settle_orientation_from := 1.0
var _tail_idle_phase := 0.0
var _tail_walk_phase := 0.0
var _tail_walk_weight := 0.0
var _tail_motion_age := INF
var _knee_cap: ImageTexture
var _cap_source: Texture2D
var _cap_region := Rect2i()


func _ready() -> void:
    var editor := Engine.is_editor_hint()
    var shader := Shader.new()
    shader.code = TURN_SHADER
    for sprite: Sprite2D in [_head, _torso, _tail_art]:
        var material := ShaderMaterial.new()
        material.shader = shader
        sprite.material = material
        _turn_materials[sprite] = material
    set_process(editor or tail_texture != null)
    _sync_skin_and_gizmos()
    if not editor or preview_standing_pose:
        reset_at(global_position)


func _process(delta: float) -> void:
    if Engine.is_editor_hint():
        _update_editor_preview()
        return
    var next_turn := move_toward(_turn_progress, 1.0 if _facing < 0 else 0.0, delta / TURN_SECONDS)
    if next_turn != _turn_progress:
        _turn_progress = next_turn
        _orient_upper_body()
    if tail_texture == null and not _turning():
        set_process(false)
    _tail_motion_age += delta
    _tail_idle_phase = fposmod(_tail_idle_phase + delta * 2.0, TAU)
    var walk_target := 1.0 if _tail_motion_age < 0.1 else 0.0
    _tail_walk_weight = move_toward(_tail_walk_weight, walk_target, delta * 4.0)
    _pose_tail()


func _update_editor_preview() -> void:
    _sync_skin_and_gizmos()
    if preview_standing_pose:
        reset_at(global_position)


## Set the neutral pose at a new ground level or after teleporting.
func reset_at(world_ground: Vector2, facing: int = 1) -> void:
    if not world_ground.is_finite():
        return
    _ground = world_ground
    _facing = -1 if facing < 0 else 1
    _turn_progress = 1.0 if _facing < 0 else 0.0
    _span_orientation = float(_facing)
    _knee_orientation = _span_orientation
    _support = -1
    _covered = 0.0
    _span = 0.0
    _settling = false
    _settle_time = 0.0
    _arm_angle = 0.0
    _tail_idle_phase = 0.0
    _tail_walk_phase = 0.0
    _tail_walk_weight = 0.0
    _tail_motion_age = INF
    var gap := minf(maxf(stance_width, _hip_separation()), _safe_step()) * _world_scale() * 0.5
    var near_x := gap * (_span_orientation if hip_span > EPSILON else -1.0)
    _soles[NEAR] = _ground + Vector2(near_x, 0.0)
    _soles[FAR] = _ground - Vector2(near_x, 0.0)
    _foot_facing[NEAR] = _facing
    _foot_facing[FAR] = _facing
    _foot_pitch[NEAR] = 0.0
    _foot_pitch[FAR] = 0.0
    _render_pose()


## Use the actual horizontal displacement after collisions, in world pixels.
func advance_distance(signed_distance: float) -> void:
    if not is_finite(signed_distance) or absf(signed_distance) <= EPSILON:
        return
    var step_distance := _safe_step() * _world_scale()
    _tail_motion_age = 0.0
    _tail_walk_phase = fposmod(_tail_walk_phase + PI * absf(signed_distance) / step_distance, TAU)
    var direction := -1 if signed_distance < 0.0 else 1
    if _settling:
        _settling = false
        _start_swing(direction)
    if _support < 0:
        var lead := direction * (_soles[NEAR].x - _soles[FAR].x)
        _support = NEAR if lead > 0.0 else FAR
        _start_swing(direction)
    elif direction != _facing:
        _start_swing(direction)

    var destination_x := _ground.x + signed_distance
    var remaining := absf(signed_distance)
    while remaining > EPSILON:
        var segment := minf(remaining, _span - _covered)
        _ground.x += direction * segment
        _covered += segment
        remaining -= segment
        _span_orientation = move_toward(_span_orientation, float(direction), segment * 5.0 / step_distance)
        var swing := 1 - _support
        var progress := _covered / _span
        var ease := smoothstep(0.0, 1.0, progress)
        var lift := sin(PI * progress)
        var max_lift := minf(swing_height, _short_segment() * 0.65) * _world_scale()
        _soles[swing] = _swing_from.lerp(_swing_to, ease)
        _soles[swing].y = maxf(_ground.y - max_lift * 1.5, _soles[swing].y - max_lift * lift * lift)
        _foot_pitch[swing] = lerpf(_pitch_from, 0.0, ease) - sin(TAU * progress) * 0.18 * _facing
        _arm_angle = lerpf(_arm_from, _arm_to, ease)
        if _span - _covered <= EPSILON:
            _soles[swing] = _swing_to
            _foot_facing[swing] = _facing
            _foot_pitch[swing] = 0.0
            _arm_angle = _arm_to
            _support = swing
            _start_swing(direction)
    _ground.x = destination_x
    _render_pose()


## Follow a controller's horizontal position while retaining the last ground level.
func follow_world_x(world_x: float) -> void:
    advance_distance(world_x - _ground.x)


## Finish the airborne step, then gather the old support foot if necessary.
## The controller supplies active time: zero displacement alone remains a pause.
## Returns true once both soles are planted in a comfortable standing pose.
func settle(delta: float) -> bool:
    if _support < 0:
        return true
    if not is_finite(delta) or delta <= 0.0:
        return false
    if not _settling:
        _start_settle_step()
    var remaining := delta
    while _settling and remaining > EPSILON:
        var segment := minf(remaining, SETTLE_STEP_SECONDS - _settle_time)
        _settle_time += segment
        remaining -= segment
        var progress := clampf(_settle_time / SETTLE_STEP_SECONDS, 0.0, 1.0)
        var ease := smoothstep(0.0, 1.0, progress)
        var swing := 1 - _support
        _soles[swing] = _swing_from.lerp(_swing_to, ease)
        var lift := sin(PI * progress)
        _soles[swing].y -= minf(swing_height * 0.55, _short_segment() * 0.35) * _world_scale() * lift * lift
        _foot_pitch[swing] = lerpf(_pitch_from, 0.0, ease)
        _arm_angle = lerpf(_arm_from, 0.0, ease)
        _span_orientation = lerpf(_settle_orientation_from, float(_facing), ease)
        if SETTLE_STEP_SECONDS - _settle_time <= EPSILON:
            _soles[swing] = _swing_to
            _foot_pitch[swing] = 0.0
            _foot_facing[swing] = _facing
            var old_support := _support
            _support = swing
            if _soles[old_support].distance_to(_standing_sole(old_support)) > EPSILON:
                _start_settle_step()
            else:
                _support = -1
                _covered = 0.0
                _span = 0.0
                _arm_angle = 0.0
                _settling = false
    _render_pose()
    return not _settling


func _standing_sole(side: int) -> Vector2:
    var gap := minf(maxf(stance_width, _hip_separation()), _safe_step()) * _world_scale() * 0.5
    var near_x := gap * (float(_facing) if hip_span > EPSILON else -1.0)
    return _ground + Vector2(near_x if side == NEAR else -near_x, 0.0)


func _start_settle_step() -> void:
    _settling = true
    _settle_time = 0.0
    _swing_from = _soles[1 - _support]
    _swing_to = _standing_sole(1 - _support)
    _pitch_from = _foot_pitch[1 - _support]
    _arm_from = _arm_angle
    _settle_orientation_from = _span_orientation


func sole_world_position(near_side: bool) -> Vector2:
    return _soles[NEAR if near_side else FAR]


func is_sole_planted(near_side: bool) -> bool:
    var side := NEAR if near_side else FAR
    return _support < 0 or side == _support or (
        not _settling and _covered <= EPSILON and absf(_soles[side].y - _ground.y) <= EPSILON
    )


## Runtime callers can replace exported textures and apply them in one call.
func refresh_skin() -> void:
    if is_node_ready():
        _cap_source = null
        _sync_skin_and_gizmos()
        set_process(Engine.is_editor_hint() or tail_texture != null or _turning())


func _sync_skin_and_gizmos() -> void:
    _torso.texture = torso_texture
    _head.texture = head_texture
    _tail_art.texture = tail_texture
    _torso.position = torso_offset
    _head.position = head_offset
    _thighs[FAR].modulate = far_tint
    _shoulders[FAR].modulate = far_tint
    _refresh_knee_cap()
    for side in [NEAR, FAR]:
        _thigh_art[side].texture = thigh_texture
        _shin_art[side].texture = shin_texture
        _caps[side].texture = _knee_cap
        _shoe_art[side].texture = foot_texture
        _shoe_art[side].position = Vector2.DOWN * ankle_above_sole
        _shoulder_art[side].texture = upper_arm_texture
        _forearm_art[side].texture = forearm_texture
        _hand_art[side].texture = hand_texture
        _set_gizmo_length(_thighs[side], thigh_length)
        _set_gizmo_length(_shins[side], shin_length)
        _set_gizmo_length(_shoulders[side], upper_arm_length)
        _set_gizmo_length(_forearms[side], forearm_length)
    _orient_skin()


func _set_gizmo_length(bone: Bone2D, length: float) -> void:
    if not bone.get_autocalculate_length_and_angle() and not is_equal_approx(bone.get_length(), length):
        bone.set_length(length)


func _refresh_knee_cap() -> void:
    if shin_texture == null:
        _cap_source = null
        _knee_cap = null
        return
    var bounds := Rect2i(Vector2i.ZERO, Vector2i(shin_texture.get_size()))
    var region := knee_cap_region
    if not region.has_area():
        var side := mini(bounds.size.x, bounds.size.y)
        region = Rect2i(0, 0, side, side)
    region = region.intersection(bounds)
    if _cap_source == shin_texture and _cap_region == region:
        return
    _cap_source = shin_texture
    _cap_region = region
    _knee_cap = null
    if not region.has_area():
        return
    var image := shin_texture.get_image()
    if image == null or image.is_empty():
        return
    if image.is_compressed() and image.decompress() != OK:
        return
    var patch := image.get_region(region)
    patch.convert(Image.FORMAT_RGBA8)
    var center := Vector2(region.size) * 0.5
    var radius := minf(center.x, center.y)
    for y in region.size.y:
        for x in region.size.x:
            var distance := Vector2(x + 0.5, y + 0.5).distance_to(center)
            var coverage := clampf(radius - distance + 0.5, 0.0, 1.0)
            if coverage < 1.0:
                var pixel := patch.get_pixel(x, y)
                pixel.a *= coverage
                patch.set_pixel(x, y, pixel)
    _knee_cap = ImageTexture.create_from_image(patch)


func _world_scale() -> float:
    return maxf(global_transform.x.length(), 0.001)


func _short_segment() -> float:
    return maxf(1.0, minf(thigh_length, shin_length))


func _safe_step() -> float:
    return minf(maxf(1.0, step_length), _short_segment() * 1.15)


func _hip_separation() -> float:
    return minf(maxf(0.0, hip_span), _short_segment() * 1.4)


func _start_swing(direction: int) -> void:
    _facing = direction
    if _turning():
        set_process(true)
    _covered = 0.0
    var step := _safe_step() * _world_scale()
    # Repeated reversals can leave the same foot anchored for several swing plans.
    # Finish the transfer before the hip can move beyond the reachable span.
    var limit := minf((thigh_length + shin_length) * 0.6, _short_segment() * 1.75)
    limit = (limit - _hip_separation() * 0.5) * _world_scale()
    var remaining_reach := limit + direction * (_soles[_support].x - _ground.x)
    _span = clampf(remaining_reach, minf(0.01, step), step)
    _swing_from = _soles[1 - _support]
    _pitch_from = _foot_pitch[1 - _support]
    _swing_to = Vector2(_ground.x + direction * (_span + step * 0.5), _ground.y)
    _arm_from = _arm_angle
    var side := 1.0 if _support == NEAR else -1.0
    _arm_to = deg_to_rad(arm_swing_degrees) * side * direction


func _render_pose() -> void:
    if not is_inside_tree():
        return
    global_position = _ground
    var soles: Array[Vector2] = [to_local(_soles[NEAR]), to_local(_soles[FAR])]
    var sole_offset := Vector2.DOWN * ankle_above_sole
    var ankles: Array[Vector2] = [
        soles[NEAR] - sole_offset.rotated(_foot_pitch[NEAR]),
        soles[FAR] - sole_offset.rotated(_foot_pitch[FAR]),
    ]
    var half_span := _hip_separation() * 0.5
    for side in [NEAR, FAR]:
        var origin := _thighs[side].rest.origin
        var split := half_span if side == NEAR else -half_span
        _thighs[side].position = Vector2((origin.x + split) * _span_orientation, origin.y)
    var reach := thigh_length + shin_length
    var minimum := absf(thigh_length - shin_length) + 0.01
    var extension := clampf(reach * standing_extension, minimum + _short_segment() * 0.8, reach - 0.02)
    var highest := -INF
    var lowest := INF
    var desired := -INF
    for side in [NEAR, FAR]:
        var ankle := ankles[side] - _thighs[side].position
        var horizontal_sq := ankle.x * ankle.x
        highest = maxf(highest, ankle.y - sqrt(maxf(0.0, (reach - 0.01) ** 2 - horizontal_sq)))
        lowest = minf(lowest, ankle.y - sqrt(maxf(0.0, minimum ** 2 - horizontal_sq)))
        desired = maxf(desired, ankle.y - sqrt(maxf(0.0, extension ** 2 - horizontal_sq)))
    _pelvis.position = Vector2(0.0, clampf(desired, highest, maxf(highest, lowest)))
    _pelvis.rotation = 0.0
    for side in [NEAR, FAR]:
        var hip := _pelvis.position + _thighs[side].position
        var knee := _solve_knee(hip, ankles[side])
        var thigh_angle := (knee - hip).angle() - PI * 0.5
        var shin_angle := (ankles[side] - knee).angle() - PI * 0.5
        _thighs[side].rotation = thigh_angle
        _shins[side].position = Vector2.DOWN * thigh_length
        _shins[side].rotation = shin_angle - thigh_angle
        _feet[side].position = Vector2.DOWN * shin_length
        _feet[side].rotation = _foot_pitch[side] - shin_angle
        _render_arm(side)
    _pose_tail()
    _orient_skin()


func _solve_knee(hip: Vector2, ankle: Vector2) -> Vector2:
    var axis := (ankle - hip).normalized()
    if axis.is_zero_approx():
        axis = Vector2.DOWN
    var distance := clampf(hip.distance_to(ankle), absf(thigh_length - shin_length) + 0.01, thigh_length + shin_length - 0.01)
    var along := (thigh_length ** 2 - shin_length ** 2 + distance ** 2) / (2.0 * distance)
    var away := sqrt(maxf(0.0, thigh_length ** 2 - along ** 2))
    var knee_side := _knee_orientation if knees_bend_right else -_knee_orientation
    var perpendicular := Vector2(axis.y, -axis.x) * knee_side
    return hip + along * axis + away * perpendicular


func _render_arm(side: int) -> void:
    var near_direction := 1.0 if side == NEAR else -1.0
    var split := shoulder_span * 0.5 * near_direction
    var mirrored_shoulder := Vector2((shoulder_offset.x + split) * _span_orientation, shoulder_offset.y)
    var idle_angle := deg_to_rad(idle_arm_spread_degrees) * _span_orientation
    _shoulders[side].position = torso_offset + mirrored_shoulder
    _shoulders[side].rotation = (_arm_angle - idle_angle) * near_direction
    _forearms[side].position = Vector2.DOWN * upper_arm_length
    _forearms[side].rotation = deg_to_rad(elbow_bend_degrees) * 0.6 * _span_orientation
    _hands[side].position = Vector2.DOWN * forearm_length
    _hands[side].rotation = 0.0


func _orient_skin() -> void:
    _orient_upper_body()
    for side in [NEAR, FAR]:
        var foot_heading := _foot_facing[side] if is_sole_planted(side == NEAR) else _facing
        _orient_sprite(_thigh_art[side], thigh_pivot, _facing)
        _orient_sprite(_shin_art[side], shin_pivot, _facing)
        _orient_sprite(_caps[side], Vector2(0.5, 0.5), _facing)
        _orient_sprite(_shoe_art[side], foot_sole_pivot, foot_heading)
        _orient_sprite(_shoulder_art[side], upper_arm_pivot, _facing)
        _orient_sprite(_forearm_art[side], forearm_pivot, _facing)
        _orient_sprite(_hand_art[side], hand_pivot, _facing)


func _pose_tail() -> void:
    var visual_facing := 1.0 - 2.0 * smoothstep(0.0, 1.0, _turn_progress)
    # Its existing rear draw order lets the tail pass behind the torso.
    _tail.position = Vector2(tail_offset.x * visual_facing, tail_offset.y)
    var idle_swing := sin(_tail_idle_phase) * 0.07
    var walk_swing := sin(_tail_walk_phase) * 0.13 * _tail_walk_weight
    _tail.rotation = (idle_swing + walk_swing) * visual_facing


func _turning() -> bool:
    return not is_equal_approx(_turn_progress, 1.0 if _facing < 0 else 0.0)


func _orient_upper_body() -> void:
    _orient_turn_sprite(_torso, torso_pivot)
    _orient_turn_sprite(_head, head_pivot)
    _orient_turn_sprite(_tail_art, tail_pivot)


func _orient_turn_sprite(sprite: Sprite2D, pivot: Vector2) -> void:
    # One quad retains the full face width and opaque centre throughout a turn.
    # Re-targeting changes only the destination, never the current blend.
    sprite.flip_h = false
    if sprite.texture == null or not _turn_materials.has(sprite):
        return
    var mix_amount := smoothstep(0.0, 1.0, _turn_progress)
    var shift := (Vector2(0.5, 0.5) - pivot) * sprite.texture.get_size()
    sprite.offset = Vector2(shift.x * (1.0 - mix_amount * 2.0), shift.y)
    var material: ShaderMaterial = _turn_materials[sprite]
    if sprite == _tail_art:
        var facing_weight := 1.0 - mix_amount * 2.0
        # Only one tail silhouette is drawn. Turn edge-on behind the body, then
        # change its texture orientation at zero width, where it is concealed.
        sprite.scale.x = absf(facing_weight)
        sprite.offset.x = shift.x * (-1.0 if facing_weight < 0.0 else 1.0)
        material.set_shader_parameter("turn_mix", 1.0 if facing_weight < 0.0 else 0.0)
    else:
        material.set_shader_parameter("turn_mix", mix_amount)
    if sprite == _head:
        material.set_shader_parameter("register_face", register_head_turn)
        material.set_shader_parameter("eye_left", head_eye_left)
        material.set_shader_parameter("eye_right", head_eye_right)
        material.set_shader_parameter("nose", head_nose)
        material.set_shader_parameter("ears", head_ears)
        material.set_shader_parameter("ear_tips", head_ear_tips)
    var source_rect := Vector4(0.0, 0.0, 1.0, 1.0)
    if sprite.texture is AtlasTexture:
        var atlas := sprite.texture as AtlasTexture
        var atlas_size := atlas.atlas.get_size()
        source_rect = Vector4(atlas.region.position.x / atlas_size.x, atlas.region.position.y / atlas_size.y,
            atlas.region.size.x / atlas_size.x, atlas.region.size.y / atlas_size.y)
    material.set_shader_parameter("source_rect", source_rect)


func _orient_sprite(sprite: Sprite2D, pivot: Vector2, heading: int) -> void:
    sprite.flip_h = heading < 0
    if sprite.texture == null:
        return
    var shift := (Vector2(0.5, 0.5) - pivot) * sprite.texture.get_size()
    sprite.offset = Vector2(shift.x * heading, shift.y)
