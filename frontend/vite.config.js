import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],

    server: {
      port: 3000,
      strictPort: true,
      host: true,
      proxy: {
        '/api': {
          target: 'http://backend:8000',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path
        },
        '/create_game': {  // Добавляем явное правило
          target: 'http://backend:8000',
          changeOrigin: true,
          secure: false
        },
        '/join_game': {  // Добавляем явное правило
          target: 'http://backend:8000',
          changeOrigin: true,
          secure: false
        }
      }
    },

    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html')
        }
      }
    },

    resolve: {
      alias: {
        '@': resolve(__dirname, './src')
      }
    }
  };
});