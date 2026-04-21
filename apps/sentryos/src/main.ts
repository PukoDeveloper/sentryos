import './style.css';
import { createSentryOS } from './bootstrap/systemBootstrap';
import { bios } from './ui/Bios';
import htmlViewPlugin from 'sentryos-plugin-html-view';

const container = document.getElementById('app');
if (!container) {
  throw new Error('[BOOT] [CRITICAL] #app element not found — cannot mount SentryOS');
}

createSentryOS({ container, onRestart: () => location.reload(), pluginInstances: [htmlViewPlugin] }).catch((error) => {
  console.error('[BOOT] [CRITICAL] Fatal boot error', error);
  const details = error instanceof Error
    ? [`${error.message}`, ...(error.stack?.split('\n').slice(1, 6).map((l: string) => `  ${l.trim()}`) ?? [])]
    : [String(error)];
  bios.showErrorScreen('系統啟動時發生未預期的嚴重錯誤', details, [
    { label: '重新啟動系統', handler: () => location.reload() },
  ]);
});
