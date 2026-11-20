import { createHash } from 'node:crypto';
import { open, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { constants, createBrotliCompress, createGzip } from 'node:zlib';

const directory = 'demo/meeting3d';
const binaries = ['pck', 'wasm'];
const versioned = /^\/index-([a-f0-9]{64})\.(pck|wasm)$/;
const legacy = /^\/index\.(pck|wasm)$/;
const loader = /<script src="index\.js"><\/script>/;

function acceptedEncodings(header = '') {
  const weights = new Map();
  for (const entry of header.toLowerCase().split(',')) {
    const [name, ...options] = entry.trim().split(/\s*;\s*/);
    const quality = options.find(option => /^q\s*=/.test(option));
    const weight = quality === undefined ? 1 : Number(quality.slice(quality.indexOf('=') + 1));
    if (weight >= 0 && weight <= 1) weights.set(name, weight);
  }
  const wildcard = weights.get('*');
  return [
    ['br', weights.get('br') ?? wildcard ?? 0],
    ['gzip', weights.get('gzip') ?? wildcard ?? 0],
    ['identity', weights.get('identity') ?? (wildcard === 0 ? 0 : Number.EPSILON)],
  ].filter(([, weight]) => weight > 0).sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

function byteRange(header = '', size) {
  const parts = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!parts || (!parts[1] && !parts[2])) return undefined;
  const last = size - 1n;
  if (!parts[1]) {
    const suffix = BigInt(parts[2]);
    return size && suffix ? [suffix < size ? size - suffix : 0n, last] : null;
  }
  const start = BigInt(parts[1]);
  const end = parts[2] ? BigInt(parts[2]) : last;
  if (start >= size || end < start) return null;
  return [start, end < last ? end : last];
}

function matchesTag(header, etag) {
  return header?.split(',').some(value => {
    const tag = value.trim();
    return tag === '*' || tag.replace(/^W\//, '') === etag.replace(/^W\//, '');
  });
}

async function collect(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function injectBootstrap(html, [pack, wasm]) {
  // The host already displays this portrait during boot. Reuse its WebP in
  // the engine frame so its hidden splash doesn't fetch another full-size PNG.
  return html.replace(/(<img id="status-splash"[^>]*\bsrc=")index\.png"/, '$1../assets/threshold-morning.webp"')
    .replace(loader, script =>
    `<script src="delivery.js" data-pack="${pack}" data-wasm="${wasm}"></script>\n\t\t${script}`);
}

async function withFile(filename, use) {
  const file = await open(filename, 'r');
  try {
    return await use(file, await file.stat({ bigint: true }));
  } finally {
    await file.close();
  }
}

export default function godotDelivery() {
  const fingerprints = new Map();

  function fingerprint(filename, file, stat) {
    const stamp = [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
    const previous = fingerprints.get(filename);
    if (previous?.stamp === stamp) return previous.digest;
    const digest = (async () => {
      const hash = createHash('sha256');
      for await (const chunk of file.createReadStream({ autoClose: false, start: 0 })) hash.update(chunk);
      return hash.digest('hex');
    })();
    const pending = { stamp, digest };
    fingerprints.set(filename, pending);
    digest.catch(() => {
      if (fingerprints.get(filename) === pending) fingerprints.delete(filename);
    });
    return digest;
  }

  function packedFiles(game) {
    return Promise.all(binaries.map(ext => {
      const filename = path.join(game, `index.${ext}`);
      return withFile(filename, async (file, stat) => `index-${await fingerprint(filename, file, stat)}.${ext}`);
    }));
  }

  function serve(server, game, built) {
    // Keep only representations of the current version of each binary in RAM.
    // This also shares compression work across requests for the same version.
    const encodedFiles = new Map();
    function prepare(file, ext, validator, encoding) {
      let current = encodedFiles.get(ext);
      if (current?.validator !== validator) {
        current = { validator, variants: new Map() };
        encodedFiles.set(ext, current);
      }
      const variants = current.variants;
      if (!variants.has(encoding)) {
        const encoder = encoding === 'br'
          ? createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: 2 } })
          : createGzip({ level: 1 });
        const source = file.createReadStream({ autoClose: false, start: 0, highWaterMark: 256 * 1024 });
        const body = pipeline(source, encoder, collect);
        variants.set(encoding, body);
        body.catch(() => variants.delete(encoding));
      }
      return variants.get(encoding);
    }

    async function warmBrotli() {
      const names = built
        ? [...(await readFile(path.join(game, 'index.html'), 'utf8')).matchAll(/data-(?:pack|wasm)="(index-[a-f0-9]{64}\.(?:pck|wasm))"/g)]
          .map(match => match[1])
        : binaries.map(ext => `index.${ext}`);
      await Promise.all(names.map(name => {
        const filename = path.join(game, name);
        return withFile(filename, async (file, stat) => {
          const [, validator, ext] = built
            ? versioned.exec('/' + name)
            : [null, await fingerprint(filename, file, stat), path.extname(name).slice(1)];
          await prepare(file, ext, validator, 'br');
        });
      }));
    }

    server.httpServer?.once('listening', () => { void warmBrotli().catch(() => {}); });
    server.middlewares.use(`/${directory}`, async (req, res, next) => {
      if (!['GET', 'HEAD'].includes(req.method)) return next();
      const [resource] = req.url.split('?');
      const version = resource.match(versioned);
      const original = !built && resource.match(legacy);

      try {
        if (!built && ['/', '/index.html'].includes(resource)) {
          const html = await readFile(path.join(game, 'index.html'), 'utf8');
          if (!loader.test(html)) return next();
          const body = injectBootstrap(html, await packedFiles(game));
          res.writeHead(200, {
            'Cache-Control': 'no-cache',
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Length': Buffer.byteLength(body),
          });
          return res.end(req.method === 'HEAD' ? undefined : body);
        }

        if (!version && !original) return next();
        res.appendHeader('Vary', 'Accept-Encoding');
        const ext = version?.[2] || original[1];
        const filename = path.join(game, built ? resource.slice(1) : `index.${ext}`);
        await withFile(filename, async (file, stat) => {
          if (!stat.isFile()) throw Object.assign(new Error('Godot resource unavailable'), { code: 'ENOENT' });
          if (res.destroyed) return;
          const validator = built ? version[1] : await fingerprint(filename, file, stat);
          if (version && version[1] !== validator) {
            return res.writeHead(404, { 'Cache-Control': 'no-store' }).end();
          }
          if (res.destroyed) return;
          const accepted = acceptedEncodings(req.headers['accept-encoding']);
          if (!accepted.length) return res.writeHead(406, { 'Cache-Control': 'no-store' }).end();
          const identityTag = `"${validator}"`;
          const ifRange = req.headers['if-range'];
          const range = req.method === 'GET' && accepted.includes('identity') && (!ifRange || ifRange === identityTag)
            ? byteRange(req.headers.range, stat.size)
            : undefined;
          const encoding = range === undefined ? accepted[0] : 'identity';
          const compressed = encoding !== 'identity';
          const etag = compressed ? `W/"${validator}-${encoding}"` : identityTag;
          const headers = {
            'Cache-Control': version ? 'public, max-age=31536000, immutable' : 'no-cache',
            ETag: etag,
          };
          if (matchesTag(req.headers['if-none-match'], etag)) {
            return res.writeHead(304, headers).end();
          }
          if (range === null) {
            return res.writeHead(416, { ...headers, 'Content-Range': `bytes */${stat.size}` }).end();
          }
          headers['Content-Type'] = ext === 'wasm' ? 'application/wasm' : 'application/octet-stream';
          if (compressed) {
            const body = await prepare(file, ext, validator, encoding);
            if (res.destroyed) return;
            headers['Content-Encoding'] = encoding;
            if (req.method === 'HEAD') return res.writeHead(200, { ...headers, 'Content-Length': body.length }).end();
            res.writeHead(200, headers);
            // Keep this GET chunked and respect backpressure. Sending one fixed-size
            // buffer stalled Chromium's Cache Storage copy of the large archive.
            function* parts() {
              const chunkSize = 64 * 1024;
              for (let offset = 0; offset < body.length; offset += chunkSize) {
                yield body.subarray(offset, offset + chunkSize);
              }
            }
            await pipeline(Readable.from(parts()), res);
            return;
          }
          headers['Accept-Ranges'] = 'bytes';
          const [start, end] = range ?? [0n, stat.size - 1n];
          headers['Content-Length'] = (end - start + 1n).toString();
          if (range) headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
          res.writeHead(range ? 206 : 200, headers);
          if (req.method === 'HEAD') return res.end();
          const source = file.createReadStream({ autoClose: false, start: Number(start), ...(range && { end: Number(end) }) });
          await pipeline(source, res);
        });
      } catch (error) {
        if (res.destroyed || res.headersSent) return;
        if (version && error.code === 'ENOENT') return res.writeHead(404, { 'Cache-Control': 'no-store' }).end();
        if (error.code === 'ENOENT') return next();
        next(error);
      }
    });
  }

  return {
    name: 'park-godot-delivery',
    configureServer: server => serve(server, path.join(server.config.publicDir, directory), false),
    configurePreviewServer: server => serve(server, path.resolve(server.config.root, server.config.build.outDir, directory), true),
    async writeBundle({ dir }) {
      const game = path.resolve(dir, directory);
      const page = path.join(game, 'index.html');
      const html = await readFile(page, 'utf8');
      if (!loader.test(html)) return;
      const files = await packedFiles(game);
      await Promise.all(files.map((file, i) => rename(path.join(game, `index.${binaries[i]}`), path.join(game, file))));
      await writeFile(page, injectBootstrap(html, files));
    },
  };
}
