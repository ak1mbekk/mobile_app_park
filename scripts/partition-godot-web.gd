extends SceneTree

# Both ZIPs are official exports. Only their membership differs; take every
# byte from the full export so shared import remaps remain exactly identical.
func _initialize() -> void:
    var args := OS.get_cmdline_user_args()
    if args.size() != 3:
        fail("Expected boot.zip, full.zip and output directory")
        return
    var boot_zip := ZIPReader.new()
    var full_zip := ZIPReader.new()
    if boot_zip.open(args[0]) != OK or full_zip.open(args[1]) != OK:
        fail("Could not open official export ZIPs")
        return
    var boot_paths := {}
    for path in boot_zip.get_files():
        boot_paths[path] = true
    var files := full_zip.get_files()
    files.sort()
    for path in boot_paths:
        if not full_zip.file_exists(path):
            fail("Boot dependency missing from full export: " + path)
            return
    var boot := PCKPacker.new()
    var home := PCKPacker.new()
    if boot.pck_start(args[2].path_join("index.pck")) != OK or home.pck_start(args[2].path_join("home.pck")) != OK:
        fail("Could not create output packs")
        return
    var report := {"boot_files": [], "home_files": []}
    for path in files:
        var data := full_zip.read_file(path)
        var in_boot: bool = boot_paths.has(path)
        var packer: PCKPacker = boot if in_boot else home
        if packer.add_file_from_buffer("res://" + path, data) != OK:
            fail("Could not pack " + path)
            return
        report["boot_files" if in_boot else "home_files"].append(path)
    if boot.flush() != OK or home.flush() != OK:
        fail("Could not finish output packs")
        return
    var output := FileAccess.open(args[2].path_join("pack-files.json"), FileAccess.WRITE)
    if not output:
        fail("Could not write pack membership report")
        return
    output.store_string(JSON.stringify(report, "  "))
    print("PASS partition: ", report.boot_files.size(), " boot files, ", report.home_files.size(), " home files; no overlap or omitted full-export files")
    quit()

func fail(message: String) -> void:
    printerr(message)
    quit(1)
