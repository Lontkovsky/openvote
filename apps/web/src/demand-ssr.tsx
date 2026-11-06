import { renderToString } from 'react-dom/server';
import { DemandApp } from './DemandApp.tsx';

export function renderDemandApp(): string {
  return renderToString(<DemandApp />);
}
