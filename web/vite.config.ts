import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative base so the same bundle works both at a hosted root URL and from
  // file:// when packaged inside the iOS WKWebView.
  base: './',
  server: {
    port: 5173,
    host: '0.0.0.0',
    strictPort: false,
  },
  preview: {
    port: 4173,
    host: '0.0.0.0',
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          fiber: ['@react-three/fiber', '@react-three/drei', '@react-three/postprocessing'],
        },
      },
    },
  },
  // Allow importing GLSL files as raw strings
  assetsInclude: ['**/*.glsl', '**/*.vert', '**/*.frag'],
});
