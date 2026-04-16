// ── ScriptRuntime 型別定義 ──────────────────────────────────
import type { AppType } from '../kernel/constants';
import type { QuickJSRuntime, QuickJSContext, QuickJSHandle } from 'quickjs-emscripten';

type ProcessType = AppType;

type RuntimeError =
    | 'ProcessNotFound'
    | 'ProcessNotRunning'
    | 'RuntimeError'
    | 'PermissionDenied'
    | 'InvalidTarget';

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
};

type ResponseType = 'text' | 'json' | 'javascript';

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

};
