import { demandFaqItems } from '../../../packages/domain/src/demand.ts';
import type { PublicInfoPage } from './public-info-content.ts';

function replaceExact(source: string, marker: string, value: string): string {
  if (source.split(marker).length !== 2) throw new Error('PUBLIC_INFO_TEMPLATE_MARKER_INVALID');
  return source.replace(marker, value);
}

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function structuredData(page: PublicInfoPage, canonical: string): string {
  const graph: object[] = [
    {
      '@type': 'Organization',
      '@id': 'https://openvote.com.ua/#organization',
      name: 'OpenVote',
      alternateName: 'OpenVote Україна',
      url: 'https://openvote.com.ua/',
      logo: 'https://openvote.com.ua/openvote-icon.svg',
      description: 'Відкритий і безкоштовний майданчик громадських голосувань для громадян України.',
      sameAs: ['https://github.com/Lontkovsky/openvote'],
    },
    {
      '@type': 'WebSite',
      '@id': 'https://openvote.com.ua/#website',
      url: 'https://openvote.com.ua/',
      name: 'OpenVote',
      alternateName: 'OpenVote Україна',
      description: 'Відкритий і безкоштовний майданчик громадських голосувань для громадян України.',
      inLanguage: 'uk-UA',
      publisher: { '@id': 'https://openvote.com.ua/#organization' },
    },
    {
      '@type': 'WebPage',
      '@id': `${canonical}#webpage`,
      url: canonical,
      name: page.title,
      description: page.description,
      inLanguage: 'uk-UA',
      isPartOf: { '@id': 'https://openvote.com.ua/#website' },
      about: { '@id': 'https://openvote.com.ua/#organization' },
      primaryImageOfPage: 'https://openvote.com.ua/openvote-social.png',
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${canonical}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Головна', item: 'https://openvote.com.ua/' },
        { '@type': 'ListItem', position: 2, name: page.heading, item: canonical },
      ],
    },
  ];
  if (page.slug === 'faq') {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${canonical}#faq`,
      mainEntity: demandFaqItems.map(item => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    });
  }
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replaceAll('<', '\\u003c');
}

export function renderPublicInfoDocument(html: string, page: PublicInfoPage): string {
  const title = escapeAttribute(page.title);
  const description = escapeAttribute(page.description);
  const canonical = `https://openvote.com.ua/${page.slug}/`;
  let output = replaceExact(html, '<title>__OPENVOTE_TITLE__</title>', `<title>${title}</title>`);
  output = output.replaceAll('__OPENVOTE_TITLE__', title);
  output = output.replaceAll('__OPENVOTE_DESCRIPTION__', description);
  output = output.replaceAll('__OPENVOTE_CANONICAL__', canonical);
  return replaceExact(output, '__OPENVOTE_STRUCTURED_DATA__', structuredData(page, canonical));
}

export function renderPublicInfoRoot(html: string, markup: string): string {
  return replaceExact(html, '<div id="root"></div>', `<div id="root">${markup}</div>`);
}
