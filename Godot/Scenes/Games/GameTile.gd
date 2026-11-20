extends "res://Scenes/Games/TouchButton.gd"

@onready var face: TextureRect = $Face


func fit_portrait() -> void:
    face.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
    clip_contents = true


func paint(image: Texture2D, label: String, selected := false, matched := false) -> void:
    face.texture = image
    text = "" if image else "?"
    accessibility_name = label
    disabled = matched
    self_modulate = Color(0.77, 1.0, 0.81) if selected else Color.WHITE
    $Matched.visible = matched
    face.modulate = Color.WHITE


func reveal() -> void:
    face.pivot_offset = face.size * 0.5
    face.scale.x = 0.14
    create_tween().tween_property(face, "scale:x", 1.0, 0.17).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
