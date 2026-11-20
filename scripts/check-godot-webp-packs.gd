extends SceneTree

# Run from outside the source project, using --main-pack <candidate>.
# Pass the baseline and candidate Web PCK paths after --.

const FLOODPLAIN := "res://Art/Textures/Floodplain.webp"

func _initialize() -> void:
    var paths := OS.get_cmdline_user_args()
    if paths.size() != 2 or not verify(paths[0], paths[1]):
        quit(1)
        return
    quit()

func verify(baseline: String, candidate: String) -> bool:
    var before := FileAccess.open(baseline, FileAccess.READ)
    var after := FileAccess.open(candidate, FileAccess.READ)
    if not before or not after:
        return fail("Cannot open the two PCK files")
    var before_files := read_directory(before)
    var after_files := read_directory(after)
    if before_files.is_empty() or after_files.is_empty():
        return fail("Expected two Godot PCK v4 files")

    var changed := 0
    var removed := 0
    var fallback := 0
    var saved := 0
    var optimized := {}
    for path: String in before_files:
        if not (".webp-" in path and path.ends_with(".ctex")):
            continue
        var base_bytes := read_entry(before, before_files[path])
        if not after_files.has(path):
            # Game room uses the shared shop illustration with the same imported bytes.
            if not path.get_file().begins_with("shop-chest.webp-"):
                return fail("Missing texture: %s" % path)
            var shared := false
            for entry: String in after_files:
                if entry.get_file().begins_with("shop-chest.webp-") and entry.ends_with(".ctex"):
                    shared = base_bytes == read_entry(after, after_files[entry])
                    if shared:
                        break
            if not shared:
                return fail("Removed texture differs from shared resource: %s" % path)
            removed += 1
            saved += base_bytes.size()
            continue
        var next_bytes := read_entry(after, after_files[path])
        if base_bytes == next_bytes:
            fallback += 1
            continue
        if next_bytes.size() >= base_bytes.size():
            return fail("Expected smaller texture: %s" % path)
        var before_image := decode_texture(base_bytes)
        var after_image := decode_texture(next_bytes)
        if before_image == null or after_image == null:
            return fail("Could not decode both textures: %s" % path)
        if before_image.get_size() != after_image.get_size() or before_image.get_format() != after_image.get_format():
            return fail("Texture dimensions or format changed: %s" % path)
        if before_image.get_data() != after_image.get_data():
            return fail("Texture pixels changed: %s" % path)
        optimized[path.trim_prefix("res://")] = true
        changed += 1
        saved += base_bytes.size() - next_bytes.size()
        print("Exact pixel match: %s (%d bytes saved)" % [path.get_file(), base_bytes.size() - next_bytes.size()])

    if changed == 0 or removed != 1:
        return fail("Expected compact WebP payloads and one shared chest illustration")
    if not verify_runtime_loads(after, after_files, optimized):
        return false
    print("PASS: %d WebP textures match pixel for pixel, %d untouched, %d duplicate removed, %d fewer bytes" % [changed, fallback, removed, saved])
    return true

func fail(reason: String) -> bool:
    push_error(reason)
    return false

func read_directory(file: FileAccess) -> Dictionary:
    if file.get_32() != 0x43504447 or file.get_32() != 4:
        return {}
    file.seek(24)
    var data_start := file.get_64()
    var directory := file.get_64()
    file.seek(directory)
    var count := file.get_32()
    var entries := {}
    for _entry in count:
        var path_size := file.get_32()
        var path := file.get_buffer(path_size).get_string_from_utf8()
        var offset := file.get_64() + data_start
        var size := file.get_64()
        file.seek(file.get_position() + 20)
        entries[path] = [offset, size]
    return entries

func read_entry(file: FileAccess, entry: Array) -> PackedByteArray:
    file.seek(entry[0])
    return file.get_buffer(entry[1])

func verify_runtime_loads(pack: FileAccess, entries: Dictionary, optimized: Dictionary) -> bool:
    var checked := 0
    var checked_floodplain := false
    for filename: String in entries:
        if not filename.ends_with(".webp.import"):
            continue
        var metadata := read_entry(pack, entries[filename])
        var settings := ConfigFile.new()
        if settings.parse(metadata.get_string_from_utf8()) != OK:
            return fail("Invalid WebP import metadata: %s" % filename)
        var texture_path: String = settings.get_value("remap", "path", "")
        var source := "res://" + filename.trim_prefix("res://").trim_suffix(".import")
        if not optimized.erase(texture_path.trim_prefix("res://")) and source != FLOODPLAIN:
            continue
        if FileAccess.get_file_as_bytes(source + ".import") != metadata:
            return fail("Run the loader check with --main-pack pointing at the candidate export")
        var texture := ResourceLoader.load(source, "Texture2D", ResourceLoader.CACHE_MODE_IGNORE) as Texture2D
        if texture == null or texture.get_width() <= 0 or texture.get_height() <= 0:
            return fail("Cannot load the packed source path as Texture2D: %s" % source)
        checked += 1
        if source == FLOODPLAIN:
            checked_floodplain = true
    if not optimized.is_empty() or not checked_floodplain:
        return fail("Expected original import paths for the optimized textures, including the veranda view")
    print("PASS: ResourceLoader loaded %d original WebP paths from the candidate pack" % checked)
    return true


func decode_texture(content: PackedByteArray) -> Image:
    if content.size() <= 56 or content.slice(0, 4).get_string_from_ascii() != "GST2":
        return null
    if content.decode_u32(4) != 1 or content.decode_u32(36) != 2 or content.decode_u32(44) != 0:
        return null
    if content.decode_u32(52) != content.size() - 56:
        return null
    var image := Image.new()
    if image.load_webp_from_buffer(content.slice(56)) != OK:
        return null
    image.convert(content.decode_u32(48))
    return image
