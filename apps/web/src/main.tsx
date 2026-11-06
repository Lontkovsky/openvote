import '@fontsource-variable/manrope/wght.css';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';
import './vote-success.css';
const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(<App />);
