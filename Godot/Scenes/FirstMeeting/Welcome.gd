extends CanvasLayer

var save_path := "user://first_meeting.cfg"
const DEFAULT_NAME := "Ричи"

@export var aki: Node3D
@export var apple: MeshInstance3D
@onready var hint: Label = %Hint
@onready var panel: PanelContainer = %NamePanel
@onready var field: LineEdit = %PetName
@onready var confirm: Button = %Confirm
@onready var notice: Label = %Notice
var confirmed := false
var pet_name := DEFAULT_NAME

func _ready() -> void:
    if not aki or not apple:
        return
    aki.meal_finished.connect(_after_meal)
    apple.picked_up.connect(hint.hide)
    apple.returned_to_floor.connect(hint.show)
    field.text_changed.connect(_validate)
    field.text_submitted.connect(_confirm_name)
    confirm.pressed.connect(func(): _confirm_name(field.text))
    get_viewport().size_changed.connect(_layout)
    _layout()
    if _has_web_host():
        _notify_host("scene-ready")
        return
    var save := ConfigFile.new()
    if save.load(save_path) == OK:
        var stage = save.get_value("meeting", "stage", "")
        if stage in ["name", "complete"]:
            apple.restore_eaten()
            aki.rest_after_meal()
            hint.hide()
            if stage == "name":
                _open_name_panel()
            else:
                pet_name = str(save.get_value("meeting", "pet_name", DEFAULT_NAME))
                _complete()

func _save(stage: String) -> Error:
    var save := ConfigFile.new()
    save.set_value("meeting", "stage", stage)
    save.set_value("meeting", "pet_name", pet_name)
    var draft := save_path + ".tmp"
    var error := save.save(draft)
    if error == OK:
        error = DirAccess.rename_absolute(ProjectSettings.globalize_path(draft), ProjectSettings.globalize_path(save_path))
    return error

func _after_meal() -> void:
    if _has_web_host():
        _notify_host("meal-finished")
        return
    _save("name")
    _open_name_panel()

func _has_web_host() -> bool:
    return OS.has_feature("web") and JavaScriptBridge.eval("window.parent !== window")

func _notify_host(event_name: String) -> void:
    var browser := JavaScriptBridge.get_interface("window")
    browser.parent.postMessage("animal-park:" + event_name, str(browser.location.origin))

func _open_name_panel() -> void:
    hint.hide()
    field.text = DEFAULT_NAME
    panel.show()
    panel.modulate.a = 0.0
    create_tween().tween_property(panel, "modulate:a", 1.0, 0.22)
    _validate(field.text)
    _layout()

func _validate(value: String) -> void:
    confirm.disabled = value.strip_edges().is_empty()
    notice.hide()

func _confirm_name(value: String) -> void:
    if confirmed or not panel.visible or value.strip_edges().is_empty():
        return
    pet_name = value.strip_edges()
    if _save("complete") != OK:
        notice.text = "Не удалось сохранить имя. Попробуй ещё раз."
        notice.show()
        return
    field.release_focus()
    if DisplayServer.has_feature(DisplayServer.FEATURE_VIRTUAL_KEYBOARD):
        DisplayServer.virtual_keyboard_hide()
    _complete()

func _complete() -> void:
    confirmed = true
    panel.hide()
    hint.text = pet_name
    hint.show()
    _layout()

func _process(_delta: float) -> void:
    if panel.visible:
        _layout()

func _layout() -> void:
    var screen_height := maxi(1, DisplayServer.window_get_size().y)
    var viewport_height := get_viewport().get_visible_rect().size.y
    var bottom := 20.0
    if OS.get_name() in ["iOS", "Android"]:
        var safe := DisplayServer.get_display_safe_area()
        var edge := DisplayServer.screen_get_size().y - safe.end.y
        bottom = maxf(bottom, edge * viewport_height / screen_height + 8.0)
    var keyboard := 0
    if DisplayServer.has_feature(DisplayServer.FEATURE_VIRTUAL_KEYBOARD):
        keyboard = maxi(0, DisplayServer.virtual_keyboard_get_height())
    var inset := maxf(bottom, keyboard * viewport_height / screen_height + 8.0)
    panel.offset_bottom = -inset
    panel.offset_top = -inset - panel.get_combined_minimum_size().y
    hint.offset_bottom = -bottom
    hint.offset_top = -bottom - hint.get_combined_minimum_size().y
