// ────────────────────────────────────────────────────────────
// AppInstaller — 應用程式安裝器（核心層 UI）
// ────────────────────────────────────────────────────────────
// 顯示安裝確認對話框，列出應用程式請求的權限，並在使用者確認後
// 將 manifest URL 寫入 sys:app.js，同時快取已同意的權限清單到
// sys:app-grants（供開機時比對是否需要重新同意）。
//
// 使用方式：
//   const installer = kernel.resolve('appInstaller');
//   const result = await installer.requestInstall({ name: 'Foo', permissions: [...], manifestUrl: '...' });
//   if (result.confirmed) { /* installed */ }

import type { Kernel } from '../kernel/Kernel';
import type { LanguageManager } from '../language/LanguageManager';

// ── Public Types ─────────────────────────────────────────────

export interface InstallerManifestInfo {
    name: string;
    version?: string;
    description?: string;
    author?: string;
    /** 此 manifest 中所有應用程式合併後的完整權限清單 */
    permissions: string[];
    manifestUrl: string;
}

export interface InstallResult {
    confirmed: boolean;
}

// ── Internal Constants ────────────────────────────────────────

const SYS_APP_JS_KEY = 'app.js';
const SYS_APP_GRANTS_KEY = 'app-grants';

// ── AppInstaller ─────────────────────────────────────────────

class AppInstaller {
    private container: HTMLDivElement | null = null;
    private readonly kernel: Kernel;

    constructor(kernel: Kernel) {
        this.kernel = kernel;
    }

    private t(key: string): string {
        try {
            const lm = this.kernel.resolve('languageManager') as LanguageManager;
            return lm.t('installer', key);
        } catch {
            return key;
        }
    }

    /** 建立浮層容器，回傳供 DesktopShell.registerOverlay 掛載 */
    createContainer(): HTMLDivElement {
        const container = document.createElement('div');
        container.className = 'app-installer-layer';
        this.container = container;
        return container;
    }

    // ── 安裝對話框 ────────────────────────────────────────────

    /**
     * 顯示安裝確認對話框，等待使用者選擇。
     * 若使用者確認，自動寫入 sys:app.js 與 sys:app-grants。
     */
    requestInstall(info: InstallerManifestInfo): Promise<InstallResult> {
        return new Promise((resolve) => {
            if (!this.container) {
                resolve({ confirmed: false });
                return;
            }

            const backdrop = this._buildDialog(info, {
                titleKey: 'installer.install.title',
                bodyKey: 'installer.install.body',
                permsTitleKey: 'installer.label.perms',
                permsToShow: info.permissions,
                confirmKey: 'installer.btn.install',
                onConfirm: () => {
                    this._persistInstall(info.manifestUrl, info.permissions);
                    dismiss();
                    resolve({ confirmed: true });
                },
                onCancel: () => {
                    dismiss();
                    resolve({ confirmed: false });
                },
            });

            this.container.appendChild(backdrop);
            requestAnimationFrame(() => backdrop.classList.add('is-visible'));

            const dismiss = () => this._dismissBackdrop(backdrop);
        });
    }

    /**
     * 顯示重新同意對話框（應用程式更新了權限要求）。
     * 若使用者確認，更新 sys:app-grants 中的記錄。
     * 若拒絕，呼叫端應從 sys:app.js 移除該 URL。
     */
    requestReConsent(info: InstallerManifestInfo & { newPermissions: string[] }): Promise<boolean> {
        return new Promise((resolve) => {
            if (!this.container) {
                resolve(false);
                return;
            }

            const backdrop = this._buildDialog(info, {
                titleKey: 'installer.reConsent.title',
                bodyKey: 'installer.reConsent.body',
                permsTitleKey: 'installer.label.newPerms',
                permsToShow: info.newPermissions,
                confirmKey: 'installer.btn.allow',
                isReConsent: true,
                onConfirm: () => {
                    this._updateGrants(info.manifestUrl, info.permissions);
                    dismiss();
                    resolve(true);
                },
                onCancel: () => {
                    dismiss();
                    resolve(false);
                },
            });

            this.container.appendChild(backdrop);
            requestAnimationFrame(() => backdrop.classList.add('is-visible'));

            const dismiss = () => this._dismissBackdrop(backdrop);
        });
    }

    // ── 儲存層 ────────────────────────────────────────────────

    /** 讀取指定 manifest URL 已同意的權限清單，若從未安裝則回傳 null */
    getGrantedPermissions(manifestUrl: string): string[] | null {
        const fs = this.kernel.resolve('fileSystem');
        const sysId = this.kernel.get('systemAppId');
        const result = fs.read(sysId, 'sys', SYS_APP_GRANTS_KEY);
        if (!result.success || !result.data) return null;
        const grants = result.data.data as Record<string, string[]>;
        return grants[manifestUrl] ?? null;
    }

    /** 更新 sys:app-grants 中指定 URL 的已同意權限（無需顯示對話框） */
    updateGrants(manifestUrl: string, permissions: string[]): void {
        this._updateGrants(manifestUrl, permissions);
    }

    /** 從 sys:app.js 與 sys:app-grants 中移除應用程式記錄 */
    removeInstall(manifestUrl: string): void {
        const fs = this.kernel.resolve('fileSystem');
        const sysId = this.kernel.get('systemAppId');

        // Remove from app.js
        const appJsResult = fs.read(sysId, 'sys', SYS_APP_JS_KEY);
        if (appJsResult.success && Array.isArray(appJsResult.data?.data)) {
            const updated = (appJsResult.data!.data as string[]).filter(u => u !== manifestUrl);
            fs.write(sysId, 'sys', SYS_APP_JS_KEY, updated, { ownerLabel: 'system' });
        }

        // Remove from app-grants
        const grantsResult = fs.read(sysId, 'sys', SYS_APP_GRANTS_KEY);
        if (grantsResult.success && grantsResult.data) {
            const grants = { ...(grantsResult.data.data as Record<string, string[]>) };
            delete grants[manifestUrl];
            fs.write(sysId, 'sys', SYS_APP_GRANTS_KEY, grants, { ownerLabel: 'system' });
        }
    }

    // ── Private: 儲存寫入 ─────────────────────────────────────

    private _persistInstall(manifestUrl: string, permissions: string[]): void {
        const fs = this.kernel.resolve('fileSystem');
        const sysId = this.kernel.get('systemAppId');

        // Add to app.js if not already present
        const appJsResult = fs.read(sysId, 'sys', SYS_APP_JS_KEY);
        const existing: string[] = Array.isArray(appJsResult.data?.data)
            ? (appJsResult.data!.data as string[])
            : [];
        if (!existing.includes(manifestUrl)) {
            fs.write(sysId, 'sys', SYS_APP_JS_KEY, [...existing, manifestUrl], { ownerLabel: 'system' });
        }

        this._updateGrants(manifestUrl, permissions);
    }

    private _updateGrants(manifestUrl: string, permissions: string[]): void {
        const fs = this.kernel.resolve('fileSystem');
        const sysId = this.kernel.get('systemAppId');
        const grantsResult = fs.read(sysId, 'sys', SYS_APP_GRANTS_KEY);
        const grants: Record<string, string[]> = this._readGrantsData(grantsResult.data?.data);
        grants[manifestUrl] = permissions;
        fs.write(sysId, 'sys', SYS_APP_GRANTS_KEY, grants, { ownerLabel: 'system' });
    }

    private _readGrantsData(raw: unknown): Record<string, string[]> {
        if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
            return { ...(raw as Record<string, string[]>) };
        }
        return {};
    }

    // ── Private: DOM 建構 ─────────────────────────────────────

    private _dismissBackdrop(backdrop: HTMLDivElement): void {
        backdrop.classList.remove('is-visible');
        backdrop.classList.add('is-dismissed');
        backdrop.addEventListener('transitionend', () => backdrop.remove(), { once: true });
        setTimeout(() => { if (backdrop.parentNode) backdrop.remove(); }, 300);
    }

    private _buildDialog(
        info: InstallerManifestInfo,
        opts: {
            titleKey: string;
            bodyKey: string;
            permsTitleKey: string;
            permsToShow: string[];
            confirmKey: string;
            isReConsent?: boolean;
            onConfirm: () => void;
            onCancel: () => void;
        }
    ): HTMLDivElement {
        const backdrop = document.createElement('div');
        backdrop.className = 'app-installer-backdrop';

        const dialog = document.createElement('div');
        dialog.className = 'app-installer-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');

        // Icon
        const iconEl = document.createElement('div');
        iconEl.className = 'app-installer-icon';
        iconEl.textContent = opts.isReConsent ? '🔄' : '📦';
        dialog.appendChild(iconEl);

        // Title
        const titleEl = document.createElement('div');
        titleEl.className = 'app-installer-title';
        titleEl.textContent = this.t(opts.titleKey);
        dialog.appendChild(titleEl);

        // Body description
        const bodyEl = document.createElement('div');
        bodyEl.className = 'app-installer-body';
        bodyEl.textContent = this.t(opts.bodyKey);
        dialog.appendChild(bodyEl);

        // App info card
        const infoCard = document.createElement('div');
        infoCard.className = 'app-installer-info';

        const nameEl = document.createElement('div');
        nameEl.className = 'app-installer-app-name';
        nameEl.textContent = info.name;
        infoCard.appendChild(nameEl);

        if (info.version) {
            const verEl = document.createElement('div');
            verEl.className = 'app-installer-app-version';
            verEl.textContent = `v${info.version}`;
            infoCard.appendChild(verEl);
        }

        if (info.description) {
            const descEl = document.createElement('div');
            descEl.className = 'app-installer-app-desc';
            descEl.textContent = info.description;
            infoCard.appendChild(descEl);
        }

        if (info.author) {
            const authorEl = document.createElement('div');
            authorEl.className = 'app-installer-app-author';
            authorEl.textContent = `${this.t('installer.label.author')}: ${info.author}`;
            infoCard.appendChild(authorEl);
        }

        dialog.appendChild(infoCard);

        // Permissions section
        if (opts.permsToShow.length > 0) {
            const permsSection = document.createElement('div');
            permsSection.className = 'app-installer-perms';

            const permsTitleEl = document.createElement('div');
            permsTitleEl.className = 'app-installer-perms-title';
            permsTitleEl.textContent = this.t(opts.permsTitleKey);
            permsSection.appendChild(permsTitleEl);

            const permsList = document.createElement('ul');
            permsList.className = 'app-installer-perms-list';
            for (const perm of opts.permsToShow) {
                const item = document.createElement('li');
                item.textContent = perm;
                permsList.appendChild(item);
            }
            permsSection.appendChild(permsList);
            dialog.appendChild(permsSection);
        } else if (!opts.isReConsent) {
            // No permissions requested
            const noPermsEl = document.createElement('div');
            noPermsEl.className = 'app-installer-no-perms';
            noPermsEl.textContent = this.t('installer.label.noPerms');
            dialog.appendChild(noPermsEl);
        }

        // Source URL
        const urlEl = document.createElement('div');
        urlEl.className = 'app-installer-url';
        urlEl.textContent = info.manifestUrl;
        urlEl.title = info.manifestUrl;
        dialog.appendChild(urlEl);

        // Button row
        const btnRow = document.createElement('div');
        btnRow.className = 'app-installer-btn-row';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'app-installer-btn app-installer-btn-cancel';
        cancelBtn.textContent = opts.isReConsent
            ? this.t('installer.btn.remove')
            : this.t('installer.btn.cancel');
        cancelBtn.addEventListener('click', opts.onCancel);
        btnRow.appendChild(cancelBtn);

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'app-installer-btn app-installer-btn-confirm';
        confirmBtn.textContent = this.t(opts.confirmKey);
        confirmBtn.addEventListener('click', opts.onConfirm);
        btnRow.appendChild(confirmBtn);

        dialog.appendChild(btnRow);
        backdrop.appendChild(dialog);

        // Auto-focus confirm button
        requestAnimationFrame(() => confirmBtn.focus());

        return backdrop;
    }
}

export { AppInstaller };
