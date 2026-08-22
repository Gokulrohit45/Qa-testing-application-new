import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(() => ({
    plugins: [react()],
    base: './',
    // Prevent Vite from automatically reading repository .env files. Release
    // values are supplied by the CI process environment instead.
    envDir: path.resolve(__dirname, '.vite-env'),
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.VITE_SUPABASE_URL || ''),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY || ''),
      'import.meta.env.VITE_CLOUD_API_URL': JSON.stringify(process.env.VITE_CLOUD_API_URL || '')
    },
    server: {
      port: 5173,
      strictPort: true
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    }
}));
