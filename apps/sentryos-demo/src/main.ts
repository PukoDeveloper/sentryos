// Demo entry point — runs SentryOS with all built-in plugins.
// sentryos is aliased in vite.config.ts to the live TypeScript source,
// so no build step is required during development.
import 'sentryos/style.css';
import { createSentryOS, DEFAULT_REGISTRY_FILE_TYPE_MAP, DEFAULT_REGISTRY_ROLE_MAP } from 'sentryos';
import htmlViewPlugin from 'sentryos-plugin-html-view';
import codeEditorPlugin from 'sentryos-plugin-code-editor';
import luaRuntimePlugin from 'sentryos-plugin-lua-runtime';

const container = document.getElementById('app');
if (!container) {
  throw new Error('[BOOT] [CRITICAL] #app element not found — cannot mount SentryOS');
}

createSentryOS({
  container,
  onRestart: () => location.reload(),
  pluginInstances: [htmlViewPlugin, codeEditorPlugin, luaRuntimePlugin],
  system: {
    appCatalogUrl: '/app.json',
    pluginListUrl: '/plugins.json',
    authConfigUrl: '/auth.config.json',
    enableBuiltinKernelConsole: true,
    defaultRegistryRoles: DEFAULT_REGISTRY_ROLE_MAP,
    defaultRegistryFileTypes: DEFAULT_REGISTRY_FILE_TYPE_MAP,
  },
}).catch((error) => {
  console.error('[BOOT] [CRITICAL] Fatal boot error', error);
});
