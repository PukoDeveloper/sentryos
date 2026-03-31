// ────────────────────────────────────────────────────────────
// SystemAlert — 面向使用者的系統彈窗提示
// ────────────────────────────────────────────────────────────
// 與 NotificationManager（Toast 小通知）不同，SystemAlert 用於
// 需要使用者明確關注的系統級警告，例如權限不足、啟動失敗等。
//
// 使用方式：
//   const alert = kernel.resolve('systemAlert');
//   alert.show({ code: 'PERMISSION_DENIED', detail: 'terminal' });
//   alert.show({ code: 'APP_LAUNCH_FAILED', title: '啟動失敗', body: '...' });

import type { Kernel } from '../kernel/Kernel';

// ── Alert Code 列舉 ────────────────────────────────────────
export type AlertCode =
  | 'PERMISSION_DENIED'
  | 'APP_LAUNCH_FAILED'
  | 'APP_FETCH_FAILED'
  | 'SYSTEM_ERROR';

export type AlertLevel = 'warning' | 'error';

export interface SystemAlertOptions {
  /** 預定義的警告代碼，自帶預設標題與文案 */
  code: AlertCode;
  /** 覆寫預設標題 */
  title?: string;
  /** 覆寫或補充預設描述 */
  body?: string;
  /** 額外細節（會附加在 body 後方） */
  detail?: string;
  /** 覆寫預設等級 */
  level?: AlertLevel;
}

interface AlertPreset {
  title: string;
  body: string;
  level: AlertLevel;
}

const ALERT_PRESETS: Record<AlertCode, AlertPreset> = {
  PERMISSION_DENIED: {
    title: '權限不足',
    body: '你沒有執行此操作的權限。',
    level: 'warning',
  },
  APP_LAUNCH_FAILED: {
    title: '應用程式啟動失敗',
    body: '無法啟動應用程式，請稍後再試。',
    level: 'error',
  },
  APP_FETCH_FAILED: {
    title: '無法載入應用程式',
    body: '應用程式的主程式檔案載入失敗。',
    level: 'error',
  },
  SYSTEM_ERROR: {
    title: '系統錯誤',
    body: '發生了非預期的系統錯誤。',
    level: 'error',
  },
};

class SystemAlert {
  private container: HTMLDivElement | null = null;

  constructor(_kernel: Kernel) {
    // kernel reserved for future use (e.g. permission-gated alerts)
  }

  /** 建立浮層容器，回傳供 DesktopShell.registerOverlay 掛載 */
  createContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'system-alert-layer';
    this.container = container;
    return container;
  }

  /** 顯示系統警告彈窗 */
  show(options: SystemAlertOptions): void {
    if (!this.container) return;

    const preset = ALERT_PRESETS[options.code];
    const level = options.level ?? preset.level;
    const title = options.title ?? preset.title;
    let body = options.body ?? preset.body;
    if (options.detail) {
      body += `\n${options.detail}`;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'system-alert-backdrop';

    const dialog = document.createElement('div');
    dialog.className = `system-alert-dialog system-alert-${level}`;
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('aria-modal', 'true');

    // 圖示
    const iconEl = document.createElement('div');
    iconEl.className = 'system-alert-icon';
    iconEl.textContent = level === 'error' ? '✕' : '⚠';
    dialog.appendChild(iconEl);

    // 標題
    const titleEl = document.createElement('div');
    titleEl.className = 'system-alert-title';
    titleEl.textContent = title;
    dialog.appendChild(titleEl);

    // 內容
    const bodyEl = document.createElement('div');
    bodyEl.className = 'system-alert-body';
    bodyEl.textContent = body;
    dialog.appendChild(bodyEl);

    // 確認按鈕
    const btnEl = document.createElement('button');
    btnEl.type = 'button';
    btnEl.className = 'system-alert-btn';
    btnEl.textContent = '確定';
    dialog.appendChild(btnEl);

    backdrop.appendChild(dialog);
    this.container.appendChild(backdrop);

    // 進場動畫
    requestAnimationFrame(() => backdrop.classList.add('is-visible'));

    const dismiss = () => {
      backdrop.classList.remove('is-visible');
      backdrop.classList.add('is-dismissed');
      backdrop.addEventListener('transitionend', () => backdrop.remove(), { once: true });
      setTimeout(() => { if (backdrop.parentNode) backdrop.remove(); }, 300);
    };

    btnEl.addEventListener('click', dismiss);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) dismiss();
    });

    // 自動聚焦按鈕
    requestAnimationFrame(() => btnEl.focus());
  }
}

export { SystemAlert };
