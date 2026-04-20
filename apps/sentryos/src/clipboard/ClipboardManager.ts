// ── ClipboardManager ──────────────────────────────────────────
// 管理系統全域剪貼簿。
// - 維護同步可讀的記憶體緩衝區（供 QuickJS 沙箱同步呼叫）
// - 寫入時非同步橋接到瀏覽器原生剪貼簿
// - 監聽 document.paste 事件，捕捉外部貼上操作同步更新緩衝區
// - 剪貼簿內容變更時透過 EventBus 廣播 clipboard.changed 事件

import type { Kernel } from '../kernel/Kernel';
import { Events } from '../kernel/constants';

export interface ClipboardEntry {
  text: string;
  timestamp: number;
  sourceAppId?: string;
}

class ClipboardManager {
  private buffer: ClipboardEntry = { text: '', timestamp: 0 };
  private pasteHandler: ((e: ClipboardEvent) => void) | null = null;
  private readonly kernel: Kernel;

  constructor(kernel: Kernel) {
    this.kernel = kernel;
  }

  private get eventBus() { return this.kernel.resolve('eventBus'); }
  private get systemAppId() { return this.kernel.get('systemAppId'); }

  /** 啟動 document paste 監聽器，捕捉外部剪貼簿內容 */
  init(): void {
    this.pasteHandler = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (text) {
        this.buffer = { text, timestamp: Date.now() };
        this.emitChanged();
      }
    };
    document.addEventListener('paste', this.pasteHandler);
  }

  destroy(): void {
    if (this.pasteHandler) {
      document.removeEventListener('paste', this.pasteHandler);
      this.pasteHandler = null;
    }
  }

  /**
   * 寫入剪貼簿。同步更新記憶體緩衝區並廣播 clipboard.changed 事件。
   * 以 fire-and-forget 方式非同步寫入瀏覽器原生剪貼簿。
   */
  write(text: string, sourceAppId?: string): void {
    this.buffer = { text, timestamp: Date.now(), sourceAppId };
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).catch(() => { /* 瀏覽器可能拒絕無手勢寫入，忽略 */ });
    }
    this.emitChanged();
  }

  /** 讀取剪貼簿。同步回傳記憶體緩衝區快照。 */
  read(): ClipboardEntry {
    return { ...this.buffer };
  }

  /** 清除剪貼簿 */
  clear(sourceAppId?: string): void {
    this.write('', sourceAppId);
  }

  private emitChanged(): void {
    try {
      this.eventBus.emit(this.systemAppId, Events.CLIPBOARD_CHANGED, {
        text: this.buffer.text,
        timestamp: this.buffer.timestamp,
        sourceAppId: this.buffer.sourceAppId,
      });
    } catch { /* eventBus 可能尚未就緒 */ }
  }
}

export { ClipboardManager };
