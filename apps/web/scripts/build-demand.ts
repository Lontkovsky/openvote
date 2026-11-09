import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { publicInfoPages } from '../src/public-info-content.ts';
import { renderPublicInfoDocument, renderPublicInfoRoot } from '../src/public-info-document.ts';

const webRoot = resolve(import.meta.dirname, '..');
const configFile = resolve(webRoot, 'vite.config.ts');
const clientOutput = resolve(webRoot, 'dist-demand');
const serverOutput = resolve(webRoot, 'dist-demand-ssr');
const rootMarker = '<div id="root"></div>';
const publicInfoTemplate = 'public-info.html';

function replaceExact(source: string, marker: string, value: string): string {
  if (source.split(marker).length !== 2) throw new Error('DEMAND_TEMPLATE_MARKER_INVALID');
  return source.replace(marker, value);
}

try {
  await build({ root: webRoot, configFile, mode: 'demand' });
  await build({ root: webRoot, configFile, mode: 'demand-ssr' });
  const serverModule = await import(pathToFileURL(resolve(serverOutput, 'demand-ssr.js')).href);
  const markup = serverModule.renderDemandApp();
  if (typeof markup !== 'string' || markup.length === 0) throw new Error('DEMAND_STATIC_MARKUP_INVALID');
  const htmlPath = resolve(clientOutput, 'demand.html');
  const html = await readFile(htmlPath, 'utf8');
  await writeFile(htmlPath, replaceExact(html, rootMarker, `<div id="root">${markup}</div>`), 'utf8');

  const infoTemplatePath = resolve(clientOutput, publicInfoTemplate);
  const infoTemplate = await readFile(infoTemplatePath, 'utf8');
  for (const page of publicInfoPages) {
    const pageMarkup = serverModule.renderPublicInfoPage(page.slug);
    if (typeof pageMarkup !== 'string' || pageMarkup.length === 0) throw new Error('PUBLIC_INFO_STATIC_MARKUP_INVALID');
    let pageHtml = renderPublicInfoRoot(infoTemplate, pageMarkup);
    pageHtml = renderPublicInfoDocument(pageHtml, page);
    const pageDirectory = resolve(clientOutput, page.slug);
    await mkdir(pageDirectory, { recursive: false });
    await writeFile(resolve(pageDirectory, 'index.html'), pageHtml, 'utf8');
  }
  await rm(infoTemplatePath);
} finally {
  await rm(serverOutput, { recursive: true, force: true });
}
