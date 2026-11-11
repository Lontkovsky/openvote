import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableDemandAnalytics, trackDemandAnalytics } from '../apps/web/src/demand-analytics.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('demand analytics bootstrap', () => {
  it('pushes the canonical GTM event before loading the owner container', () => {
    const entries: unknown[] = [];
    const order: string[] = [];
    const script = { dataset: {} } as HTMLScriptElement;
    const dataLayer = {
      push(...items: unknown[]) {
        order.push('dataLayer');
        entries.push(...items);
        return entries.length;
      },
    } as unknown as unknown[];
    const demandWindow = { dataLayer } as Window & typeof globalThis;
    const demandDocument = {
      createElement(tagName: string) {
        expect(tagName).toBe('script');
        return script;
      },
      head: {
        append(node: Node) {
          expect(node).toBe(script);
          order.push('script');
        },
      },
    } as unknown as Document;
    vi.stubGlobal('window', demandWindow);
    vi.stubGlobal('document', demandDocument);

    enableDemandAnalytics('GTM-K2V4DRSD');

    expect(order).toEqual(['dataLayer', 'script']);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ 'gtm.start': expect.any(Number), event: 'gtm.js' });
    expect(script.async).toBe(true);
    expect(script.dataset.openvoteAnalytics).toBe('google-tag-manager');
    expect(script.src).toBe('https://www.googletagmanager.com/gtm.js?id=GTM-K2V4DRSD');

    trackDemandAnalytics({ name: 'support_launch_click', location: 'header' });
    trackDemandAnalytics({ name: 'section_view', section: 'faq' });
    trackDemandAnalytics({ name: 'faq_open', item: 1 });
    trackDemandAnalytics({ name: 'video_start' });
    trackDemandAnalytics({ name: 'video_complete' });
    trackDemandAnalytics({ name: 'taras_open' });
    for (const command of entries.slice(1)) {
      expect(Object.prototype.toString.call(command)).toBe('[object Arguments]');
    }
    expect(entries[1]).toMatchObject({ 0: 'event', 1: 'support_launch_click', 2: { location: 'header' } });
    expect(entries[2]).toMatchObject({ 0: 'event', 1: 'section_view', 2: { section: 'faq' } });
    expect(entries[3]).toMatchObject({ 0: 'event', 1: 'faq_open', 2: { item: 1 } });
    expect(entries[4]).toMatchObject({ 0: 'event', 1: 'video_start' });
    expect(entries[5]).toMatchObject({ 0: 'event', 1: 'video_complete' });
    expect(entries[6]).toMatchObject({ 0: 'event', 1: 'taras_open' });
  });
});
