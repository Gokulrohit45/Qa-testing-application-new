import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';

export default defineConfig({
  plugins: [react()],
  cacheDir: 'node_modules/.vite-test',
  optimizeDeps: {entries: ['tests/runner.html']},
  envDir: fileURLToPath(new URL('../.vite-env', import.meta.url)),
  resolve: {alias: [{find: /.*\/services\/api$/, replacement: fileURLToPath(new URL('./mock-api.js', import.meta.url))}]},
  server: {host: '127.0.0.1', port: 5199, strictPort: true},
});
