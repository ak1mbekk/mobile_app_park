import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { finished } from 'node:stream/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  if (!['--godot', '--output', '--runtime', '--project'].includes(key) || !process.argv[i + 1]) {
    throw new Error('Usage: node scripts/build-godot-web.mjs --output <directory> [--godot <executable>] [--runtime <matching exported runtime>] [--project <Godot project>]');
  }
  options[key.slice(2)] = process.argv[i + 1];
}
if (!options.output) throw new Error('--output is required; see docs/godot-web-build.md');
const executable = options.godot || process.env.GODOT || 'godot';
const project = path.resolve(options.project || path.join(root, 'Godot'));
const output = path.resolve(options.output);
const work = await mkdtemp(path.join(tmpdir(), 'park-godot-web-'));
const stage = path.join(work, 'export');
await mkdir(stage);
console.log(`Godot export work/logs: ${work}`);

async function run(label, args, timeout = 0) {
  const chunks = [];
  const logPath = path.join(work, `${label}.log`);
  const liveLog = createWriteStream(logPath);
  const code = await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, timeout, stdio: ['ignore', 'pipe', 'pipe'] });
    const receive = chunk => { chunks.push(chunk); liveLog.write(chunk); };
    child.stdout.on('data', receive);
    child.stderr.on('data', receive);
    child.once('error', reject);
    child.once('close', resolve);
  });
  liveLog.end();
  await finished(liveLog);
  const log = Buffer.concat(chunks).toString('utf8');
  if (code !== 0 || /(?:^|\n)(?:SCRIPT )?ERROR:/m.test(log)) {
    throw new Error(`${label} failed (${code}); inspect ${logPath}\n${log.slice(-4000)}`);
  }
  console.log(`${label}: passed`);
  return log.trim();
}

const version = await run('version', ['--version']);
// A boot preset with different import features could produce a different set
// of compressed textures. Reject that drift before creating a release pair.
const presets = await readFile(path.join(project, 'export_presets.cfg'), 'utf8');
function section(name) {
  const header = `[${name}]`;
  const start = presets.indexOf(header);
  if (start < 0) throw new Error(`Missing ${header}`);
  return presets.slice(start + header.length).split(/\n\[/, 1)[0]
    .split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith(';'));
}
if (JSON.stringify(section('preset.0.options')) !== JSON.stringify(section('preset.1.options'))) {
  throw new Error('Web and Web Boot export options must match');
}
for (const key of ['platform', 'custom_features', 'script_export_mode']) {
  const setting = lines => lines.find(line => line.startsWith(key + '='));
  if (setting(section('preset.0')) !== setting(section('preset.1'))) throw new Error(`Web/boot ${key} mismatch`);
}
await run('import', ['--headless', '--path', project, '--editor', '--import']);
if (options.runtime) {
  const runtime = path.resolve(options.runtime);
  // Explicit opt-in for installations without Web templates. Never reuse its
  // project pack: both packs below are exported from the selected source tree.
  for (const name of await readdir(runtime)) {
    if (/^index\.(?!pck$)/.test(name) || ['COPYRIGHT.txt', 'LICENSE.txt'].includes(name)) {
      if ((await stat(path.join(runtime, name))).isFile()) await copyFile(path.join(runtime, name), path.join(stage, name));
    }
  }
  for (const name of ['index.html', 'index.js', 'index.wasm']) await stat(path.join(stage, name));
} else {
  await run('web-runtime', ['--headless', '--path', project, '--export-release', 'Web', path.join(stage, 'index.html')]);
}
await run('full-pack', ['--headless', '--path', project, '--export-pack', 'Web', path.join(work, 'full.zip')]);
await run('boot-pack', ['--headless', '--path', project, '--export-pack', 'Web Boot', path.join(work, 'boot.zip')]);
await run('partition', ['--headless', '--path', project, '--script', path.join(root, 'scripts/partition-godot-web.gd'), '--', path.join(work, 'boot.zip'), path.join(work, 'full.zip'), stage]);
await run('split-check', ['--headless', '--main-pack', path.join(stage, 'index.pck'), '--script', path.join(root, 'scripts/check-godot-split.gd'), '--', path.join(stage, 'home.pck'), path.join(work, 'meeting-check.cfg')], 120000);
await run('export-check', ['--headless', '--main-pack', path.join(stage, 'index.pck'), '--script', path.join(root, 'scripts/check-exported-game.gd'), '--', '--home-pack', path.join(stage, 'home.pck')], 120000);

const files = {};
for (const name of ['index.pck', 'home.pck', 'index.wasm']) {
  const bytes = await readFile(path.join(stage, name));
  files[name] = { size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
let html = await readFile(path.join(stage, 'index.html'), 'utf8');
if (!/"fileSizes":\{[^}]*\}/.test(html)) throw new Error('Cannot find generated Godot fileSizes');
html = html.replace(/"fileSizes":\{[^}]*\}/, '"fileSizes":' + JSON.stringify(Object.fromEntries(Object.entries(files).map(([name, file]) => [name, file.size]))));
const loader = '<script src="index.js"></script>';
if (!html.includes(loader)) throw new Error('Cannot find generated Godot engine script');
html = html.replace(/<script\b[^>]*\bsrc=["']delivery\.js["'][^>]*>\s*<\/script>\s*/g, '')
  .replace(loader, '<script src="delivery.js" data-home="home.pck"></script>\n\t\t' + loader);
await writeFile(path.join(stage, 'index.html'), html);
await copyFile(path.join(root, 'public/demo/meeting3d/delivery.js'), path.join(stage, 'delivery.js'));
await writeFile(path.join(stage, 'pack-build.json'), JSON.stringify({ godot: version, files }, null, 2) + '\n');
await mkdir(output, { recursive: true });
for (const name of await readdir(stage)) await copyFile(path.join(stage, name), path.join(output, name));
console.log(`Verified Web export: ${output}\nBoot: ${files['index.pck'].size} bytes; home: ${files['home.pck'].size} bytes`);
