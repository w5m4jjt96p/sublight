import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static site. No server, no proxy, no runtime secrets.
// All external data is baked into /public/data by the CI, the client only reads it.
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    sourcemap: false,
  },
});
