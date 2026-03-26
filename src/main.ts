import './style.css';
import { bootstrapSystem } from './bootstrap/systemBootstrap';
import { bios } from './bootstrap/bios';

document.addEventListener('contextmenu', (e) => e.preventDefault());

bootstrapSystem().catch((error) => {
  console.error('[BOOT] [CRITICAL] Fatal boot error', error);
  const details = error instanceof Error
    ? [`${error.message}`, ...(error.stack?.split('\n').slice(1, 6).map(l => `  ${l.trim()}`) ?? [])]
    : [String(error)];
  bios.showErrorScreen('系統啟動時發生未預期的嚴重錯誤', details, [
    { label: '重新啟動系統', handler: () => location.reload() },
  ]);
});
