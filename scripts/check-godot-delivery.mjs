import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, brotliDecompressSync, constants, gunzipSync } from 'node:zlib';
import { build, createServer, preview } from 'vite';
import godotDelivery from './godot-delivery.js';

const prefix = '/demo/meeting3d/';
const temporary = path.resolve(tmpdir());
const root = await mkdtemp(path.join(temporary, 'park-godot-delivery-'));
assert.equal(path.dirname(root), temporary);
const game = path.join(root, 'public', prefix);
const fixtures = {
  pack: { original: 'index.pck', body: Buffer.from('intro0123456789'.repeat(512)) },
  wasm: { original: 'index.wasm', body: Buffer.from('wasm'.repeat(512)) },
  home: { original: 'home.pck', body: Buffer.from('separate-home-9876543210'.repeat(1024)) },
};
const html = '<img id="status-splash" src="index.png" alt=""><script src="index.js"></script>';
const config = () => ({ configFile: false, root, logLevel: 'silent', plugins: [godotDelivery()] });
const digest = body => createHash('sha256').update(body).digest('hex');
const hashed = (original, body) => `${path.parse(original).name}-${digest(body)}${path.extname(original)}`;

function send(port, filename, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    request({ hostname: '127.0.0.1', port, path: prefix + filename, method, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ code: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
      response.on('error', reject);
    }).on('error', reject).end();
  });
}

async function assets(port) {
  const response = await send(port, 'index.html');
  assert.equal(response.code, 200);
  const body = response.body.toString();
  assert.match(body, /src="\.\.\/assets\/threshold-morning\.webp"/);
  assert.equal([...body.matchAll(/<script src="delivery\.js"/g)].length, 1);
  const entries = [...body.matchAll(/data-(pack|wasm|home)="([^"]+)"/g)].map(match => [match[1], match[2]]);
  assert.equal(entries.length, 3, 'Bootstrap names the intro pack, shared WASM and separate home pack');
  const files = Object.fromEntries(entries);
  assert.deepEqual(Object.keys(files).sort(), ['home', 'pack', 'wasm']);
  assert.match(files.pack, /^index-[a-f0-9]{64}\.pck$/);
  assert.match(files.wasm, /^index-[a-f0-9]{64}\.wasm$/);
  assert.match(files.home, /^home-[a-f0-9]{64}\.pck$/);
  return files;
}

async function checkResponses(port, names) {
  for (const [key, { original, body }] of Object.entries(fixtures)) {
    const filename = names[key];
    assert.equal(filename, hashed(original, body), 'Each URL hashes its own bytes: ' + original);
    const brotli = { 'Accept-Encoding': 'gzip, br' };
    const [first, second] = await Promise.all([send(port, filename, brotli), send(port, filename, brotli)]);
    assert.equal(first.code, 200);
    assert.equal(first.headers['content-type'], key === 'wasm' ? 'application/wasm' : 'application/octet-stream');
    assert.equal(first.headers['content-encoding'], 'br');
    assert.match(first.headers.vary, /\bAccept-Encoding\b/i);
    assert.match(first.headers['cache-control'], /immutable/);
    assert.equal(first.headers['transfer-encoding'], 'chunked');
    assert.equal(first.headers['content-length'], undefined);
    assert.ok(first.body.equals(second.body));
    assert.ok(brotliDecompressSync(first.body).equals(body));

    const gzip = await send(port, filename, { 'Accept-Encoding': 'br;q=0.1,gzip;q=1' });
    assert.equal(gzip.code, 200);
    assert.equal(gzip.headers['content-encoding'], 'gzip');
    assert.ok(gunzipSync(gzip.body).equals(body));
    assert.notEqual(first.headers.etag, gzip.headers.etag);
    const conditional = await send(port, filename, { ...brotli, 'If-None-Match': first.headers.etag.replace(/^W\//, '') });
    assert.equal(conditional.code, 304);
    assert.match(conditional.headers.vary, /\bAccept-Encoding\b/i);
    assert.equal(conditional.body.length, 0);

    const head = await send(port, filename, brotli, 'HEAD');
    assert.equal(head.code, 200);
    assert.equal(Number(head.headers['content-length']), first.body.length);
    assert.equal(head.body.length, 0);
    const plain = await send(port, filename);
    assert.equal(plain.headers['content-encoding'], undefined);
    assert.ok(plain.body.equals(body));
    const part = await send(port, filename, { ...brotli, Range: 'bytes=2-6', 'If-Range': plain.headers.etag });
    assert.equal(part.code, 206);
    assert.equal(part.headers['content-range'], `bytes 2-6/${body.length}`);
    assert.equal(part.headers['content-encoding'], undefined);
    assert.ok(part.body.equals(body.subarray(2, 7)));
    const suffix = await send(port, filename, { Range: 'bytes=-4' });
    assert.equal(suffix.code, 206);
    assert.ok(suffix.body.equals(body.subarray(-4)));
    const stale = await send(port, filename, { Range: 'bytes=0-1', 'If-Range': '"old"' });
    assert.equal(stale.code, 200);
    assert.ok(stale.body.equals(body));
    const outOfBounds = await send(port, filename, { Range: `bytes=${body.length}-` });
    assert.equal(outOfBounds.code, 416);
    assert.equal(outOfBounds.headers['content-range'], `bytes */${body.length}`);
    const refused = await send(port, filename, { 'Accept-Encoding': 'br;q=0,gzip;q=0,identity;q=0' });
    assert.equal(refused.code, 406);
  }
  assert.equal((await send(port, 'home-' + digest(fixtures.wasm.body) + '.wasm')).code, 404,
    'A home WASM alias must not accidentally serve the shared engine');
}

// Optional measurements use the shipped binaries, with the same-file quality-2
// compression as a reproducible baseline, not a claimed historical build size.
async function checkShippedTransfer() {
  const published = fileURLToPath(new URL('../public/', import.meta.url));
  const dev = await createServer({ ...config(), publicDir: published, server: { watch: null, hmr: false }, optimizeDeps: { noDiscovery: true } });
  try {
    await new Promise(resolve => dev.httpServer.listen(0, '127.0.0.1', resolve));
    const port = dev.httpServer.address().port;
    const measurements = {};
    for (const [key, filename] of Object.entries(await assets(port))) {
      const original = await readFile(path.join(published, 'demo/meeting3d', fixtures[key].original));
      assert.equal(filename, hashed(fixtures[key].original, original));
      const delivered = await send(port, filename, { 'Accept-Encoding': 'br' });
      assert.equal(delivered.code, 200);
      assert.equal(delivered.headers['content-encoding'], 'br');
      assert.ok(brotliDecompressSync(delivered.body).equals(original));
      measurements[key] = { raw: original.length, wire: delivered.body.length,
        quality2: brotliCompressSync(original, { params: { [constants.BROTLI_PARAM_QUALITY]: 2 } }).length };
    }
    const wire = Object.values(measurements).reduce((total, asset) => total + asset.wire, 0);
    const baseline = Object.values(measurements).reduce((total, asset) => total + asset.quality2, 0);
    assert.ok(wire < baseline, 'Compression of the same shipped files improves on quality 2');
    console.log('PASS split Web transfer bytes:', { ...measurements,
      firstMeeting: measurements.pack.wire + measurements.wasm.wire, deferredHome: measurements.home.wire, total: wire });
  } finally { await dev.close(); }
}

try {
  await mkdir(game, { recursive: true });
  await Promise.all([
    writeFile(path.join(root, 'index.html'), '<!doctype html><title>Godot delivery fixture</title>'),
    writeFile(path.join(game, 'index.html'), html),
    ...Object.values(fixtures).map(({ original, body }) => writeFile(path.join(game, original), body)),
  ]);
  const dev = await createServer({ ...config(), server: { watch: null, hmr: false }, optimizeDeps: { noDiscovery: true } });
  try {
    await new Promise(resolve => dev.httpServer.listen(0, '127.0.0.1', resolve));
    const port = dev.httpServer.address().port;
    let current = await assets(port);
    await checkResponses(port, current);
    // A home update must not invalidate the first-meeting pack or shared engine.
    // Then independently change the intro pack and retain the home version.
    for (const key of ['home', 'pack']) {
      const fixture = fixtures[key];
      const changed = Buffer.alloc(fixture.body.length, key === 'home' ? 'h' : 'i');
      const staged = path.join(game, 'next-' + fixture.original);
      await writeFile(staged, changed);
      await rename(staged, path.join(game, fixture.original));
      const next = await assets(port);
      assert.equal(next[key], hashed(fixture.original, changed));
      assert.notEqual(current[key], next[key]);
      for (const other of Object.keys(fixtures).filter(value => value !== key)) assert.equal(next[other], current[other]);
      const stale = await send(port, current[key], { 'Accept-Encoding': 'br' });
      assert.equal(stale.code, 404);
      assert.equal(stale.headers['cache-control'], 'no-store');
      const replacement = await send(port, next[key], { 'Accept-Encoding': 'br' });
      assert.ok(brotliDecompressSync(replacement.body).equals(changed));
      current = next;
    }
  } finally { await dev.close(); }

  await Promise.all(Object.values(fixtures).map(({ original, body }) => writeFile(path.join(game, original), body)));
  await build(config());
  const served = await preview({ ...config(), preview: { host: '127.0.0.1', port: 0 } });
  try {
    const port = served.httpServer.address().port;
    const names = await assets(port);
    await checkResponses(port, names);
    const dist = path.join(root, 'dist', prefix);
    assert.deepEqual((await readdir(dist)).sort(), [...Object.values(names), 'index.html'].sort());
    for (const [key, { body }] of Object.entries(fixtures)) assert.ok((await readFile(path.join(dist, names[key]))).equals(body));
  } finally { await served.close(); }
  console.log('PASS three independent Godot binaries: dev/preview Brotli and gzip, validators, ranges, atomic hashes and plain dist');
  if (process.argv.includes('--actual')) await checkShippedTransfer();
} finally {
  await rm(root, { recursive: true, force: true });
}
