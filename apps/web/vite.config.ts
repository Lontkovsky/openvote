import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const names = ['VITE_IDENTITY_ORIGIN', 'VITE_BALLOT_ORIGIN', 'VITE_MANAGEMENT_ORIGIN'] as const;

function demandIndex(): Plugin {
  return {
    name: 'openvote-demand-index',
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        if (request.url === '/') request.url = '/demand.html';
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const demandMode = mode === 'demand' || mode === 'demand-ssr';
  if (!demandMode) {
    const env = loadEnv(mode, process.cwd(), 'VITE_');
    for (const name of names) {
      const value = env[name];
      if (value === undefined) throw new Error(`${name} is required`);
      const parsed = new URL(value);
      if (parsed.origin !== value || !['http:', 'https:'].includes(parsed.protocol)) throw new Error(`${name} must be an exact HTTP origin`);
      if (mode === 'production' && parsed.protocol !== 'https:') throw new Error(`${name} must use HTTPS in production`);
    }
  }
  return {
    plugins: [react(), ...(mode === 'demand' ? [demandIndex()] : [])],
    publicDir: mode === 'demand' ? resolve(import.meta.dirname, 'demand-public') : false,
    build: mode === 'demand'
      ? { sourcemap: false, target: 'es2023', outDir: 'dist-demand', rollupOptions: { input: resolve(import.meta.dirname, 'demand.html') } }
      : mode === 'demand-ssr'
        ? {
            sourcemap: false,
            target: 'es2023',
            outDir: 'dist-demand-ssr',
            ssr: resolve(import.meta.dirname, 'src/demand-ssr.tsx'),
            rollupOptions: { output: { entryFileNames: 'demand-ssr.js' } },
          }
        : { sourcemap: false, target: 'es2023' },
    server: {
      headers: { 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' },
      ...(mode === 'demand' ? { proxy: { '/api': { target: 'http://127.0.0.1:4304' } } } : {}),
    },
  };
});
