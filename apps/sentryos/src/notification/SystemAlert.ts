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
import type { LanguageManager } from '../language/LanguageManager';

// ── Alert Code 列舉 ────────────────────────────────────────
export type AlertCode =
  | 'PERMISSION_DENIED'
  | 'APP_LAUNCH_FAILED'
  | 'APP_FETCH_FAILED'
  | 'APP_CRASHED'
  | 'SYSTEM_ERROR'
  | 'APP_OS_OUTDATED'
  | 'APP_OS_REQUIRES_NEWER';

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
  titleKey: string;
  bodyKey: string;
  level: AlertLevel;
}

const ALERT_PRESETS: Record<AlertCode, AlertPreset> = {
  PERMISSION_DENIED: {
    titleKey: 'alert.permissionDenied.title',
    bodyKey: 'alert.permissionDenied.body',
    level: 'warning',
  },
  APP_LAUNCH_FAILED: {
    titleKey: 'alert.appLaunchFailed.title',
    bodyKey: 'alert.appLaunchFailed.body',
    level: 'error',
  },
  APP_FETCH_FAILED: {
    titleKey: 'alert.appFetchFailed.title',
    bodyKey: 'alert.appFetchFailed.body',
    level: 'error',
  },
  APP_CRASHED: {
    titleKey: 'alert.appCrashed.title',
    bodyKey: 'alert.appCrashed.body',
    level: 'error',
  },
  SYSTEM_ERROR: {
    titleKey: 'alert.systemError.title',
    bodyKey: 'alert.systemError.body',
    level: 'error',
  },
  APP_OS_OUTDATED: {
    titleKey: 'alert.appOsOutdated.title',
    bodyKey: 'alert.appOsOutdated.body',
    level: 'warning',
  },
  APP_OS_REQUIRES_NEWER: {
    titleKey: 'alert.appOsRequiresNewer.title',
    bodyKey: 'alert.appOsRequiresNewer.body',
    level: 'warning',
  },
};

class SystemAlert {
  private container: HTMLDivElement | null = null;
  private readonly kernel: Kernel;

  constructor(kernel: Kernel) {
    this.kernel = kernel;
  }

  private t(key: string): string {
    try {
      const lm = this.kernel.resolve('languageManager') as LanguageManager;
      return lm.t('alert', key);
    } catch {
      return key;
    }
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
    const title = options.title ?? this.t(preset.titleKey);
    let body = options.body ?? this.t(preset.bodyKey);
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
    btnEl.textContent = this.t('alert.btn.ok');
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
