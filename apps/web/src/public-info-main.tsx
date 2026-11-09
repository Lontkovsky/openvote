import '@fontsource-variable/manrope/wght.css';
import { hydrateRoot } from 'react-dom/client';
import { PublicInfoApp } from './PublicInfoApp.tsx';
import { publicInfoSlugFromPath } from './public-info-content.ts';
import './styles.css';
import './demand.css';

const root = document.getElementById('root');
if (root === null) throw new Error('PUBLIC_INFO_ROOT_MISSING');
hydrateRoot(root, <PublicInfoApp slug={publicInfoSlugFromPath(window.location.pathname)} />);
