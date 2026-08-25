import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Self-hosted fonts (no CDN — the showcase must work offline once built).
// Primary: Stack Sans Notch (big titles) + Roboto Mono (numbers / small text).
// IBM Plex stays imported as a per-glyph fallback for symbols the display faces
// may not cover (— · ↗ → ≈ °).
import '@fontsource/stack-sans-notch/400.css';
import '@fontsource/stack-sans-notch/500.css';
import '@fontsource/stack-sans-notch/600.css';
import '@fontsource/roboto-mono/latin-400.css';
import '@fontsource/roboto-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';

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
