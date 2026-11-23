extends Node3D

const BUBBLES := 42
const STREAM_RINGS := 12
const STREAM_SIDES := 6

var foam := MultiMeshInstance3D.new()
var water := MeshInstance3D.new()
var stream := ImmediateMesh.new()
var sparkle := MeshInstance3D.new()
var foam_offsets: Array[Vector3] = []
var foam_radii: Array[float] = []
var sparkle_mesh := ImmediateMesh.new()
var stream_circle := PackedVector2Array()

func _ready() -> void:
    var bubble := SphereMesh.new()
    bubble.radius = 1.0
    bubble.height = 2.0
    bubble.radial_segments = 10
    bubble.rings = 5
    var pearl := ShaderMaterial.new()
    pearl.shader = preload("res://Scenes/Home/Art/SoapFilm.gdshader")
    bubble.material = pearl
    foam.multimesh = MultiMesh.new()
    foam.multimesh.transform_format = MultiMesh.TRANSFORM_3D
    foam.multimesh.use_custom_data = true
    foam.multimesh.mesh = bubble
    foam.multimesh.instance_count = BUBBLES
    foam.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    add_child(foam)
    var random := RandomNumberGenerator.new()
    random.seed = 782
    var cluster := Vector3.ZERO
    for index in range(BUBBLES):
        if index % 3 == 0:
            var angle := (index / 3.0) * 2.399963
            var radius := sqrt(float(index + 1) / BUBBLES)
            cluster = Vector3(cos(angle) * radius * 0.20, random.randf_range(-0.10, 0.06), sin(angle) * radius * 0.09)
        var offset := Vector3(random.randf_range(-0.023, 0.023), random.randf_range(-0.019, 0.019), random.randf_range(-0.015, 0.015))
        foam_offsets.append(cluster + offset)
        var large := index % 3 == 0
        foam_radii.append(random.randf_range(0.022, 0.033) if large else random.randf_range(0.009, 0.021))
        foam.multimesh.set_instance_custom_data(index, Color(0.12 if large else 0.9, 0.0, 0.0))
    foam.hide()

    var blue := StandardMaterial3D.new()
    blue.albedo_color = Color(0.68, 0.89, 0.94, 0.59)
    blue.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
    blue.roughness = 0.13
    water.mesh = stream
    water.material_override = blue
    water.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    add_child(water)
    water.hide()
    for side_index in range(STREAM_SIDES + 1):
        stream_circle.append(Vector2.from_angle(TAU * side_index / STREAM_SIDES))

    var glow := StandardMaterial3D.new()
    glow.albedo_color = Color(1.0, 0.91, 0.63)
    glow.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
    glow.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
    glow.cull_mode = BaseMaterial3D.CULL_DISABLED
    sparkle.mesh = sparkle_mesh
    sparkle.material_override = glow
    sparkle.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    add_child(sparkle)
    sparkle.hide()

func show_foam(center: Vector3, amount: float, time: float) -> void:
    foam.visible = amount > 0.002
    if not foam.visible:
        return
    foam.global_position = center
    foam.multimesh.visible_instance_count = mini(BUBBLES, ceili(amount * BUBBLES + 5.0))
    for index in range(foam.multimesh.visible_instance_count):
        var offset := foam_offsets[index]
        var size := foam_radii[index] * smoothstep(0.0, 0.14, amount - maxf(0.0, float(index - 5) / BUBBLES))
        offset.y += sin(time * 2.3 + index) * 0.007
        foam.multimesh.set_instance_transform(index, Transform3D(Basis.from_scale(Vector3(size, size * 0.86, size)), offset))

func show_stream(source: Vector3, impact: Vector3, time: float) -> void:
    water.show()
    source = to_local(source)
    impact = to_local(impact)
    var arc := (source + impact) * 0.5 + Vector3.UP * source.distance_to(impact) * 0.20
    var side := Vector3.UP.cross(impact - source).normalized()
    if side.length_squared() < 0.001:
        side = Vector3.RIGHT
    stream.clear_surfaces()
    stream.surface_begin(Mesh.PRIMITIVE_TRIANGLE_STRIP)
    var previous_center := source
    var previous_across := (arc - source).cross(side).normalized()
    var previous_radius := 0.020 * (0.91 + 0.09 * sin(time * 33.0))
    for ring in range(1, STREAM_RINGS + 1):
        var t := float(ring) / STREAM_RINGS
        var center := source.lerp(arc, t).lerp(arc.lerp(impact, t), t)
        var across := (arc - source).lerp(impact - arc, t).cross(side).normalized()
        var radius := lerpf(0.020, 0.011, t) * (0.91 + 0.09 * sin(time * 33.0 - t * 37.0))
        for radial in stream_circle:
            var from_normal := side * radial.x + previous_across * radial.y
            var to_normal := side * radial.x + across * radial.y
            stream.surface_set_normal(from_normal)
            stream.surface_add_vertex(previous_center + previous_radius * from_normal)
            stream.surface_set_normal(to_normal)
            stream.surface_add_vertex(center + radius * to_normal)
        previous_center = center
        previous_across = across
        previous_radius = radius
    stream.surface_end()

func show_sparkle(center: Vector3, phase: float) -> void:
    sparkle.show()
    sparkle.global_position = center
    sparkle_mesh.clear_surfaces()
    sparkle_mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
    for index in range(4):
        var angle := 0.42 + index * 1.5
        var opening := clampf(phase * 1.7 - index * 0.18, 0.0, 1.0)
        var center_offset := Vector3(cos(angle), sin(angle), 0.0) * lerpf(0.10, 0.29, opening)
        var size := 0.075 * sin(opening * PI) * (1.0 - index * 0.10)
        for point in range(8):
            var corner := _sparkle_corner(point, size)
            var next := _sparkle_corner(point + 1, size)
            sparkle_mesh.surface_add_vertex(center_offset)
            sparkle_mesh.surface_add_vertex(center_offset + corner)
            sparkle_mesh.surface_add_vertex(center_offset + next)
    sparkle_mesh.surface_end()

func _sparkle_corner(point: int, radius: float) -> Vector3:
    var angle := PI * point * 0.25
    var length := radius * (1.0 if point % 2 == 0 else 0.24)
    return Vector3(cos(angle) * length * 0.82, sin(angle) * length, 0.0)

func clear_effects() -> void:
    foam.hide()
    water.hide()
    sparkle.hide()
