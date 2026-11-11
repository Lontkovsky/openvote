import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { publicInfoPage, publicInfoPageSlugs, publicInfoSlugFromPath } from './src/public-info-content.ts';
import { renderPublicInfoDocument, renderPublicInfoRoot } from './src/public-info-document.ts';

const names = ['VITE_IDENTITY_ORIGIN', 'VITE_BALLOT_ORIGIN', 'VITE_MANAGEMENT_ORIGIN'] as const;

function demandIndex(): Plugin {
  return {
    name: 'openvote-demand-index',
    async transformIndexHtml(html, context) {
      if (context.server === undefined || context.originalUrl === undefined) return;
      const pathname = new URL(context.originalUrl, 'http://localhost').pathname;
      if (!publicInfoPageSlugs.some(slug => pathname === `/${slug}/`)) return;
      const slug = publicInfoSlugFromPath(pathname);
      const serverModule = await context.server.ssrLoadModule('/src/demand-ssr.tsx');
      const markup = serverModule.renderPublicInfoPage(slug);
      if (typeof markup !== 'string' || markup.length === 0) throw new Error('PUBLIC_INFO_STATIC_MARKUP_INVALID');
      const withMarkup = renderPublicInfoRoot(html, markup);
      return renderPublicInfoDocument(withMarkup, publicInfoPage(slug));
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url === undefined) throw new Error('DEMAND_REQUEST_URL_MISSING');
        const url = new URL(request.url, 'http://localhost');
        if (url.pathname === '/') request.url = `/demand.html${url.search}`;
        if (url.pathname === '/demo' || url.pathname.startsWith('/demo/')) request.url = `/demo.html${url.search}`;
        for (const slug of publicInfoPageSlugs) {
          if (url.pathname === `/${slug}`) {
            response.statusCode = 308;
            response.setHeader('Location', `/${slug}/${url.search}`);
            response.end();
            return;
          }
          if (url.pathname === `/${slug}/`) request.url = `/public-info.html${url.search}`;
        }
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
    publicDir: mode === 'demand' ? resolve(import.meta.dirname, 'demand-public') : mode === 'demand-ssr' ? false : resolve(import.meta.dirname, 'public'),
    build: mode === 'demand'
      ? { sourcemap: false, target: 'es2023', outDir: 'dist-demand',
          assetsInlineLimit: filePath => filePath.endsWith('manrope-cyrillic-wght-normal.woff2') ? true : undefined,
          rollupOptions: { input: { demand: resolve(import.meta.dirname, 'demand.html'), demo: resolve(import.meta.dirname, 'demo.html'), info: resolve(import.meta.dirname, 'public-info.html') } } }
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
      proxy: { '/api': { target: 'http://127.0.0.1:4304' } },
    },
  };
});
