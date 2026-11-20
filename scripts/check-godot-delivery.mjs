import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { build, createServer, preview } from 'vite';
import godotDelivery from './godot-delivery.js';

const prefix = '/demo/meeting3d/';
const temporary = path.resolve(tmpdir());
const root = await mkdtemp(path.join(temporary, 'park-godot-delivery-'));
assert.equal(path.dirname(root), temporary);
const game = path.join(root, 'public', prefix);
const pack = Buffer.from('0123456789'.repeat(512));
const wasm = Buffer.from('wasm'.repeat(512));
const html = '<script src="index.js"></script>';
const config = () => ({ configFile: false, root, logLevel: 'silent', plugins: [godotDelivery()] });

function send(port, filename, headers={}, method='GET') {
  return new Promise((resolve, reject) => {
    request({ hostname:'127.0.0.1', port, path:prefix + filename, method, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ code:response.statusCode, headers:response.headers, body:Buffer.concat(chunks) }));
      response.on('error', reject);
    }).on('error', reject).end();
  });
}

async function assets(port) {
  const response = await send(port, 'index.html');
  assert.equal(response.code, 200);
  const files = [...response.body.toString().matchAll(/data-(?:pack|wasm)="([^"]+)"/g)].map(match => match[1]);
  assert.equal(files.length, 2);
  return files;
}

async function checkResponses(port, [packName, wasmName]) {
  const brotli = { 'Accept-Encoding':'gzip, br' };
  const [first, second, archive] = await Promise.all([
    send(port, wasmName, brotli), send(port, wasmName, brotli), send(port, packName, brotli),
  ]);
  assert.equal(first.code, 200);
  assert.equal(first.headers['content-type'], 'application/wasm');
  assert.equal(first.headers['content-encoding'], 'br');
  assert.match(first.headers.vary, /\bAccept-Encoding\b/i);
  assert.equal(first.headers['transfer-encoding'], 'chunked');
  assert.equal(first.headers['content-length'], undefined);
  assert.ok(first.body.equals(second.body));
  assert.ok(brotliDecompressSync(first.body).equals(wasm));
  assert.equal(archive.headers['content-encoding'], 'br');
  assert.equal(archive.headers['transfer-encoding'], 'chunked');
  assert.ok(brotliDecompressSync(archive.body).equals(pack));

  const gzip = await send(port, wasmName, { 'Accept-Encoding':'br;q=0.1,gzip;q=1' });
  assert.equal(gzip.headers['content-encoding'], 'gzip');
  assert.ok(gunzipSync(gzip.body).equals(wasm));
  assert.notEqual(first.headers.etag, gzip.headers.etag);
  const conditional = await send(port, wasmName, { ...brotli, 'If-None-Match':first.headers.etag.slice(2) });
  assert.equal(conditional.code, 304);
  assert.match(conditional.headers.vary, /\bAccept-Encoding\b/i);
  assert.equal(conditional.body.length, 0);

  const head = await send(port, wasmName, brotli, 'HEAD');
  assert.equal(Number(head.headers['content-length']), first.body.length);
  assert.equal(head.body.length, 0);
  const plain = await send(port, wasmName);
  assert.equal(plain.headers['content-encoding'], undefined);
  assert.ok(plain.body.equals(wasm));
  const part = await send(port, wasmName, { ...brotli, Range:'bytes=2-6', 'If-Range':plain.headers.etag });
  assert.equal(part.code, 206);
  assert.equal(part.headers['content-range'], `bytes 2-6/${wasm.length}`);
  assert.equal(part.headers['content-encoding'], undefined);
  assert.ok(part.body.equals(wasm.subarray(2, 7)));
  const suffix = await send(port, packName, { Range:'bytes=-4' });
  assert.equal(suffix.code, 206);
  assert.ok(suffix.body.equals(pack.subarray(-4)));
  const stale = await send(port, packName, { Range:'bytes=0-1', 'If-Range':'"old"' });
  assert.equal(stale.code, 200);
  assert.ok(stale.body.equals(pack));
  const outOfBounds = await send(port, packName, { Range:`bytes=${pack.length}-` });
  assert.equal(outOfBounds.code, 416);
  assert.equal(outOfBounds.headers['content-range'], `bytes */${pack.length}`);
  const refused = await send(port, packName, { 'Accept-Encoding':'br;q=0,gzip;q=0,identity;q=0' });
  assert.equal(refused.code, 406);
}

try {
  await mkdir(game, { recursive:true });
  await Promise.all([
    writeFile(path.join(root, 'index.html'), '<!doctype html><title>Godot delivery fixture</title>'),
    writeFile(path.join(game, 'index.html'), html),
    writeFile(path.join(game, 'index.pck'), pack),
    writeFile(path.join(game, 'index.wasm'), wasm),
  ]);
  const dev = await createServer({ ...config(), server:{ watch:null, hmr:false }, optimizeDeps:{ noDiscovery:true } });
  try {
    await new Promise(resolve => dev.httpServer.listen(0, '127.0.0.1', resolve));
    const port = dev.httpServer.address().port;
    const normal = await assets(port);
    await checkResponses(port, normal);
    const changed = Buffer.alloc(pack.length, 'r');
    const staged = path.join(game, 'next.pck');
    await writeFile(staged, changed);
    await rename(staged, path.join(game, 'index.pck'));
    const next = await assets(port);
    assert.notEqual(normal[0], next[0]);
    assert.equal(normal[1], next[1]);
    assert.equal((await send(port, normal[0], { 'Accept-Encoding':'br' })).code, 404);
    const replacement = await send(port, next[0], { 'Accept-Encoding':'br' });
    assert.ok(brotliDecompressSync(replacement.body).equals(changed));
  } finally {
    await dev.close();
  }

  await writeFile(path.join(game, 'index.pck'), pack);
  await build(config());
  const served = await preview({ ...config(), preview:{ host:'127.0.0.1', port:0 } });
  try {
    const port = served.httpServer.address().port;
    const names = await assets(port);
    await checkResponses(port, names);
    const dist = path.join(root, 'dist', prefix);
    assert.deepEqual((await readdir(dist)).sort(), [...names, 'index.html'].sort());
    assert.ok((await readFile(path.join(dist, names[0]))).equals(pack));
    assert.ok((await readFile(path.join(dist, names[1]))).equals(wasm));
  } finally {
    await served.close();
  }
  console.log('PASS Godot dev and preview compression, caching validators, ranges, atomic version change and plain dist');
} finally {
  await rm(root, { recursive:true, force:true });
}
