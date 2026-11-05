import { readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const webRoot = resolve(import.meta.dirname, '..');
const configFile = resolve(webRoot, 'vite.config.ts');
const clientOutput = resolve(webRoot, 'dist-demand');
const serverOutput = resolve(webRoot, 'dist-demand-ssr');
const rootMarker = '<div id="root"></div>';

try {
  await build({ root: webRoot, configFile, mode: 'demand' });
  await build({ root: webRoot, configFile, mode: 'demand-ssr' });
  const serverModule = await import(pathToFileURL(resolve(serverOutput, 'demand-ssr.js')).href);
  const markup = serverModule.renderDemandApp();
  if (typeof markup !== 'string' || markup.length === 0) throw new Error('DEMAND_STATIC_MARKUP_INVALID');
  const htmlPath = resolve(clientOutput, 'demand.html');
  const html = await readFile(htmlPath, 'utf8');
  if (html.split(rootMarker).length !== 2) throw new Error('DEMAND_ROOT_MARKER_INVALID');
  await writeFile(htmlPath, html.replace(rootMarker, `<div id="root">${markup}</div>`), 'utf8');
} finally {
  await rm(serverOutput, { recursive: true, force: true });
}
