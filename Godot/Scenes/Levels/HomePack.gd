extends RefCounted

const HOME := "res://Scenes/Levels/Home.tscn"
const PACK := "/park-home.pck"

static func ensure_home(tree: SceneTree) -> bool:
    # Native exports and old, complete Web packs need no browser bridge.
    if ResourceLoader.exists(HOME):
        return true
    if not OS.has_feature("web") or not JavaScriptBridge.eval(
        "typeof window.parkHomePack?.ensure === 'function'"
    ):
        push_error("Home scene is unavailable and no Web home-pack loader is installed.")
        return false
    var hosted: bool = JavaScriptBridge.eval("""(() => {
        try {
            return parent !== window && parent.location.origin === location.origin &&
                new URLSearchParams(location.search).get('host') === 'animal-park';
        } catch (_) { return false; }
    })()""")
    var last_state := ""
    var rejected_mount := false
    var retry_dialog: AcceptDialog
    _start_download()
    while true:
        var state: String = str(JavaScriptBridge.eval("window.parkHomePack.state"))
        if state != "ready":
            rejected_mount = false
        if state == "ready" and not rejected_mount:
            if ProjectSettings.load_resource_pack(PACK, false) and ResourceLoader.exists(HOME):
                if is_instance_valid(retry_dialog):
                    retry_dialog.queue_free()
                return true
            JavaScriptBridge.eval("window.parkHomePack.rejectMount?.()")
            rejected_mount = true
            state = "failed"
        elif state == "ready" and rejected_mount:
            state = "failed"
        if state != last_state:
            if hosted:
                var event := "home-load-failed" if state == "failed" else "home-loading"
                var browser := JavaScriptBridge.get_interface("window")
                browser.parent.postMessage("animal-park:" + event, str(browser.location.origin))
            elif state == "failed":
                if not is_instance_valid(retry_dialog):
                    retry_dialog = AcceptDialog.new()
                    retry_dialog.title = "Домик у тропы"
                    retry_dialog.dialog_text = "Не удалось загрузить домик. Проверь соединение и попробуй ещё раз."
                    retry_dialog.ok_button_text = "Повторить"
                    retry_dialog.dialog_close_on_escape = false
                    retry_dialog.get_close_button().hide()
                    retry_dialog.confirmed.connect(_start_download)
                    tree.root.add_child(retry_dialog)
                retry_dialog.popup_centered(Vector2i(360, 160))
            last_state = state
        await tree.process_frame
    return false

static func _start_download() -> void:
    JavaScriptBridge.eval("void window.parkHomePack.ensure().catch(() => {})")
