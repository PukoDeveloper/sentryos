// ── ScriptRuntime 型別定義 ──────────────────────────────────
import type { AppType } from '../kernel/constants';
import type { QuickJSRuntime, QuickJSContext, QuickJSHandle } from 'quickjs-emscripten';

type ProcessType = AppType;

type RuntimeError =
    | 'ProcessNotFound'
    | 'ProcessNotRunning'
    | 'RuntimeError'
    | 'PermissionDenied'
    | 'InvalidTarget'
    | 'InboxFull'
    | 'TooManyChildren';

type RuntimeResult<T> = {
    success: boolean;
    data?: T;
    error?: RuntimeError;
};

type ProcessView = {
    pid: number;
    appDefId: string;
    processAppId: string;
    type: ProcessType;
    parentPid: number | null;
    status: 'running' | 'stopped' | 'suspended';
    children: Set<number>;
};

type HostApiValue = string | number | boolean | null | undefined | HostApiValue[] | { [k: string]: HostApiValue } | HostApiFunction;
// HostApiFunction uses `any[]` intentionally: these functions are called through the QuickJS
// bridge which converts all values, so specific param types cannot be enforced here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HostApiFunction = (...args: any[]) => unknown;
type ApiFactoryContext = {
    pid: number;
    process: ProcessView;
};
type ApiFactory = (ctx: ApiFactoryContext) => Record<string, HostApiValue>;

type Message = {
    fromPid: number;
    toPid: number;
    type: 'ipc' | 'event';
    channel: string;
    payload: unknown;
    timestamp: number;
};

/** 所有 Runtime 引擎共用的基礎程序狀態（與引擎無關）。 */
type BaseProcessState = {
    inbox: Message[];
    eventSubscriptions: Map<string, (...args: unknown[]) => void>;
    /** 應用程式套件根目錄（用於模組路徑解析） */
    entryPath: string | null;
};

/** QuickJS 引擎的完整程序狀態（繼承自 BaseProcessState）。 */
type RuntimeProcess = BaseProcessState & {
    runtime: QuickJSRuntime;
    context: QuickJSContext;
    /** 模組快取：已載入模組的路徑 → 匯出值 */
    moduleCache: Map<string, QuickJSHandle>;
    /** imports() 是否已注入 */
    importsInjected?: boolean;
    /** 已註冊的 host-side timer ID 集合（用於 process 銷毀時清理） */
    timers: Set<number>;
    /** timer 順序 ID → host timer ID 對應 */
    timerMap: Map<number, number>;
    /** timer 順序 ID → QuickJS callback handle 對應（銷毀時需 dispose） */
    timerCallbacks: Map<number, QuickJSHandle>;
    /** timer 順序 ID 計數器 */
    timerNextId: number;
    /** 已回收可復用的 timer guest ID */
    timerFreeIds?: number[];
};

type ResponseType = 'text' | 'json' | 'javascript';

/**
 * 插件用的 Runtime 適配器介面。
 * 只需提供沙箱的建立/注入/執行/銷毀，
 * 其餘邏輯（IPC、事件訂閱、API 表面建構）由 AdapterRuntime 自動處理。
 */
type RuntimeAdapter = {
    /** 建立新的沙箱/VM 實例 */
    createSandbox(pid: number): unknown;
    /**
     * 將完整的 OS API 表面注入沙箱。
     * 實作者應將 `apiSurface` 掛載為沙箱中的 `OS` 全域物件。
     */
    injectGlobals(sandbox: unknown, apiSurface: Record<string, HostApiValue>): void;
    /** 在沙箱中執行程式碼並回傳結果 */
    execute(sandbox: unknown, code: string, timeoutMs?: number): unknown;
    /** 銷毀沙箱實例並釋放所有資源 */
    destroy(sandbox: unknown): void;
    /**
     * 直接呼叫沙箱中的全域函式（用於事件派發）。
     * AdapterRuntime 透過此方法觸發 onWindowEvent、onConsoleInput 等回呼，
     * 避免產生語言特定的程式碼字串。
     * 若指定函式不存在，應靜默回傳 `undefined`（不拋出錯誤）。
     */
    callHandler(sandbox: unknown, handlerName: string, arg: unknown): unknown;
};

/** 單一 Runtime 引擎的記憶體使用量快照。 */
type RuntimeMemoryUsage = {
    engineName: string;
    activeProcesses: number;
    totalModuleCacheEntries: number;
    totalTimers: number;
    /** 引擎專屬的記憶體詳情（例如 QuickJS 堆資訊） */
    engineMemory: Record<string, number>;
    /** 估算的總記憶體占用（位元組） */
    estimatedBytes: number;
};

export type {
    ProcessType,
    RuntimeError,
    RuntimeResult,
    ProcessView,
    HostApiValue,
    HostApiFunction,
    ApiFactoryContext,
    ApiFactory,
    Message,
    BaseProcessState,
    RuntimeProcess,
    ResponseType,
    RuntimeAdapter,
    RuntimeMemoryUsage,

};
