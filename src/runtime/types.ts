// ── ScriptRuntime 型別定義 ──────────────────────────────────
import type { AppType } from '../kernel/constants';

type ProcessType = AppType;
type ApiScope = 'all' | 'service' | 'window' | 'console' | 'library';

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

type RuntimeProcess = {
    runtime: any;
    context: any;
    inbox: Message[];
    eventSubscriptions: Map<string, (...args: unknown[]) => void>;
    /** 模組快取：已載入模組的路徑 → 匯出值 */
    moduleCache: Map<string, unknown>;
    /** 應用程式套件根目錄（用於 imports() 路徑解析） */
    entryPath: string | null;
};

export type {
    ProcessType,
    ApiScope,
    RuntimeError,
    RuntimeResult,
    ProcessView,
    HostApiValue,
    HostApiFunction,
    ApiFactoryContext,
    ApiFactory,
    Message,
    RuntimeProcess,
};
