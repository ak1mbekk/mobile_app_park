@tool
extends EditorExportPlugin

const SHARING_SCENES := [
    "res://Art/TrailHouse/Architecture/bare-window.glb",
    "res://Art/TrailHouse/Architecture/floorboards.glb",
    "res://Art/TrailHouse/Architecture/timber-wall.glb",
    "res://Art/TrailHouse/Care/bath-chair-with-towel.glb",
    "res://Art/TrailHouse/Furniture/wooden-wash-tub.glb",
]
const RICHI := "res://Art/Characters/Richi.glb"
# These clips have no gameplay callers. The source rig and its editor import keep them.
const UNUSED_CLIPS := [
    &"Running", &"Eat", &"Cheer_with_Both_Hands_Up", &"Idle_Turn_Right", &"Scheming_Hand_Rub",
    &"Wake_Up_and_Look_Up", &"Wave_One_Hand",
]
const EXPORT_FOLDER := "res://.godot/park_web_export"

var imported_scenes := {}
var paths_by_key := {}
var shared := {}

func _get_name() -> String:
    return "Park Web Scene Optimization"

func _export_begin(features: PackedStringArray, _debug: bool, _path: String, _flags: int) -> void:
    if not features.has("web"):
        return
    var directory := ProjectSettings.globalize_path(EXPORT_FOLDER)
    if DirAccess.make_dir_recursive_absolute(directory) != OK:
        return
    var keep := PortableCompressedTexture2D.is_keeping_all_compressed_buffers()
    PortableCompressedTexture2D.set_keep_all_compressed_buffers(true)
    for path: String in SHARING_SCENES + [RICHI]:
        var settings := ConfigFile.new()
        if settings.load(path + ".import") != OK:
            continue
        var imported_path: String = settings.get_value("remap", "path", "")
        # The editable importer cache and other open scenes must retain their own resources.
        var scene := ResourceLoader.load(imported_path, "PackedScene", ResourceLoader.CACHE_MODE_IGNORE_DEEP) as PackedScene
        if not scene:
            continue
        var node := scene.instantiate(PackedScene.GEN_EDIT_STATE_INSTANCE)
        var materials := {}
        if path != RICHI:
            _collect_materials(node, materials)
        var bindings := []
        for material: BaseMaterial3D in materials:
            for property in material.get_property_list():
                if property.type != TYPE_OBJECT or (property.usage & PROPERTY_USAGE_STORAGE) == 0:
                    continue
                var texture = material.get(property.name)
                if not texture is PortableCompressedTexture2D or texture.resource_local_to_scene:
                    continue
                var data: PackedByteArray = texture.get("_data")
                if data.size() < 16384:
                    continue
                var hash := HashingContext.new()
                hash.start(HashingContext.HASH_SHA256)
                hash.update(data)
                hash.update(var_to_bytes(texture.size_override))
                var key := hash.finish().hex_encode()
                bindings.append([material, property.name, data, key, texture.size_override])
                if not paths_by_key.has(key):
                    paths_by_key[key] = {}
                paths_by_key[key][path] = true
        imported_scenes[path] = [node, settings, bindings, imported_path]
    PortableCompressedTexture2D.set_keep_all_compressed_buffers(keep)

func _collect_materials(node: Node, materials: Dictionary) -> void:
    if node is MeshInstance3D and node.mesh:
        for ix in node.mesh.get_surface_count():
            var material: Material = node.mesh.surface_get_material(ix)
            if material is BaseMaterial3D:
                materials[material] = true
    for child in node.get_children():
        _collect_materials(child, materials)

func _export_file(path: String, type: String, features: PackedStringArray) -> void:
    if type != "PackedScene" or not features.has("web") or not imported_scenes.has(path):
        return
    var item: Array = imported_scenes[path]
    var node: Node = item[0]
    var changed := _trim_unused(node) if path == RICHI else false
    for binding: Array in item[2]:
        var key: String = binding[3]
        if paths_by_key[key].size() < 2:
            continue
        var data: PackedByteArray = binding[2]
        var texture := _shared_texture(data, key, binding[4])
        if texture:
            binding[0].set(binding[1], texture)
            changed = true
    if not changed:
        return
    var scene := PackedScene.new()
    if scene.pack(node) != OK:
        return
    var output := EXPORT_FOLDER.path_join(path.get_file() + ".scn")
    if ResourceSaver.save(scene, output, ResourceSaver.FLAG_COMPRESS) != OK:
        return
    var original_pack_path: String = item[3]
    var import_settings: ConfigFile = item[1]
    for section in ["deps", "params"]:
        if import_settings.has_section(section):
            import_settings.erase_section(section)
    var data := FileAccess.get_file_as_bytes(output)
    if data.is_empty():
        return
    add_file(path + ".import", import_settings.encode_to_text().to_utf8_buffer(), false)
    add_file(original_pack_path, data, false)
    skip()

func _shared_texture(data: PackedByteArray, key: String, size: Vector2) -> PortableCompressedTexture2D:
    if shared.has(key):
        var previous: PortableCompressedTexture2D = shared[key]
        return previous if previous.get("_data") == data and previous.size_override == size else null
    var texture := PortableCompressedTexture2D.new()
    texture.keep_compressed_buffer = true
    texture.set("_data", data)
    texture.size_override = size
    var path := EXPORT_FOLDER.path_join("basis-" + key + ".res")
    if ResourceSaver.save(texture, path, ResourceSaver.FLAG_CHANGE_PATH | ResourceSaver.FLAG_COMPRESS) != OK:
        return null
    texture.take_over_path(path)
    add_file(path, FileAccess.get_file_as_bytes(path), false)
    shared[key] = texture
    return texture

func _trim_unused(node: Node) -> bool:
    var player := node.get_node_or_null("AnimationPlayer") as AnimationPlayer
    if not player or not player.has_animation_library(&""):
        return false
    var library := player.get_animation_library(&"")
    var changed := false
    for clip: StringName in UNUSED_CLIPS:
        if library.has_animation(clip):
            library.remove_animation(clip)
            changed = true
    return changed

func _export_end() -> void:
    for item in imported_scenes.values():
        item[0].free()
    imported_scenes.clear()
    paths_by_key.clear()
    shared.clear()
