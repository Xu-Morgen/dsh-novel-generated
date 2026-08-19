import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** I1b locks the minimal browser UI to React + Vite. */
export default defineConfig({
  root: 'src/ui',
  plugins: [react()],
  build: {
    outDir: '../../dist/ui',
    emptyOutDir: true,
  },
});
