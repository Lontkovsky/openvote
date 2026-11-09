import { renderToString } from 'react-dom/server';
import { DemandApp } from './DemandApp.tsx';
import { PublicInfoApp } from './PublicInfoApp.tsx';
import type { PublicInfoPage } from './public-info-content.ts';

export function renderDemandApp(): string {
  return renderToString(<DemandApp />);
}

export function renderPublicInfoPage(slug: PublicInfoPage['slug']): string {
  return renderToString(<PublicInfoApp slug={slug} />);
}
