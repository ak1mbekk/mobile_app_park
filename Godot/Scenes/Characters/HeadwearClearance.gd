@tool
extends Node3D

const PROFILES := ["Baby", "Juvenile", "Adult"]

## Show one age profile in the scene editor while adjusting the fit.
@export_enum("Скрыть", "Малыш", "Подросший", "Взрослый") var editor_preview := 0:
    set(value):
        editor_preview = value
        if is_node_ready():
            _update_preview()


func _ready() -> void:
    _update_preview()


func _update_preview() -> void:
    visible = Engine.is_editor_hint() and editor_preview > 0
    for index in PROFILES.size():
        get_node(PROFILES[index]).visible = editor_preview == index + 1
