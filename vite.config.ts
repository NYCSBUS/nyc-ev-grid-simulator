import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' makes the build work from any GitHub Pages path (user.github.io/repo/)
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          mapbox: ['mapbox-gl'],
          echarts: ['echarts'],
          turf: ['@turf/turf'],
        },
      },
    },
  },
});
