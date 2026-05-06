import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  optimizeDeps: {
    exclude: ['quickjs-emscripten']
  },
  resolve: {
    alias: {
      // Resolve sentryos and plugins to their live TypeScript source so changes
      // are reflected immediately without a build step.
      'sentryos': resolve(__dirname, '../sentryos/src'),
      'sentryos-plugin-html-view': resolve(__dirname, '../../packages/plugin-html-view/src/index.ts'),
      'sentryos-plugin-code-editor': resolve(__dirname, '../../packages/plugin-code-editor/src/index.ts'),
      'sentryos-plugin-lua-runtime': resolve(__dirname, '../../packages/plugin-lua-runtime/src/index.ts'),
    },
  },
});
