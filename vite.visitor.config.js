import { fileURLToPath } from 'node:url';

export default {
  root: fileURLToPath(new URL('./', import.meta.url)),
  publicDir: 'public',
  server: {
    host: '127.0.0.1',
    port: 8171,
    strictPort: true,
    watch: null,
  },
  optimizeDeps: {noDiscovery: true},
};
