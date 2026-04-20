// ────────────────────────────────────────────────────────────
// installApi — 應用程式安裝 Host API
// ────────────────────────────────────────────────────────────
// 任何應用程式皆可呼叫此 API 請求安裝一個遠端應用程式。
// 系統將顯示安裝確認對話框（含權限清單），需使用者明確同意
// 才會將 manifest URL 寫入 sys:app.js。
//
// 使用方式（QuickJS 應用程式端）：
//   const res = OS.install.requestInstall('https://example.com/app/manifest.json');
//   // res.success: 請求已送出，data.requestId 可用於識別結果
//   // 結果透過 onDialogResult({ requestId, installed }) 回呼回傳

import type { Kernel } from '../kernel/Kernel';
import type { InstallerManifestInfo } from '../application/AppInstaller';

export function registerInstallApi(kernel: Kernel): void {
    const runtimeRegistry = kernel.resolve('runtimeRegistry');

    runtimeRegistry.registerApi('installApi', ({ process }) => {
        const callerProcessAppId = process.processAppId;

        return {
            /**
             * 請求安裝遠端應用程式。
             * @param manifestUrl manifest.json 的完整 URL
             * @returns { success: true, data: { requestId } } — 請求已送出，
             *   結果將透過 onDialogResult({ requestId, installed: boolean }) 回呼傳回。
             */
            requestInstall: (manifestUrl: unknown) => {
                if (!manifestUrl || typeof manifestUrl !== 'string') {
                    return { success: false, error: 'InvalidUrl' };
                }

                const url = String(manifestUrl);
                const requestId = `install_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`}`;

                // Async flow: fetch manifest → show dialog → dispatch result
                (async () => {
                    const appInstaller = kernel.resolve('appInstaller');
                    const runtime = runtimeRegistry.getForProcessAppId(callerProcessAppId);

                    const dispatch = (installed: boolean, error?: string) => {
                        try {
                            runtime.dispatchDialogResult(callerProcessAppId, {
                                requestId,
                                installed,
                                ...(error ? { error } : {}),
                            });
                        } catch { /* caller may be gone */ }
                    };

                    // 1. Fetch manifest
                    let raw: unknown;
                    try {
                        const response = await fetch(url);
                        if (!response.ok) {
                            dispatch(false, `FetchFailed:${response.status}`);
                            return;
                        }
                        raw = await response.json();
                    } catch {
                        dispatch(false, 'FetchFailed');
                        return;
                    }

                    // 2. Parse manifest info
                    const info = parseManifestInfo(raw, url);
                    if (!info) {
                        dispatch(false, 'InvalidManifest');
                        return;
                    }

                    // 3. Show install dialog (awaits user response)
                    const result = await appInstaller.requestInstall(info);

                    // 4. Deliver result back to calling process
                    dispatch(result.confirmed);
                })();

                return { success: true, data: { requestId } };
            },
        };
    }, [], 'system');
}

// ── Manifest Parser ──────────────────────────────────────────

function parseManifestInfo(raw: unknown, manifestUrl: string): InstallerManifestInfo | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const obj = raw as Record<string, unknown>;

    // Package manifest format (has `apps` array)
    if (Array.isArray(obj.apps) && typeof obj.name === 'string') {
        const allPerms = new Set<string>();
        for (const app of obj.apps as Record<string, unknown>[]) {
            if (Array.isArray(app.permissions)) {
                for (const p of app.permissions) {
                    if (typeof p === 'string') allPerms.add(p);
                }
            }
        }
        return {
            name: String(obj.name),
            version: obj.version ? String(obj.version) : undefined,
            description: obj.description ? String(obj.description) : undefined,
            author: obj.author ? String(obj.author) : undefined,
            permissions: Array.from(allPerms),
            manifestUrl,
        };
    }

    // Legacy manifest format (has `main` string)
    if (typeof obj.name === 'string' && typeof obj.main === 'string') {
        return {
            name: String(obj.name),
            version: obj.version ? String(obj.version) : undefined,
            description: obj.description ? String(obj.description) : undefined,
            author: obj.author ? String(obj.author) : undefined,
            permissions: Array.isArray(obj.permissions)
                ? (obj.permissions as unknown[]).filter(p => typeof p === 'string') as string[]
                : [],
            manifestUrl,
        };
    }

    return null;
}
