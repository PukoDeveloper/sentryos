// ── RuntimeRegistry ───────────────────────────────────────────
// 管理多個 Runtime 引擎實例，並追蹤程序與引擎的對應關係。
// ApplicationLauncher 在啟動應用程式時，根據 manifest 的 engine 欄位
// 路由到正確的 Runtime 實例。

import type { IRuntime } from './IRuntime';
import type { ApiFactory, RuntimeMemoryUsage } from './types';

/** 預設 Runtime 引擎的識別字串（QuickJS-emscripten） */
const DEFAULT_ENGINE = 'quickjs';

/** 單一 Host API 條目 */
type ApiEntry = { factory: ApiFactory; gates: string[]; group?: string };

class RuntimeRegistry {
    private readonly runtimes = new Map<string, IRuntime>();
    /** pid → engine 名稱 */
    private readonly pidEngines = new Map<number, string>();
    /** processAppId → engine 名稱 */
    private readonly appIdEngines = new Map<string, string>();
    private defaultEngine = DEFAULT_ENGINE;

    /** 中央 Host API 註冊表（所有 runtime 共用） */
    private readonly hostApiEntries = new Map<string, ApiEntry>();

    // ── Host API 管理 ────────────────────────────────────────

    /** 將 Host API 註冊到中央註冊表，所有 Runtime 引擎自動共用。 */
    registerApi(name: string, factory: ApiFactory, gates: string[] = [], group?: string): void {
        this.hostApiEntries.set(name, { factory, gates, group });
    }

    /** 從中央註冊表移除 Host API。 */
    unregisterApi(name: string): boolean {
        return this.hostApiEntries.delete(name);
    }

    /** 取得所有已註冊的 Host API 條目（供 BaseRuntime.buildApiSurface 使用）。 */
    getHostApiEntries(): ReadonlyMap<string, Readonly<ApiEntry>> {
        return this.hostApiEntries;
    }

    // ── 引擎管理 ────────────────────────────────────────────

    /** 以 engine 名稱（例如 'quickjs'）註冊一個 Runtime 實例。 */
    register(engine: string, runtime: IRuntime): void {
        if (this.runtimes.has(engine)) {
            console.warn(`[RuntimeRegistry] Engine '${engine}' is already registered and will be overwritten. Verify that no two plugins use the same engine name.`);
        }
        this.runtimes.set(engine, runtime);
    }

    /** 取得指定引擎的 Runtime 實例（未找到時回傳 undefined）。 */
    get(engine: string): IRuntime | undefined {
        return this.runtimes.get(engine);
    }

    /** 取得預設引擎的 Runtime 實例。 */
    getDefault(): IRuntime {
        const runtime = this.runtimes.get(this.defaultEngine);
        if (!runtime) {
            throw new Error(`Default runtime engine '${this.defaultEngine}' is not registered`);
        }
        return runtime;
    }

    /** 設定預設引擎名稱（預設為 'quickjs'）。 */
    setDefault(engine: string): void {
        this.defaultEngine = engine;
    }

    has(engine: string): boolean {
        return this.runtimes.has(engine);
    }

    /** 移除指定引擎的 Runtime 實例（例如插件卸載時）。 */
    unregister(engine: string): boolean {
        return this.runtimes.delete(engine);
    }

    // ── 程序追蹤 ────────────────────────────────────────────

    /** 在程序啟動時記錄該程序使用的引擎，以便後續路由。 */
    bindProcess(pid: number, processAppId: string, engine: string): void {
        this.pidEngines.set(pid, engine);
        this.appIdEngines.set(processAppId, engine);
    }

    /** 在程序終止時解除追蹤。 */
    unbindProcess(pid: number, processAppId: string): void {
        this.pidEngines.delete(pid);
        this.appIdEngines.delete(processAppId);
    }

    /**
     * 根據 PID 取得負責該程序的 Runtime 實例。
     * 若未找到追蹤記錄，回傳預設引擎。
     */
    getForPid(pid: number): IRuntime {
        const engine = this.pidEngines.get(pid) ?? this.defaultEngine;
        return this.runtimes.get(engine) ?? this.getDefault();
    }

    /**
     * 根據 processAppId 取得負責該程序的 Runtime 實例。
     * 若未找到追蹤記錄，回傳預設引擎。
     */
    getForProcessAppId(processAppId: string): IRuntime {
        const engine = this.appIdEngines.get(processAppId) ?? this.defaultEngine;
        return this.runtimes.get(engine) ?? this.getDefault();
    }

    // ── 記憶體使用量 ────────────────────────────────────────

    /** 取得所有已註冊引擎的記憶體使用量快照。 */
    getAllMemoryUsage(): RuntimeMemoryUsage[] {
        const result: RuntimeMemoryUsage[] = [];
        for (const [, runtime] of this.runtimes) {
            result.push(runtime.getMemoryUsage());
        }
        return result;
    }
}

export { RuntimeRegistry, DEFAULT_ENGINE };
