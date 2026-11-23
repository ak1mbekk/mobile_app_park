extends Node

const FIRST_MEETING := "res://Scenes/Levels/FirstMeeting.tscn"
const HOME := "res://Scenes/Levels/Home.tscn"
const HomePack = preload("res://Scenes/Levels/HomePack.gd")

func _ready() -> void:
    # Keep the native/direct-export save flow in Welcome. Only the existing
    # same-origin web host can select Home before any introduction geometry loads.
    var scene := FIRST_MEETING
    if OS.has_feature("web") and JavaScriptBridge.eval("""(() => {
        try {
            const params = new URLSearchParams(location.search);
            return parent !== window && parent.location.origin === location.origin &&
                params.get('host') === 'animal-park' && params.get('scene') === 'home';
        } catch (_) { return false; }
    })()"""):
        if not await HomePack.ensure_home(get_tree()):
            return
        scene = HOME
    get_tree().change_scene_to_file.call_deferred(scene)
