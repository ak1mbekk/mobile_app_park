import { createHash } from 'node:crypto';
import { open, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

const directory = 'demo/meeting3d';
const binaries = ['pck', 'wasm'];
const versioned = /^\/index-([a-f0-9]{64})\.(pck|wasm)$/;
const loader = /<script src="index\.js"><\/script>/;

function acceptsGzip(header = '') {
  return header.split(',').some(entry => {
    const [name, ...options] = entry.toLowerCase().trim().split(/\s*;\s*/);
    const quality = options.find(option => option.startsWith('q='));
    return name === 'gzip' && (!quality || Number(quality.slice(2)) > 0);
  });
}

function injectBootstrap(html, [pack, wasm]) {
  return html.replace(loader, script =>
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
    server.middlewares.use(`/${directory}`, async (req, res, next) => {
      if (!['GET', 'HEAD'].includes(req.method)) return next();
      const [resource] = req.url.split('?');
      const version = resource.match(versioned);
      const legacyWasm = resource === '/index.wasm';
      const gzip = acceptsGzip(req.headers['accept-encoding']) && !req.headers.range;
      if (version?.[2] === 'wasm' || (legacyWasm && !built)) res.appendHeader('Vary', 'Accept-Encoding');

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

        if (!version && !(legacyWasm && gzip && !built)) return next();
        const ext = version?.[2] || 'wasm';
        const filename = path.join(game, built ? resource.slice(1) : `index.${ext}`);
        await withFile(filename, async (file, stat) => {
          if (!stat.isFile()) throw Object.assign(new Error('Godot resource unavailable'), { code: 'ENOENT' });
          if (res.destroyed) return;
          if (version && !built && version[1] !== await fingerprint(filename, file, stat)) {
            return res.writeHead(404, { 'Cache-Control': 'no-store' }).end();
          }
          const compressed = ext === 'wasm' && gzip;
          const validator = version?.[1] || await fingerprint(filename, file, stat);
          if (res.destroyed) return;
          const etag = `W/"${validator}${compressed ? '-gzip' : ''}"`;
          const headers = {
            'Cache-Control': version ? 'public, max-age=31536000, immutable' : 'no-cache',
            ETag: etag,
          };
          if (req.headers['if-none-match']?.split(',').some(tag => [etag, '*'].includes(tag.trim()))) {
            return res.writeHead(304, headers).end();
          }
          headers['Content-Type'] = ext === 'wasm' ? 'application/wasm' : 'application/octet-stream';
          if (compressed) headers['Content-Encoding'] = 'gzip';
          else headers['Content-Length'] = stat.size.toString();
          res.writeHead(200, headers);
          if (req.method === 'HEAD') return res.end();
          const source = file.createReadStream({ autoClose: false, start: 0 });
          if (compressed) await pipeline(source, createGzip({ level: 1 }), res);
          else await pipeline(source, res);
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
