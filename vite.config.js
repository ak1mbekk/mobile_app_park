import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import alignmentEditor from './scripts/alignment-editor.js';
import familyAccounts from './scripts/family-accounts.js';
import godotDelivery from './scripts/godot-delivery.js';

const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
const appVersion = process.env.npm_package_version || pkg?.version || '';

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
