export type DemandAnalyticsSection = 'problem' | 'how-it-works' | 'privacy' | 'open-source' | 'goal' | 'demo' | 'faq' | 'taras';
export type DemandAnalyticsEvent =
  | { name: 'support_launch_click'; location: 'header' | 'final' }
  | { name: 'section_view'; section: DemandAnalyticsSection }
  | { name: 'video_start' | 'video_complete' }
  | { name: 'faq_open'; item: number }
  | { name: 'taras_open' };

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...arguments_: unknown[]) => void;
  }
}

let analyticsEnabled = false;

export function enableDemandAnalytics(containerId: string): void {
  window.dataLayer ??= [];
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  window.gtag = (...arguments_: unknown[]) => { window.dataLayer.push(arguments_); };
  const source = new URL('https://www.googletagmanager.com/gtm.js');
  source.searchParams.set('id', containerId);
  const script = document.createElement('script');
  script.async = true;
  script.dataset.openvoteAnalytics = 'google-tag-manager';
  script.src = source.href;
  document.head.append(script);
  analyticsEnabled = true;
}

export function trackDemandAnalytics(event: DemandAnalyticsEvent): void {
  if (!analyticsEnabled) return;
  if (event.name === 'support_launch_click') {
    window.gtag('event', event.name, { location: event.location });
    return;
  }
  if (event.name === 'section_view') {
    window.gtag('event', event.name, { section: event.section });
    return;
  }
  if (event.name === 'faq_open') {
    window.gtag('event', event.name, { item: event.item });
    return;
  }
  window.gtag('event', event.name);
}
