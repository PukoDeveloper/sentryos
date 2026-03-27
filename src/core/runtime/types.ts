// ── ScriptRuntime 型別定義 ──────────────────────────────────
import type { AppType } from '../constants';

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
