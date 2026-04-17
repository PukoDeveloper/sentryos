// ── AdapterRuntime ─────────────────────────────────────────────
// 基於 RuntimeAdapter 的 Runtime 實作。
// 插件開發者只需提供沙箱的建立/注入/執行/銷毀邏輯，
// IPC、事件訂閱、API 表面建構等引擎無關的邏輯全部由 BaseRuntime 處理。

import type { Kernel } from '../kernel/Kernel';
import { BaseRuntime } from './BaseRuntime';
import type { RuntimeResult, RuntimeAdapter, BaseProcessState } from './types';

class AdapterRuntime extends BaseRuntime {
    private readonly adapter: RuntimeAdapter;
    private readonly sandboxes = new Map<number, unknown>();

    constructor(kernel: Kernel, adapter: RuntimeAdapter) {
        super(kernel);
        this.adapter = adapter;
    }

    // ── IRuntime: 程式碼執行 ─────────────────────────────────

    execute(pid: number, code: string, timeoutMs?: number, entryPath?: string): RuntimeResult<unknown> {
        const proc = this.getProcess(pid);
        if (!proc) return { success: false, error: 'ProcessNotFound' };
        if (proc.status !== 'running') return { success: false, error: 'ProcessNotRunning' };

        if (!this.sandboxes.has(pid)) {
            const sandbox = this.adapter.createSandbox(pid);
            this.sandboxes.set(pid, sandbox);
            const state: BaseProcessState = {
                inbox: [],
                eventSubscriptions: new Map(),
                entryPath: entryPath ?? null,
            };
            this.processStates.set(pid, state);
            const apiSurface = this.buildApiSurface(proc);
            this.adapter.injectGlobals(sandbox, apiSurface);
        }

        const sandbox = this.sandboxes.get(pid)!;
        try {
            const result = this.adapter.execute(sandbox, code, timeoutMs);
            return { success: true, data: this.normalizeReturnValue(result) };
        } catch (err) {
            return { success: false, error: 'RuntimeError', data: err instanceof Error ? err.message : String(err) };
        }
    }

    evaluateInContext(pid: number, code: string): RuntimeResult<unknown> {
        const sandbox = this.sandboxes.get(pid);
        if (!sandbox) return { success: false, error: 'ProcessNotFound' };

        try {
            const result = this.adapter.execute(sandbox, code);
            return { success: true, data: this.normalizeReturnValue(result) };
        } catch (err) {
            return { success: false, error: 'RuntimeError', data: err instanceof Error ? err.message : String(err) };
        }
    }

    // ── IRuntime: 程序生命週期 ───────────────────────────────

    destroyProcessRuntime(pid: number): void {
        const sandbox = this.sandboxes.get(pid);
        if (sandbox) {
            try { this.adapter.destroy(sandbox); } catch (err) { console.warn('[AdapterRuntime] destroy failed:', err); }
            this.sandboxes.delete(pid);
        }

        const state = this.processStates.get(pid);
        if (state) {
            const proc = this.getProcess(pid);
            if (proc) {
                for (const [eventName, listener] of state.eventSubscriptions) {
                    this.eventBus.off(proc.processAppId, eventName, listener);
                }
            }
            this.processStates.delete(pid);
        }
    }

    destroyAll(): void {
        for (const pid of Array.from(this.sandboxes.keys())) {
            this.destroyProcessRuntime(pid);
        }
    }
}

export { AdapterRuntime };
