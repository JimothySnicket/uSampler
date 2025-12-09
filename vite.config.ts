import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  base: './', // Use relative paths for Chrome extension
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Disable code splitting to avoid blob URLs in Chrome extensions
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        // Inline all chunks to avoid blob URLs
        inlineDynamicImports: false,
        manualChunks: undefined
      }
    },
    // Increase chunk size limit to reduce splitting
    chunkSizeWarningLimit: 1000
  }
});
