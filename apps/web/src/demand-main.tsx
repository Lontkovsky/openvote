import '@fontsource-variable/manrope/wght.css';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { DemandApp } from './DemandApp.tsx';
import './styles.css';
import './demand.css';
import './vote-success.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
if (root.hasChildNodes()) hydrateRoot(root, <DemandApp />);
else createRoot(root).render(<DemandApp />);
