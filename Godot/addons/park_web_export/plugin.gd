@tool
extends EditorPlugin

var web_export := WebExport.new()

func _enter_tree() -> void:
    add_export_plugin(web_export)

func _exit_tree() -> void:
    remove_export_plugin(web_export)


class WebExport extends EditorExportPlugin:
    # Godot 4's GST2 v1 header includes a single WebP image and its byte count.
    const BYTE_COUNT_OFFSET := 52
    const IMAGE_OFFSET := 56

    func _get_name() -> String:
        return "Park Web Export"

    func _export_file(path: String, type: String, features: PackedStringArray) -> void:
        if not features.has("web") or type != "CompressedTexture2D" or path.get_extension() != "webp":
            return

        var settings := ConfigFile.new()
        if settings.load(path + ".import") != OK:
            return
        var texture_path: String = settings.get_value("remap", "path", "")
        if texture_path.is_empty():
            return

        var original := FileAccess.get_file_as_bytes(path)
        var texture := FileAccess.get_file_as_bytes(texture_path)
        if original.is_empty() or texture.size() <= IMAGE_OFFSET + original.size():
            return
        if texture.slice(0, 4).get_string_from_ascii() != "GST2" or texture.decode_u32(4) != 1:
            return
        # Only replace WebP textures with no mipmaps and a single intact payload.
        if texture.decode_u32(36) != 2 or texture.decode_u32(44) != 0:
            return
        if texture.decode_u32(BYTE_COUNT_OFFSET) != texture.size() - IMAGE_OFFSET:
            return

        var format: Image.Format = texture.decode_u32(48)
        if format not in [Image.FORMAT_RGB8, Image.FORMAT_RGBA8]:
            return
        var source_image := Image.new()
        var imported_image := Image.new()
        if source_image.load_webp_from_buffer(original) != OK:
            return
        if imported_image.load_webp_from_buffer(texture.slice(IMAGE_OFFSET)) != OK:
            return
        if source_image.get_size() != imported_image.get_size():
            return
        source_image.convert(format)
        imported_image.convert(format)
        if source_image.get_data() != imported_image.get_data():
            return

        var compact := texture.slice(0, IMAGE_OFFSET)
        compact.encode_u32(BYTE_COUNT_OFFSET, original.size())
        compact.append_array(original)

        # The importer loads .ctex via the original image's .import metadata.
        # A direct .remap to .ctex bypasses that loader in the exported engine.
        for section in ["deps", "params"]:
            if settings.has_section(section):
                settings.erase_section(section)
        add_file(path + ".import", settings.encode_to_text().to_utf8_buffer(), false)
        add_file(texture_path, compact, false)
        skip()
