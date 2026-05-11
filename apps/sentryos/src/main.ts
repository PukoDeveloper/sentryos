// Pure-core entry point — no plugins loaded.
// To run SentryOS with plugins, see apps/sentryos-demo.
import './style.css';
import { createSentryOS, DEFAULT_REGISTRY_FILE_TYPE_MAP, DEFAULT_REGISTRY_ROLE_MAP } from './bootstrap/systemBootstrap';
import { bios } from './ui/Bios';
import { USER_DEFAULT_PERMISSIONS } from './kernel/constants';

const container = document.getElementById('app');
if (!container) {
  throw new Error('[BOOT] [CRITICAL] #app element not found — cannot mount SentryOS');
}

createSentryOS({
  container,
  onRestart: () => location.reload(),
  pluginInstances: [],
  system: {
    userDefaultPermissions: USER_DEFAULT_PERMISSIONS,
    appCatalogUrl: '/app.json',
    pluginListUrl: '/plugins.json',
    authConfigUrl: '/auth.config.json',
    enableBuiltinKernelConsole: true,
    defaultRegistryRoles: DEFAULT_REGISTRY_ROLE_MAP,
    defaultRegistryFileTypes: DEFAULT_REGISTRY_FILE_TYPE_MAP,
  },
}).catch((error) => {
  console.error('[BOOT] [CRITICAL] Fatal boot error', error);
  const details = error instanceof Error
    ? [`${error.message}`, ...(error.stack?.split('\n').slice(1, 6).map((l: string) => `  ${l.trim()}`) ?? [])]
    : [String(error)];
  bios.showErrorScreen('系統啟動時發生未預期的嚴重錯誤', details, [
    { label: '重新啟動系統', handler: () => location.reload() },
  ]);
});
