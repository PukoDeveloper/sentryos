// ── IRuntime ─────────────────────────────────────────────────
// 所有 Script Runtime 實作必須遵守的公開介面。
// 新增 Runtime 引擎（例如 Lua、Python）只需實作此介面，
// 即可透過 RuntimeRegistry 接入現有的應用程式生命週期管理。

import type { RuntimeResult } from './types';

interface IRuntime {
    // ── 程式碼執行 ──────────────────────────────────────────
    /** 在指定 PID 的沙箱中執行程式碼。第一次呼叫時以 entryPath 決定套件根目錄。 */
    execute(pid: number, code: string, timeoutMs?: number, entryPath?: string): RuntimeResult<unknown>;
    /** 在已存在的程序上下文中評估程式碼（不重新注入 API），用於載入程式庫。 */
    evaluateInContext(pid: number, code: string): RuntimeResult<unknown>;

    // ── 程序生命週期 ────────────────────────────────────────
    destroyProcessRuntime(pid: number): void;
    destroyAll(): void;

    // ── 事件派發 ────────────────────────────────────────────
    dispatchUiEvent(processAppId: string, event: Record<string, unknown>): RuntimeResult<unknown>;
    dispatchConsoleInput(processAppId: string, line: string): RuntimeResult<unknown>;
    dispatchKeyboardEvent(processAppId: string, event: Record<string, unknown>): RuntimeResult<unknown>;
    dispatchFileOpen(processAppId: string, fileInfo: Record<string, unknown>): RuntimeResult<unknown>;
    dispatchDialogResult(processAppId: string, result: Record<string, unknown>): RuntimeResult<unknown>;
}

export type { IRuntime };
