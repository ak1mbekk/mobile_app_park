extends Button

var finger := -1


func _gui_input(event: InputEvent) -> void:
    if not event is InputEventScreenTouch or disabled:
        return
    if event.pressed:
        if finger == -1:
            finger = event.index
        accept_event()
        return
    if finger != event.index:
        return
    finger = -1
    accept_event()
    if not event.canceled and Rect2(Vector2.ZERO, size).has_point(event.position):
        pressed.emit()
