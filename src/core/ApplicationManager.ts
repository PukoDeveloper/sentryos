import { ID_PREFIX_APP_DEF } from './constants';

interface Application {
    name: string;
    version: string;
    /** 此應用程式啟動後所擁有的權限清單 */
    permissions: string[];
    /**
     * 最大實例數。
     * undefined 或 0 = 不限制；1 = 單例模式。
     */
    maxInstances?: number;
    /** 由 ApplicationManager.register() 自動賦予，無需手動填寫 */
    appId?: string;
}

// ────────────────────────────────────────────────────────────
// ApplicationManager — 負責應用程式清單的登錄與查詢
// ────────────────────────────────────────────────────────────
class ApplicationManager {
    private applications: Map<string, Application> = new Map();
    private counter = 0;

    /** 在開機或安裝時呼叫，將應用程式定義登錄進系統 */
    register(app: Omit<Application, 'appId'>): string {
        const appId = `${ID_PREFIX_APP_DEF}${Date.now()}_${this.counter++}`;
        this.applications.set(appId, { ...app, appId });
        return appId;
    }

    unregister(appId: string): boolean {
        return this.applications.delete(appId);
    }

    get(appId: string): Application | undefined {
        return this.applications.get(appId);
    }

    getAll(): Application[] {
        return Array.from(this.applications.values());
    }
}

export { ApplicationManager, type Application };
