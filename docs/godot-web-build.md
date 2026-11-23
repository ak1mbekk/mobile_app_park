# Building the split Web game

Use the Godot editor version matching the Web export templates. The project currently uses Godot 4.7.2. Node runs the build; neither an absolute developer-machine path nor an extra npm package is required.

```sh
node scripts/build-godot-web.mjs --output public/demo/meeting3d
```

The executable defaults to `godot` on PATH. Set the `GODOT` environment variable or pass `--godot /path/to/godot` if needed. `--output` is mandatory so a validation build cannot accidentally overwrite the published game. Use any scratch output directory while reviewing changes.

The command imports the project (including on a clean clone), exports the Web runtime normally, exports the `Web` and `Web Boot` presets to ZIP, then writes `index.pck` and `home.pck` with Godot's supported ZIPReader/PCKPacker APIs. It runs both the boot/mount test and the existing exported-game check before copying the completed export to the output directory. Logs and the intermediate ZIPs remain in the temporary work directory printed at startup.

`index.pck` contains Bootstrap, FirstMeeting, their dependency closure, the idle/sleep animation libraries used by the shared character script, and project metadata. `home.pck` contains every remaining file from the full export. Shared textures, import remaps and compiled resources are taken byte-for-byte from the *same full export*; nothing appears in both packs. `pack-files.json` records membership. `pack-build.json` records editor version, byte sizes and SHA-256 of both packs and the WASM. The generated HTML's `fileSizes` is updated for the new pair.

Keep the Web and Web Boot export options and script-export modes in sync; the builder rejects mismatches. Add new boot-time dynamic resource paths to the Web Boot selection. In particular, HomePack.gd is an explicit root in both presets: this editor's selected-resource export did not include it automatically through script preload references. Home-only dynamic paths belong in the full Web selection. A clean export catches missing imported artifacts; no binary PCK editing is used.

For a machine without Web templates, an explicit matching previously exported runtime can be supplied:

```sh
node scripts/build-godot-web.mjs --output /scratch/game --runtime public/demo/meeting3d --godot /path/to/godot
```

The supplied runtime must be from the same Godot version as the editor. This option reuses only its engine HTML/JS/WASM/icons/audio helpers and license files, never its old PCK. Both new packs are still built from source and tested. `--project /path/to/clean/Godot` can verify a separate clean source copy.

Runtime delivery must serve both packs from the same build. The authored Bootstrap and Welcome gate Home on mounting `home.pck`; the host's delivery bridge supplies caching/content-addressed URLs. A raw static export keeps the plain filenames for its fallback. Do not preload Home resources before mounting the second pack, and do not fetch that pack before the fresh introduction's first interactive frame. A returning Home session can request it immediately alongside the boot pack, with the same WASM instance.

The boot test verifies FirstMeeting, a complete meal, naming and saved-meal restoration before Home exists. It then mounts `home.pck` in the same engine and instantiates Home, the three minigames, and the old/new bed scenes. The existing export test verifies the remaining game, bath and character resources with the mounted add-on. Browser verification is still required for first-frame timing, graphics, retries and offline behavior.

Run `node scripts/measure-godot-startup.cjs http://127.0.0.1:8168/ /scratch/startup-report` with Playwright available and `BROWSER_EXE` set as for the other browser QA scripts. It measures three independent cold browser contexts and one warm reload at 390×844/DPR2, saving screenshots and JSON; optional `PARK_TEST_ANGLE` selects the ANGLE backend (Windows defaults to D3D11).
Use the root shell served with content-addressed delivery: the probe fully reads and validates all three cached bodies before reloading, and reports boot/WASM requests separately from any repeated Home GET. Its desktop viewport emulation is not a physical-phone measurement.
