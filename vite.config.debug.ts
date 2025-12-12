import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { appendFileSync } from 'fs';

const LOG_PATH = '.cursor/debug.log';
const SERVER_ENDPOINT = 'http://127.0.0.1:7242/ingest/b773e295-2062-4db8-a92f-2b7878abf6fc';

function log(message: string, data: any = {}) {
  const entry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    location: 'vite.config.debug.ts',
    message,
    data,
    sessionId: 'debug-session',
    runId: 'build-debug',
    hypothesisId: 'BUILD_HANG'
  };
  
  try {
    appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
  } catch (e) {
    // Ignore file write errors
  }
  
  fetch(SERVER_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry)
  }).catch(() => {});
  
  console.log(`[VITE-DEBUG] ${message}`, data);
}

// #region agent log
log('Vite config loading started', { timestamp: Date.now() });
// #endregion

// Create a plugin to log build progress
const buildLoggerPlugin = (): Plugin => {
  return {
    name: 'build-logger',
    // #region agent log
    buildStart() {
      log('Vite buildStart hook called', { timestamp: Date.now() });
    },
    // #endregion
    
    // #region agent log
    resolveId(id) {
      if (id.includes('node_modules') && id.includes('@tensorflow')) {
        log('WARNING: TensorFlow module resolution attempt', { id, timestamp: Date.now() });
      }
      return null;
    },
    // #endregion
    
    // #region agent log
    load(id) {
      if (id.includes('@tensorflow')) {
        log('WARNING: TensorFlow module load attempt', { id, timestamp: Date.now() });
      }
      return null;
    },
    // #endregion
    
    // #region agent log
    transform(code, id) {
      if (id.includes('App.tsx')) {
        log('Transforming App.tsx', { id, codeLength: code.length, timestamp: Date.now() });
      }
      return null;
    },
    // #endregion
    
    // #region agent log
    buildEnd(err) {
      if (err) {
        log('Vite buildEnd with error', { error: err.message, stack: err.stack, timestamp: Date.now() });
      } else {
        log('Vite buildEnd successfully', { timestamp: Date.now() });
      }
    },
    // #endregion
    
    // #region agent log
    generateBundle() {
      log('Vite generateBundle hook called', { timestamp: Date.now() });
    },
    // #endregion
    
    // #region agent log
    writeBundle() {
      log('Vite writeBundle hook called', { timestamp: Date.now() });
    }
    // #endregion
  };
};

export default defineConfig({
  plugins: [
    react(),
    buildLoggerPlugin()
  ],
  base: './',
  worker: {
    format: 'es',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        inlineDynamicImports: false,
        manualChunks: undefined
      }
    },
    chunkSizeWarningLimit: 1000
  }
});

// #region agent log
log('Vite config loaded', { timestamp: Date.now() });
// #endregion

