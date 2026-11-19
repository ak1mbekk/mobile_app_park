import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import alignmentEditor from './scripts/alignment-editor.js';

const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
const appVersion = process.env.npm_package_version || pkg?.version || '';

export default defineConfig(({ mode }) => ({
  publicDir: 'public',
  plugins: [react(), alignmentEditor()],
  base: './',
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
  server: {
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
