extends "res://Scenes/Games/TouchButton.gd"

@onready var face: TextureRect = $Face
var toy_card := false


func fit_toy() -> void:
    toy_card = true
    face.offset_left = 8
    face.offset_top = 8
    face.offset_right = -8
    face.offset_bottom = -8
    clip_contents = true


func paint(image: Texture2D, label: String, selected := false, matched := false) -> void:
    face.texture = image
    text = "" if image or toy_card else "?"
    $ToyFace.visible = toy_card and image != null
    $Reverse.visible = toy_card and image == null
    accessibility_name = label
    disabled = matched
    self_modulate = Color(0.77, 1.0, 0.81) if selected else Color.WHITE
    $Matched.visible = matched
    $Matched/Check.visible = toy_card and matched
    face.modulate = Color.WHITE


func reveal() -> void:
    face.pivot_offset = face.size * 0.5
    face.scale.x = 0.14
    create_tween().tween_property(face, "scale:x", 1.0, 0.17).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
