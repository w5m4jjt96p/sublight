import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Self-hosted fonts (no CDN: the site must work offline once built).
// Stack Sans Notch for titles and craft names, Geist for everything else people
// read, Geist Mono for measured values.
import '@fontsource/stack-sans-notch/400.css';
import '@fontsource/stack-sans-notch/500.css';
import '@fontsource/stack-sans-notch/600.css';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';

import './styles/tokens.css';
import './styles/app.css';
import { App } from './App.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
