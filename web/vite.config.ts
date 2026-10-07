import { existsSync, readFileSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// End-to-end tests point this at generated fixtures (see e2e/global-setup.ts).
const DATA_DIR = process.env.QA_RADAR_DATA_DIR ?? resolve(__dirname, '../data');

/**
 * In dev/preview, serve the collector's local output (../data/*.json) at /data/.
 * In production the deploy workflow copies the data files into dist/data/.
 */
function localData(): Plugin {
  const handler = (url: string | undefined, res: ServerResponse, next: () => void) => {
    const match = /^\/data\/([\w.-]+\.json)(?:\?.*)?$/.exec(url ?? '');
    const file = match?.[1] ? resolve(DATA_DIR, match[1]) : undefined;
    if (!file || !existsSync(file)) return next();
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(readFileSync(file));
  };
  return {
    name: 'qa-radar-local-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => handler(req.url, res, next));
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => handler(req.url, res, next));
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), localData()],
  server: { port: 5173 },
  preview: { port: 4173 },
});
