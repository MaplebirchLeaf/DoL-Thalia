import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  root: 'site',
  publicDir: 'public',
  plugins: [vue()],
  build: {
    outDir: '../dist/site',
    emptyOutDir: true
  }
});
