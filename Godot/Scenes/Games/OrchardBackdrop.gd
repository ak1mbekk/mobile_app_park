extends Control

@export_range(0.0, 20.0) var near_parallax := 10.0
@export_range(0.0, 3.0) var wind_degrees := 1.25

@onready var far_layer: Control = $FarDepth
@onready var treeline: TextureRect = $FarDepth/Treeline
@onready var near_layer: Control = $NearDepth
@onready var left_bough: TextureRect = $NearDepth/LeftBough
@onready var right_bough: TextureRect = $NearDepth/RightBough
@onready var left_grass: TextureRect = $NearDepth/LeftGrass
@onready var right_grass: TextureRect = $NearDepth/RightGrass
@onready var river: ColorRect = $River
@onready var water: ShaderMaterial = river.material

var breeze := 0.0
var target := 0.0
var drift := 0.0
var ripple_age := 2.0


func _ready() -> void:
    visibility_changed.connect(_update_processing)
    far_layer.resized.connect(_fit_treeline)
    _fit_treeline()
    river.resized.connect(_match_water_aspect)
    _match_water_aspect()
    right_bough.resized.connect(_place_pivots)
    left_grass.resized.connect(_place_pivots)
    right_grass.resized.connect(_place_pivots)
    _place_pivots()
    _update_processing()


func _place_pivots() -> void:
    left_bough.pivot_offset = Vector2(0, left_bough.size.y * 0.70)
    right_bough.pivot_offset = Vector2(right_bough.size.x, right_bough.size.y * 0.70)
    left_grass.pivot_offset = left_grass.size * Vector2(0.5, 0.95)
    right_grass.pivot_offset = right_grass.size * Vector2(0.5, 0.95)


func _fit_treeline() -> void:
    # The bank stays on the horizon; changes in aspect ratio only crop more trees at the sides.
    var strip_width := far_layer.size.x * (treeline.anchor_right - treeline.anchor_left)
    treeline.offset_top = -strip_width * treeline.texture.get_height() / treeline.texture.get_width()


func _match_water_aspect() -> void:
    water.set_shader_parameter("water_aspect", river.size.y / maxf(river.size.x, 1.0))


func _update_processing() -> void:
    set_process(is_visible_in_tree())


func aim_at(basket_fraction: float) -> void:
    target = clampf(basket_fraction * 2.0 - 1.0, -1.0, 1.0)


func touch_water(point: Vector2) -> void:
    var bounds := river.get_global_rect()
    if not bounds.has_area() or not bounds.has_point(point):
        return
    ripple_age = 0.0
    water.set_shader_parameter("ripple_origin", (point - bounds.position) / bounds.size)


func _process(delta: float) -> void:
    breeze = fmod(breeze + delta, TAU * 20.0)
    drift = lerpf(drift, target, 1.0 - exp(-5.5 * delta))
    # Position is local to these empty, editor-positioned depth layers.
    far_layer.position.x = -drift * near_parallax * 0.22
    near_layer.position.x = -drift * near_parallax
    var wind := sin(breeze * 1.25) * 0.72 + sin(breeze * 2.1) * 0.28
    left_bough.rotation = deg_to_rad(wind * wind_degrees)
    right_bough.rotation = deg_to_rad((-wind * 0.65 + sin(breeze * 1.45) * 0.35) * wind_degrees)
    left_grass.rotation = deg_to_rad(wind * wind_degrees * 0.5)
    right_grass.rotation = deg_to_rad(wind * wind_degrees * 0.32)
    ripple_age = minf(ripple_age + delta, 2.0)
    water.set_shader_parameter("flow", breeze)
    water.set_shader_parameter("ripple_age", ripple_age)
