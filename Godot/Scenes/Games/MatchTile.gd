extends "res://Scenes/Games/GameTile.gd"

var chosen := false
var held := false

func paint(image: Texture2D, label: String, selected := false, matched := false) -> void:
    super.paint(image, label, false, matched)
    chosen = selected
    queue_redraw()

func set_held(value: bool) -> void:
    held = value
    z_index = 3 if value else 0
    queue_redraw()

func reset_motion() -> void:
    face.offset_left = 5
    face.offset_top = 5
    face.offset_right = -5
    face.offset_bottom = -5
    face.pivot_offset = face.size * 0.5
    face.scale = Vector2.ONE
    face.rotation = 0
    face.modulate = Color.WHITE
    set_held(false)

func _draw() -> void:
    if chosen or held:
        var ring := StyleBoxFlat.new()
        ring.bg_color = Color(0.98, 0.87, 0.57, 0.22)
        ring.border_color = Color(0.68, 0.44, 0.15)
        ring.set_border_width_all(2)
        ring.set_corner_radius_all(13)
        draw_style_box(ring, Rect2(Vector2.ONE * 2, size - Vector2.ONE * 4))
