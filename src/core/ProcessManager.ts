import type { ProcessResult } from './types';
import type { Kernel } from './Kernel';
import { Permissions, type AppType } from './constants';
import { Process } from './Process';

interface LaunchOptions {
    type?: AppType;
    /** 指定父程序 PID，子程序會與父程序的生命週期綁定 */
    parentPid?: number;
}

// ────────────────────────────────────────────────────────────
// ProcessManager — 建立、終止、查詢程序
// ────────────────────────────────────────────────────────────
class ProcessManager {
    /** PID → Process */
    private processes: Map<number, Process> = new Map();
    /** appDefId → Set<PID>，用於 maxInstances 檢查與按 app 查詢 */
    private appProcesses: Map<string, Set<number>> = new Map();
    private nextPid = 1;

    private readonly kernel: Kernel;

    constructor(kernel: Kernel) {
        this.kernel = kernel;
    }

    private get systemAppId() { return this.kernel.get('systemAppId'); }
    private get permissions() { return this.kernel.resolve('permissions'); }
    private get appManager() { return this.kernel.resolve('appManager'); }
    private get eventBus() { return this.kernel.resolve('eventBus'); }

    /**
     * 啟動一個應用程式的新實例。
     * @param callerAppId 發出請求的程序憑證（需有 process.launch.<appDefId> 權限）
     * @param appDefId    要啟動的應用定義 ID（來自 ApplicationManager）
     * @param options     選填：程序類型、父程序 PID
     */
    launch(callerAppId: string, appDefId: string, options: LaunchOptions = {}): ProcessResult {
        if (!this.permissions.has(callerAppId, Permissions.processLaunch(appDefId))) {
            return { success: false, error: 'PermissionDenied' };
        }

        const app = this.appManager.get(appDefId);
        if (!app) {
            return { success: false, error: 'AppNotFound' };
        }

        // 最大實例數檢查（0 或 undefined = 不限制）
        const maxInstances = app.maxInstances ?? 0;
        if (maxInstances > 0) {
            const current = this.appProcesses.get(appDefId)?.size ?? 0;
            if (current >= maxInstances) {
                return { success: false, error: 'MaxInstancesReached' };
            }
        }

        // 父程序存在性驗證
        const parentPid = options.parentPid ?? null;
        if (parentPid !== null && !this.processes.has(parentPid)) {
            return { success: false, error: 'ParentNotFound' };
        }

        // 由系統為此實例建立獨立的權限槽
        const permResult = this.permissions.new(this.systemAppId, app.permissions);
        if (!permResult.success || permResult.data == null) {
            return { success: false, error: 'UnknownError' };
        }
        const processAppId = permResult.data as string;

        const pid = this.nextPid++;
        const type = options.type ?? 'Service';
        const proc = new Process(pid, appDefId, processAppId, type, parentPid);

        this.processes.set(pid, proc);

        if (!this.appProcesses.has(appDefId)) {
            this.appProcesses.set(appDefId, new Set());
        }
        this.appProcesses.get(appDefId)!.add(pid);

        // 登記到父程序的子程序集合
        if (parentPid !== null) {
            this.processes.get(parentPid)!.children.add(pid);
        }

        return { success: true, data: pid };
    }

    /**
     * 終止指定程序及其所有子程序（遞迴）。
     * 同一個 app 的其他根程序不受影響。
     * @param callerAppId 需有 process.terminate 權限
     */
    terminate(callerAppId: string, pid: number): ProcessResult {
        if (!this.permissions.has(callerAppId, Permissions.PROCESS_TERMINATE)) {
            return { success: false, error: 'PermissionDenied' };
        }
        return this._terminate(pid);
    }

    private _terminate(pid: number): ProcessResult {
        const proc = this.processes.get(pid);
        if (!proc) {
            return { success: false, error: 'NotFound' };
        }

        // 先遞迴終止所有子程序（複製 Set 避免迭代時修改）
        for (const childPid of Array.from(proc.children)) {
            this._terminate(childPid);
        }

        proc.markStopped();

        // 從父程序的子集合移除自己
        if (proc.parentPid !== null) {
            this.processes.get(proc.parentPid)?.children.delete(pid);
        }

        // 清除事件訂閱與權限槽
        this.eventBus.removeApp(proc.processAppId);
        this.permissions.removeApp(this.systemAppId, proc.processAppId);

        this.appProcesses.get(proc.appDefId)?.delete(pid);
        this.processes.delete(pid);

        return { success: true, data: pid };
    }

    suspend(callerAppId: string, pid: number): ProcessResult {
        if (!this.permissions.has(callerAppId, Permissions.PROCESS_SUSPEND)) {
            return { success: false, error: 'PermissionDenied' };
        }
        const proc = this.processes.get(pid);
        if (!proc) return { success: false, error: 'NotFound' };
        proc.suspend();
        return { success: true, data: pid };
    }

    resume(callerAppId: string, pid: number): ProcessResult {
        if (!this.permissions.has(callerAppId, Permissions.PROCESS_RESUME)) {
            return { success: false, error: 'PermissionDenied' };
        }
        const proc = this.processes.get(pid);
        if (!proc) return { success: false, error: 'NotFound' };
        proc.resume();
        return { success: true, data: pid };
    }

    /** 取得單一程序 */
    get(pid: number): Process | undefined {
        return this.processes.get(pid);
    }

    /** 以 processAppId（權限憑證 ID）反查程序 */
    getByProcessAppId(processAppId: string): Process | undefined {
        for (const proc of this.processes.values()) {
            if (proc.processAppId === processAppId) return proc;
        }
        return undefined;
    }

    /** 取得某應用所有執行中的程序實例 */
    getByApp(appDefId: string): Process[] {
        const pids = this.appProcesses.get(appDefId);
        if (!pids) return [];
        return Array.from(pids)
            .map(p => this.processes.get(p)!)
            .filter(Boolean);
    }

    /** 取得所有執行中的程序 */
    getAllProcesses(): Process[] {
        return Array.from(this.processes.values());
    }
}

export { ProcessManager, type LaunchOptions };
