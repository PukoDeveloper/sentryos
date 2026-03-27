// ── Barrel re-export ────────────────────────────────────────
// 原始內容已拆分至 runtime/ 目錄
export { ScriptRuntime } from './runtime/ScriptRuntime';
export { initializeQuickJS } from './runtime/quickjsInit';
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
} from './runtime/types';