// ── IRuntime ─────────────────────────────────────────────────
// 所有 Script Runtime 實作必須遵守的公開介面。
// 新增 Runtime 引擎（例如 Lua、Python）只需實作此介面，
// 即可透過 RuntimeRegistry 接入現有的應用程式生命週期管理。

import type { RuntimeResult, RuntimeMemoryUsage } from './types';

interface IRuntime {
    // ── 程式碼執行 ──────────────────────────────────────────
    /** 在指定 PID 的沙箱中執行程式碼。第一次呼叫時以 entryPath 決定套件根目錄。 */
    execute(pid: number, code: string, timeoutMs?: number, entryPath?: string): RuntimeResult<unknown>;
    /** 在已存在的程序上下文中評估程式碼（不重新注入 API），用於載入程式庫。 */
    evaluateInContext(pid: number, code: string): RuntimeResult<unknown>;

    // ── 程序生命週期 ────────────────────────────────────────
    destroyProcessRuntime(pid: number): void;
    destroyAll(): void;

    // ── 執行逾時管理 ────────────────────────────────────────
    /**
     * 設定指定 PID 程序的自訂執行逾時（毫秒）。
     * 傳入 `undefined` 可重設為系統預設值。
     * 僅在程序存在時生效；若程序尚未建立則靜默忽略。
     */
    setProcessTimeout(pid: number, timeoutMs: number | undefined): void;

    // ── 記憶體使用量 ────────────────────────────────────────
    /** 回傳此 Runtime 引擎的記憶體使用量估算。 */
    getMemoryUsage(): RuntimeMemoryUsage;

    // ── 事件派發 ────────────────────────────────────────────
    dispatchUiEvent(processAppId: string, event: Record<string, unknown>): RuntimeResult<unknown>;
    dispatchConsoleInput(processAppId: string, line: string): RuntimeResult<unknown>;
    dispatchKeyboardEvent(processAppId: string, event: Record<string, unknown>): RuntimeResult<unknown>;
    dispatchFileOpen(processAppId: string, fileInfo: Record<string, unknown>): RuntimeResult<unknown>;
    dispatchDialogResult(processAppId: string, result: Record<string, unknown>): RuntimeResult<unknown>;
    /**
     * 在指定程序的沙箱上下文中直接執行程式碼，不呼叫任何 handler。
     * 用於執行 html-view 插件從 <script> 標籤中提取的腳本。
     */
    dispatchHtmlViewScript(processAppId: string, code: string): RuntimeResult<unknown>;

    /**
     * 在指定程序的沙箱中呼叫任意全域 handler 函式。
     * 用於 WebSocket 等非同步事件回呼，將事件推送到沙箱。
     * 若程序不存在或 handler 未定義，靜默回傳錯誤。
     */
    dispatchCustomEvent(processAppId: string, handlerName: string, arg: unknown): RuntimeResult<unknown>;
}

export type { IRuntime };
