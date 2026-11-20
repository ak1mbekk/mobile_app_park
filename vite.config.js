import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'node:stream';
import { createGzip } from 'node:zlib';
import alignmentEditor from './scripts/alignment-editor.js';
import familyAccounts from './scripts/family-accounts.js';

const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
const appVersion = process.env.npm_package_version || pkg?.version || '';

function acceptsGzip(header = '') {
  return header.split(',').some(entry => {
    const [name, ...options] = entry.toLowerCase().trim().split(/\s*;\s*/);
    const quality = options.find(option => option.startsWith('q='));
    return name === 'gzip' && (!quality || Number(quality.slice(2)) > 0);
  });
}

function godotDelivery() {
  function serve(server, directory) {
    const game = path.join(directory, 'demo', 'meeting3d');
    server.middlewares.use('/demo/meeting3d', async (req, res, next) => {
      const resource = req.url.split('?')[0];
      if (resource !== '/index.wasm') return next();
      const vary = res.getHeader('Vary');
      res.setHeader('Vary', vary ? vary + ', Accept-Encoding' : 'Accept-Encoding');
      if (req.method !== 'GET' || req.headers.range || !acceptsGzip(req.headers['accept-encoding'])) return next();

      let file, stat;
      try {
        file = await fs.promises.open(path.join(game, resource.slice(1)));
        stat = await file.stat();
      } catch {
        await file?.close().catch(() => {});
        return next();
      }
      if (!stat.isFile() || res.destroyed) {
        await file.close();
        if (!res.destroyed) next();
        return;
      }

      const etag = `W/"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}-gzip"`;
      const headers = { 'Cache-Control': 'no-cache', ETag: etag };
      if (req.headers['if-none-match']?.split(',').some(tag => [etag, '*'].includes(tag.trim()))) {
        await file.close();
        res.writeHead(304, headers).end();
        return;
      }
      res.writeHead(200, {
        ...headers, 'Content-Type': 'application/wasm', 'Content-Encoding': 'gzip',
      });
      pipeline(file.createReadStream(), createGzip({ level: 1 }), res, () => {});
    });
  }

  return {
    name: 'park-godot-delivery',
    configureServer: server => serve(server, server.config.publicDir),
    configurePreviewServer: server => serve(server, path.resolve(server.config.root, server.config.build.outDir)),
  };
}

export default defineConfig(({ mode }) => ({
  publicDir: 'public',
  plugins: [react(), alignmentEditor(), familyAccounts(), godotDelivery()],
  preview: { host: '127.0.0.1' },
  base: './',
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
  server: {
    // Godot replaces the packed game atomically. Watching that binary can close
    // the dev server on Windows while the game is being re-exported.
    watch: { ignored: ['**/Godot/**', '**/public/demo/meeting3d/**'] },
    port: 5173,
    hmr: { overlay: false },
  },
  optimizeDeps: {
    exclude: ['@capacitor/core', '@capacitor/preferences'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
}));
