// Demo entry point — runs SentryOS with all built-in plugins.
// sentryos is aliased in vite.config.ts to the live TypeScript source,
// so no build step is required during development.
import 'sentryos/style.css';
import {
  createSentryOS,
  DEFAULT_REGISTRY_FILE_TYPE_MAP,
  DEFAULT_REGISTRY_ROLE_MAP,
  USER_DEFAULT_PERMISSIONS,
} from 'sentryos';
import htmlViewPlugin from 'sentryos-plugin-html-view';
import codeEditorPlugin from 'sentryos-plugin-code-editor';
import luaRuntimePlugin from 'sentryos-plugin-lua-runtime';

const container = document.getElementById('app');
if (!container) {
  throw new Error('[BOOT] [CRITICAL] #app element not found — cannot mount SentryOS');
}

const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
const buildUrl = (path: string) => new URL(path, baseUrl).toString();

createSentryOS({
  container,
  onRestart: () => location.reload(),
  pluginInstances: [htmlViewPlugin, codeEditorPlugin, luaRuntimePlugin],
  system: {
    userDefaultPermissions: USER_DEFAULT_PERMISSIONS,
    appCatalogEntries: [
      buildUrl('apps/stdlib'),
      buildUrl('apps/system'),
      buildUrl('apps/utilities'),
      buildUrl('apps/text-manager'),
      buildUrl('apps/image-viewer'),
      buildUrl('apps/developer-tools'),
      buildUrl('apps/pcode'),
    ],
    pluginPaths: [],
    authConfigUrl: buildUrl('auth.config.json'),
    enableBuiltinKernelConsole: true,
    defaultRegistryRoles: DEFAULT_REGISTRY_ROLE_MAP,
    defaultRegistryFileTypes: DEFAULT_REGISTRY_FILE_TYPE_MAP,
  },
}).catch((error) => {
  console.error('[BOOT] [CRITICAL] Fatal boot error', error);
});
