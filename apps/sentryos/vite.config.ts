/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig(({ mode }) => ({
  optimizeDeps: {
    exclude: ['quickjs-emscripten']
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  ...(mode === 'lib' ? {
    build: {
      lib: {
        entry: resolve(__dirname, 'src/index.ts'),
        name: 'SentryOS',
        formats: ['es'],
        fileName: 'sentryos',
      },
      rollupOptions: {
        // quickjs-emscripten ships its own WASM; externalizing it lets the
        // host bundler handle deduplication and WASM loading correctly.
        external: ['quickjs-emscripten'],
        output: {
          assetFileNames: 'sentryos.[ext]',
        },
      },
    },
  } : {}),
}));
