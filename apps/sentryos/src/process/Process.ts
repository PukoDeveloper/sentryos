import type { AppType } from '../kernel/constants';

// ────────────────────────────────────────────────────────────
// Process — 單一執行中的應用程式實例
// ────────────────────────────────────────────────────────────
class Process {
    readonly pid: number;
    /** 對應 ApplicationManager 中的 appId（應用定義 ID） */
    readonly appDefId: string;
    /** 此實例在 PermissionsManager / EventBus 中使用的唯一憑證 ID */
    readonly processAppId: string;
    readonly type: AppType;
    readonly parentPid: number | null;
    private _status: 'running' | 'stopped' | 'suspended';
    /** 直屬子程序的 PID 集合 */
    readonly children: Set<number>;

    constructor(
        pid: number,
        appDefId: string,
        processAppId: string,
        type: AppType,
        parentPid: number | null = null
    ) {
        this.pid = pid;
        this.appDefId = appDefId;
        this.processAppId = processAppId;
        this.type = type;
        this.parentPid = parentPid;
        this._status = 'running';
        this.children = new Set();
    }

    get status(): 'running' | 'stopped' | 'suspended' {
        return this._status;
    }

    suspend(): void {
        if (this._status === 'running') this._status = 'suspended';
    }

    resume(): void {
        if (this._status === 'suspended') this._status = 'running';
    }

    /** 僅供 ProcessManager 內部呼叫 */
    markStopped(): void {
        this._status = 'stopped';
    }
}

export { Process };
