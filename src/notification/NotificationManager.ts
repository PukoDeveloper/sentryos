// ────────────────────────────────────────────────────────────
// NotificationManager — 全域通知系統
// ────────────────────────────────────────────────────────────

import { NOTIFICATION_DEFAULT_DURATION_MS, NOTIFICATION_MAX_VISIBLE } from '../kernel/constants';

type NotificationType = 'info' | 'success' | 'warning' | 'error';

interface NotificationOptions {
    title: string;
    body?: string;
    type?: NotificationType;
    duration?: number;       // ms, 0 = 不自動消失
    source?: string;         // 來源 app 名稱
}

interface NotificationEntry {
    id: string;
    title: string;
    body?: string;
    type: NotificationType;
    duration: number;
    source?: string;
    element: HTMLDivElement;
    timer: number | null;
    fallbackTimer: number | null;
}

class NotificationManager {
    private container: HTMLDivElement | null = null;
    private notifications = new Map<string, NotificationEntry>();
    private nextId = 1;
    private _doNotDisturb = false;
    private _defaultDuration = NOTIFICATION_DEFAULT_DURATION_MS;
    private _maxVisible = NOTIFICATION_MAX_VISIBLE;

    get doNotDisturb(): boolean { return this._doNotDisturb; }
    set doNotDisturb(v: boolean) { this._doNotDisturb = v; }

    get defaultDuration(): number { return this._defaultDuration; }
    set defaultDuration(v: number) { this._defaultDuration = Math.max(0, v); }

    get maxVisible(): number { return this._maxVisible; }
    set maxVisible(v: number) { this._maxVisible = Math.max(1, v); }

    /** 建立通知容器，回傳 HTMLElement 供 DesktopShell.registerOverlay 使用 */
    createContainer(): HTMLDivElement {
        const container = document.createElement('div');
        container.className = 'notification-container';
        this.container = container;
        return container;
    }

    destroy(): void {
        for (const entry of this.notifications.values()) {
            if (entry.timer !== null) window.clearTimeout(entry.timer);
            if (entry.fallbackTimer !== null) window.clearTimeout(entry.fallbackTimer);
        }
        this.notifications.clear();
        this.container?.remove();
        this.container = null;
    }

    notify(options: NotificationOptions): string {
        if (!this.container) return '';
        if (this._doNotDisturb) return '';

        const id = `notif_${this.nextId++}`;
        const type = options.type ?? 'info';
        const duration = options.duration ?? this._defaultDuration;

        const el = this.createNotificationElement(id, options.title, options.body, type, options.source);
        this.container.appendChild(el);

        // 進場動畫
        requestAnimationFrame(() => el.classList.add('is-visible'));

        const timer = duration > 0
            ? window.setTimeout(() => this.dismiss(id), duration)
            : null;

        const entry: NotificationEntry = {
            id, title: options.title, body: options.body,
            type, duration, source: options.source,
            element: el, timer, fallbackTimer: null,
        };
        this.notifications.set(id, entry);

        // 超過最大顯示數量時，移除最舊的
        this.enforceMaxVisible();

        return id;
    }

    dismiss(id: string): void {
        const entry = this.notifications.get(id);
        if (!entry) return;

        if (entry.timer !== null) window.clearTimeout(entry.timer);
        entry.element.classList.remove('is-visible');
        entry.element.classList.add('is-dismissed');

        // 若 transitionend 未觸發（例如 display:none），保底移除
        const fallbackTimer = window.setTimeout(() => {
            if (this.notifications.has(id)) {
                entry.element.remove();
                this.notifications.delete(id);
            }
        }, 400);
        entry.fallbackTimer = fallbackTimer;

        // 等退場動畫結束後移除 DOM
        entry.element.addEventListener('transitionend', () => {
            window.clearTimeout(fallbackTimer);
            entry.element.remove();
            this.notifications.delete(id);
        }, { once: true });
    }

    private enforceMaxVisible(): void {
        const ids = Array.from(this.notifications.keys());
        while (ids.length > this._maxVisible) {
            this.dismiss(ids.shift()!);
        }
    }

    private createNotificationElement(
        id: string, title: string, body: string | undefined,
        type: NotificationType, source: string | undefined
    ): HTMLDivElement {
        const el = document.createElement('div');
        el.className = `notification-toast notification-${type}`;
        el.dataset.notificationId = id;

        // 圖示
        const iconEl = document.createElement('span');
        iconEl.className = 'notification-icon';
        iconEl.textContent = this.iconForType(type);
        el.appendChild(iconEl);

        // 內容區
        const contentEl = document.createElement('div');
        contentEl.className = 'notification-content';

        if (source) {
            const sourceEl = document.createElement('span');
            sourceEl.className = 'notification-source';
            sourceEl.textContent = source;
            contentEl.appendChild(sourceEl);
        }

        const titleEl = document.createElement('span');
        titleEl.className = 'notification-title';
        titleEl.textContent = title;
        contentEl.appendChild(titleEl);

        if (body) {
            const bodyEl = document.createElement('span');
            bodyEl.className = 'notification-body';
            bodyEl.textContent = body;
            contentEl.appendChild(bodyEl);
        }

        el.appendChild(contentEl);

        // 關閉按鈕
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'notification-close';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', () => this.dismiss(id));
        el.appendChild(closeBtn);

        return el;
    }

    private iconForType(type: NotificationType): string {
        switch (type) {
            case 'success': return '✓';
            case 'warning': return '⚠';
            case 'error':   return '✕';
            default:        return 'ℹ';
        }
    }
}

export { NotificationManager, type NotificationOptions, type NotificationType };
