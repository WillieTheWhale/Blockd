/**
 * Vite Configuration for Renderer Process
 *
 * Builds the renderer process TypeScript code for the Electron app
 */

import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: './src/renderer',
  base: './',

  build: {
    outDir: '../../build/renderer',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/renderer/index.html')
      },
      output: {
        format: 'es'
      }
    },
    sourcemap: true,
    minify: 'esbuild',
    target: 'chrome120' // Match Electron's Chromium version
  },

  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },

  // Development server settings
  server: {
    port: 3000,
    strictPort: true
  },

  // Optimize dependencies
  optimizeDeps: {
    include: [
      '@mediapipe/face_mesh',
      '@mediapipe/camera_utils'
    ]
  }
});
