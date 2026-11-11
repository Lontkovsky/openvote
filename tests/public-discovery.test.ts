import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { demandFaqItems } from '../packages/domain/src/demand.ts';
import { publicInfoPages, publicInfoSlugFromPath } from '../apps/web/src/public-info-content.ts';

const demandOutput = resolve('apps/web/dist-demand');
const canonicalUrls = [
  'https://openvote.com.ua/',
  ...publicInfoPages.map(page => `https://openvote.com.ua/${page.slug}/`),
];

function occurrences(source: string, marker: string): number {
  return source.split(marker).length - 1;
}

function structuredData(html: string): { '@graph': Array<Record<string, unknown>> } {
  const match = /<script type="application\/ld\+json">([^<]+)<\/script>/u.exec(html);
  if (match?.[1] === undefined) throw new Error('STRUCTURED_DATA_MISSING');
  return JSON.parse(match[1]);
}

describe('public search and answer-engine discovery', () => {
  it('declares five unique public information routes without an unknown-route fallback', () => {
    expect(publicInfoPages.map(page => page.slug)).toEqual(['about', 'how-it-works', 'methodology', 'privacy', 'faq']);
    expect(new Set(publicInfoPages.map(page => page.title)).size).toBe(publicInfoPages.length);
    expect(new Set(publicInfoPages.map(page => page.description)).size).toBe(publicInfoPages.length);
    for (const page of publicInfoPages) {
      expect(publicInfoSlugFromPath(`/${page.slug}/`)).toBe(page.slug);
      expect(publicInfoSlugFromPath(`/${page.slug}`)).toBe(page.slug);
    }
    expect(() => publicInfoSlugFromPath('/demo/')).toThrow('PUBLIC_INFO_ROUTE_UNKNOWN');
    expect(() => publicInfoSlugFromPath('/unknown/')).toThrow('PUBLIC_INFO_ROUTE_UNKNOWN');
  });

  it('pre-renders distinct metadata, content and structured data for every public information page', async () => {
    for (const page of publicInfoPages) {
      const html = await readFile(resolve(demandOutput, page.slug, 'index.html'), 'utf8');
      const canonical = `https://openvote.com.ua/${page.slug}/`;
      expect(html).toContain('<html lang="uk">');
      expect(html).toContain('<meta name="robots" content="index,follow,max-image-preview:large" />');
      expect(html).toContain(`<meta name="description" content="${page.description}" />`);
      expect(html).toContain(`<link rel="canonical" href="${canonical}" />`);
      expect(html).toContain(`<meta property="og:title" content="${page.title}" />`);
      expect(html).toContain(`<meta property="og:url" content="${canonical}" />`);
      expect(html).toContain(`<meta name="twitter:title" content="${page.title}" />`);
      expect(html).toContain(`<title>${page.title}</title>`);
      expect(occurrences(html, '<h1>')).toBe(1);
      expect(html).toContain(`<h1>${page.heading}</h1>`);
      expect(html).not.toContain('__OPENVOTE_');
      expect(html).not.toContain('googletagmanager.com');
      for (const linkedPage of publicInfoPages) expect(html).toContain(`href="/${linkedPage.slug}/"`);

      const data = structuredData(html);
      const types = data['@graph'].map(item => item['@type']);
      expect(types).toContain('Organization');
      expect(types).toContain('WebSite');
      expect(types).toContain('WebPage');
      expect(types).toContain('BreadcrumbList');
      const webPage = data['@graph'].find(item => item['@type'] === 'WebPage');
      expect(webPage).toMatchObject({ url: canonical, name: page.title, description: page.description, inLanguage: 'uk-UA' });
    }
  });

  it('publishes the complete FAQ in HTML and FAQPage structured data', async () => {
    const html = await readFile(resolve(demandOutput, 'faq', 'index.html'), 'utf8');
    expect(occurrences(html, '<details>')).toBe(demandFaqItems.length);
    for (const item of demandFaqItems) {
      expect(html).toContain(`<summary>${item.question}</summary>`);
      expect(html).toContain(`<p>${item.answer}</p>`);
    }
    const data = structuredData(html);
    const faq = data['@graph'].find(item => item['@type'] === 'FAQPage');
    expect(faq).toMatchObject({
      mainEntity: demandFaqItems.map(item => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    });
  });

  it('publishes the exact crawlable URL set and a factual llms.txt', async () => {
    const sitemap = await readFile(resolve(demandOutput, 'sitemap.xml'), 'utf8');
    const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map(match => match[1]);
    expect(sitemapUrls).toEqual(canonicalUrls);
    expect(sitemap).not.toContain('/demo/');

    const robots = await readFile(resolve(demandOutput, 'robots.txt'), 'utf8');
    expect(robots).toContain('User-agent: Googlebot\nAllow: /');
    expect(robots).toContain('User-agent: OAI-SearchBot\nAllow: /');
    expect(robots).toContain('Sitemap: https://openvote.com.ua/sitemap.xml');

    const llms = await readFile(resolve(demandOutput, 'llms.txt'), 'utf8');
    expect(llms).toContain('# OpenVote');
    const markdownLinks = [...llms.matchAll(/\[[^\]]+\]\((https:\/\/[^)]+)\)/gu)].map(match => match[1]);
    for (const url of canonicalUrls) expect(markdownLinks).toContain(url);
    expect(markdownLinks).toContain('https://openvote.com.ua/demo/');
    expect(markdownLinks).toContain('https://github.com/Lontkovsky/openvote');
    expect(llms).toContain('Real identity-verified civic voting is not live yet.');
    expect(llms).toContain('Do not confuse this Ukrainian project with unrelated products that use the same name.');
    expect(llms).not.toMatch(/__OPENVOTE_|synthetic|синтетич/iu);
  });

  it('keeps the root indexable and the browser-only demo excluded from search', async () => {
    const root = await readFile(resolve(demandOutput, 'demand.html'), 'utf8');
    expect(root).toContain('<link rel="canonical" href="https://openvote.com.ua/" />');
    expect(root).toContain('"@type":"WebPage"');
    expect(root).toContain('"alternateName":"OpenVote Україна"');
    expect(occurrences(root, '<h1>')).toBe(1);
    for (const page of publicInfoPages) expect(root).toContain(`href="/${page.slug}/"`);

    const demo = await readFile(resolve(demandOutput, 'demo.html'), 'utf8');
    expect(demo).toContain('<meta name="robots" content="noindex,nofollow" />');
    expect(demo).not.toContain('googletagmanager.com');
    expect(demo).not.toContain('google-analytics.com');
  });
});
