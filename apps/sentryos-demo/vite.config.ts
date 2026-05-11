import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ command }) => ({
  base: process.env.SENTRYOS_DEMO_BASE ?? '/',
  optimizeDeps: {
    exclude: ['quickjs-emscripten']
  },
  // Reuse the default apps/manifests/assets from the standalone build project.
  publicDir: resolve(__dirname, '../sentryos/public'),
  resolve: {
    alias: command === 'serve'
      ? {
        // Dev mode uses live TS sources for instant feedback.
        'sentryos': resolve(__dirname, '../sentryos/src'),
        'sentryos-plugin-html-view': resolve(__dirname, '../../packages/plugin-html-view/src/index.ts'),
        'sentryos-plugin-code-editor': resolve(__dirname, '../../packages/plugin-code-editor/src/index.ts'),
        'sentryos-plugin-lua-runtime': resolve(__dirname, '../../packages/plugin-lua-runtime/src/index.ts'),
      }
      : undefined,
  },
}));
