import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root: here,
  base: '/admin/',
  plugins: [react()],
  resolve: { alias: { '@shared': path.resolve(here, '../shared') } },
  build: { outDir: path.resolve(here, 'dist'), emptyOutDir: true, sourcemap: false, target: 'es2020' },
  server: { proxy: { '/api': 'http://localhost:8080', '/static': 'http://localhost:8080', '/vendor': 'http://localhost:8080' } },
});
