// ── BaseRuntime ───────────────────────────────────────────────
// 所有 Runtime 引擎的抽象基底類別。
// 包含與引擎無關的公用邏輯：API 註冊表、事件派發路由、IPC、
// 事件訂閱管理，以及 Host API 表面建構工具。
// 引擎特定邏輯（程式碼執行、沙箱建立、值轉換）由子類別實作。

import type { EventBusResult } from '../kernel/types';
import type { Kernel } from '../kernel/Kernel';
import { DEFAULT_EXECUTION_TIMEOUT_MS, Permissions, Events } from '../kernel/constants';
import type { IRuntime } from './IRuntime';
import type {
    ProcessType,
    RuntimeResult,
    ProcessView,
    HostApiValue,
    HostApiFunction,
    ApiFactoryContext,
    ApiFactory,
    Message,
    BaseProcessState,
    RuntimeMemoryUsage,
} from './types';

abstract class BaseRuntime implements IRuntime {
    protected readonly kernel: Kernel;
    /** 所有程序的基礎狀態（inbox、eventSubscriptions、entryPath）。
     *  子類別可在同一個 Map 中存放更豐富的物件（例如 RuntimeProcess），
     *  因為它們結構上是 BaseProcessState 的超集。 */
    protected readonly processStates: Map<number, BaseProcessState> = new Map();
    /** 引擎內建 API（process, event, ipc 等依賴 runtime 實例狀態的 API） */
    private readonly builtinApiEntries: Map<string, { factory: ApiFactory; gates: string[]; group?: string }> = new Map();

    constructor(kernel: Kernel) {
        this.kernel = kernel;
        this.registerBuiltinApis();
    }

    // ── 受保護的 Kernel 服務存取 ────────────────────────────

    protected get processManager() { return this.kernel.resolve('processManager'); }
    protected get eventBus() { return this.kernel.resolve('eventBus'); }
    private get permissions() { return this.kernel.resolve('permissions'); }
    protected get monitor() { return this.kernel.has('systemMonitor') ? this.kernel.resolve('systemMonitor') : null; }
    protected get environmentManager() { return this.kernel.resolve('environmentManager'); }

    // ── 內建 API 註冊（僅供 registerBuiltinApis 使用）───────

    /** 註冊引擎內建 API（依賴 runtime 實例狀態，不進入中央註冊表）。 */
    private registerBuiltinApi(name: string, factory: ApiFactory, gates: string[] = [], group?: string): void {
        this.builtinApiEntries.set(name, { factory, gates, group });
    }

    // ── IRuntime: 抽象方法（由引擎子類別實作）──────────────

    abstract execute(pid: number, code: string, timeoutMs?: number, entryPath?: string): RuntimeResult<unknown>;
    abstract evaluateInContext(pid: number, code: string): RuntimeResult<unknown>;
    abstract destroyProcessRuntime(pid: number): void;
    abstract destroyAll(): void;
    abstract getMemoryUsage(): RuntimeMemoryUsage;

    // ── IRuntime: 執行逾時管理 ──────────────────────────────

    /** 設定指定 PID 程序的自訂執行逾時（毫秒）。傳入 undefined 重設為預設值。 */
    setProcessTimeout(pid: number, timeoutMs: number | undefined): void {
        const state = this.processStates.get(pid);
        if (state) {
            state.customTimeoutMs = timeoutMs;
        }
    }

    /** 取得指定 PID 程序的有效執行逾時（毫秒）。 */
    protected getProcessTimeout(pid: number): number {
        return this.processStates.get(pid)?.customTimeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS;
    }

    // ── IRuntime: 事件派發 ──────────────────────────────────

    /**
     * 語言無關的事件派發核心。
     * 在指定 PID 的沙箱中呼叫全域 handler 函式。
     * 預設實作產生 JavaScript 程式碼字串（適用於 QuickJS/ScriptRuntime），
     * 非 JS 引擎（如 Lua）的子類別應覆寫此方法以使用原生函式呼叫。
     */
    protected invokeHandler(pid: number, handlerName: string, arg: unknown): RuntimeResult<unknown> {
        const safePayload = JSON.stringify(arg);
        const safeHandler = JSON.stringify(handlerName);
        const code = `(function(){var _h=${safeHandler};if(typeof globalThis[_h]==='function'){return globalThis[_h](${safePayload})}})()`;
        return this.execute(pid, code, this.getProcessTimeout(pid));
    }

    /** 在指定 processAppId 的執行中程序上呼叫 handler。 */
    private dispatchToHandler(processAppId: string, handlerName: string, arg: unknown): RuntimeResult<unknown> {
        const proc = this.processManager.getByProcessAppId(processAppId);
        if (proc && proc.status === 'running' && this.processStates.has(proc.pid)) {
            return this.invokeHandler(proc.pid, handlerName, arg);
        }
        return { success: false, error: 'ProcessNotFound' };
    }

    dispatchUiEvent(processAppId: string, event: Record<string, unknown>): RuntimeResult<unknown> {
        return this.dispatchToHandler(processAppId, 'onWindowEvent', event);
    }

    dispatchConsoleInput(processAppId: string, line: string): RuntimeResult<unknown> {
        return this.dispatchToHandler(processAppId, 'onConsoleInput', line);
    }

    dispatchKeyboardEvent(processAppId: string, event: Record<string, unknown>): RuntimeResult<unknown> {
        return this.dispatchToHandler(processAppId, 'onKeyboardEvent', event);
    }

    dispatchFileOpen(processAppId: string, fileInfo: Record<string, unknown>): RuntimeResult<unknown> {
        return this.dispatchToHandler(processAppId, 'onFileOpen', fileInfo);
    }

    dispatchDialogResult(processAppId: string, result: Record<string, unknown>): RuntimeResult<unknown> {
        return this.dispatchToHandler(processAppId, 'onDialogResult', result);
    }

    // ── 內建 API 註冊 ───────────────────────────────────────

    private registerBuiltinApis(): void {
        this.registerBuiltinApi('process', ({ pid, process }) => ({
            pid,
            appDefId: process.appDefId,
            appId: process.processAppId,
            type: process.type,
            parentPid: process.parentPid,
            status: () => this.getProcess(pid)?.status ?? 'stopped',
            spawnChild: (appDefId?: string, type?: ProcessType) => {
                const MAX_CHILDREN = 32;
                if (process.children.size >= MAX_CHILDREN) {
                    return { success: false, error: 'TooManyChildren' };
                }
                const targetApp = typeof appDefId === 'string' && appDefId.length > 0 ? appDefId : process.appDefId;
                const launchResult = this.processManager.launch(process.processAppId, targetApp, {
                    parentPid: pid,
                    type: type ?? process.type
                });
                if (!launchResult.success || launchResult.data == null) {
                    return { success: false, error: launchResult.error ?? 'UnknownError' };
                }
                return { success: true, pid: launchResult.data };
            },
            terminateSelf: () => this.processManager.terminate(process.processAppId, pid),
            listProcesses: () => {
                if (!this.permissions.has(process.processAppId, Permissions.PROCESS_LIST)) {
                    return { success: false, error: 'PermissionDenied' };
                }
                const appManager = this.kernel.resolve('appManager');
                const all = this.processManager.getAllProcesses();
                return {
                    success: true,
                    data: all.map(p => {
                        const appDef = appManager.get(p.appDefId);
                        return {
                            pid: p.pid,
                            appDefId: p.appDefId,
                            appName: appDef?.name ?? p.appDefId,
                            type: p.type,
                            status: p.status,
                            parentPid: p.parentPid,
                        };
                    })
                };
            },
            terminateProcess: (targetPid: number) =>
                this.processManager.terminate(process.processAppId, targetPid),
        }));

        this.registerBuiltinApi('event', ({ pid, process }) => ({
            subscribe: (eventName: string) => this.subscribeProcessEvent(pid, process.processAppId, eventName),
            unsubscribe: (eventName: string) => this.unsubscribeProcessEvent(pid, process.processAppId, eventName),
            emit: (eventName: string, payload?: unknown): EventBusResult =>
                this.eventBus.emit(process.processAppId, eventName, payload)
        }));

        this.registerBuiltinApi('ipc', ({ pid, process }) => ({
            sendToParent: (payload: unknown) => this.sendToParent(process, payload),
            sendToChild: (childPid: number, payload: unknown) => this.sendToChild(process, childPid, payload),
            broadcastChildren: (payload: unknown) => this.broadcastChildren(process, payload),
            receive: () => this.readInbox(pid)
        }));

        this.registerBuiltinApi('serviceApi', ({ pid, process }) => ({
            publishHealth: (health: unknown) => {
                if (!this.permissions.has(process.processAppId, Permissions.SERVICE_PUBLISH_HEALTH)) {
                    return { success: false, error: 'PermissionDenied' };
                }
                return this.eventBus.emit(process.processAppId, Events.SERVICE_HEALTH, {
                    pid,
                    health
                });
            }
        }), ['service'], 'service');

        this.registerBuiltinApi('windowApi', ({ pid, process }) => ({
            postUiEvent: (name: string, payload?: unknown) =>
                this.eventBus.emit(process.processAppId, Events.WINDOW_UI, {
                    pid,
                    name,
                    payload
                })
        }), ['window'], 'window');
    }

    // ── API 表面建構 ────────────────────────────────────────

    /** 根據程序的權限建構完整的 Host API 表面（純 JS 物件，引擎無關）。
     *  合併來源：引擎內建 API（builtinApiEntries）+ 中央 Host API（RuntimeRegistry.hostApiEntries）。 */
    protected buildApiSurface(process: ProcessView): Record<string, HostApiValue> {
        const ctx: ApiFactoryContext = {
            pid: process.pid,
            process
        };
        const merged: Record<string, HostApiValue> = {};

        // 合併引擎內建 API + 中央 Host API（中央 API 優先覆蓋同名內建 API）
        const allEntries: [string, { factory: ApiFactory; gates: string[]; group?: string }][] = [
            ...this.builtinApiEntries,
            ...this.kernel.resolve('runtimeRegistry').getHostApiEntries(),
        ];

        for (const [name, { factory, gates, group }] of allEntries) {
            if (gates.length > 0 && !gates.some(g => this.permissions.hasAnyUnder(process.processAppId, g))) {
                continue;
            }
            const wrapped = this.wrapApiObject(name, factory(ctx), process);
            if (group) {
                const existing = (merged[group] ?? {}) as Record<string, HostApiValue>;
                Object.assign(existing, wrapped);
                merged[group] = existing;
            } else {
                Object.assign(merged, wrapped);
            }
        }

        return merged;
    }

    private wrapApiObject(apiName: string, obj: Record<string, HostApiValue>, process: ProcessView): Record<string, HostApiValue> {
        if (!this.monitor) return obj;
        const monitor = this.monitor;
        const wrapped: Record<string, HostApiValue> = {};
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'function') {
                const originalFn = value as HostApiFunction;
                wrapped[key] = ((...args: unknown[]) => {
                    const start = performance.now();
                    const result = originalFn(...args);
                    // 非同步 API：在 Promise 結算後記錄耗時與成功狀態
                    if (result instanceof Promise) {
                        result.then(
                            (resolved) => {
                                const duration = performance.now() - start;
                                const success = resolved != null && typeof resolved === 'object' && 'success' in resolved
                                    ? !!(resolved as Record<string, unknown>).success
                                    : true;
                                monitor.recordApiCall(apiName, key, process.processAppId, process.pid, duration, success);
                            },
                            (_err: unknown) => {
                                const duration = performance.now() - start;
                                monitor.recordApiCall(apiName, key, process.processAppId, process.pid, duration, false);
                            }
                        );
                    } else {
                        const duration = performance.now() - start;
                        const success = result != null && typeof result === 'object' && 'success' in result ? !!(result as Record<string, unknown>).success : true;
                        monitor.recordApiCall(apiName, key, process.processAppId, process.pid, duration, success);
                    }
                    return result;
                }) as HostApiFunction;
            } else {
                wrapped[key] = value;
            }
        }
        return wrapped;
    }

    // ── 回傳值正規化（QuickJS toHandle 使用，亦供子類別覆用）──

    protected normalizeReturnValue(value: unknown): HostApiValue {
        if (value === null || value === undefined) return value;
        if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return value;
        if (Array.isArray(value)) return value.map(v => this.normalizeReturnValue(v));
        if (typeof value === 'function') return undefined;
        if (typeof value === 'object') {
            const out: { [k: string]: HostApiValue } = {};
            for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
                out[k] = this.normalizeReturnValue(v);
            }
            return out;
        }
        return String(value);
    }

    // ── 事件訂閱管理 ────────────────────────────────────────

    protected subscribeProcessEvent(pid: number, processAppId: string, eventName: string): EventBusResult {
        const state = this.processStates.get(pid);
        if (!state) return { success: false, error: 'UnknownError' };

        if (state.eventSubscriptions.has(eventName)) {
            return { success: true };
        }

        const listener = (...args: unknown[]) => {
            if (!this.processStates.has(pid)) return;
            state.inbox.push({
                fromPid: -1,
                toPid: pid,
                type: 'event',
                channel: eventName,
                payload: args,
                timestamp: Date.now()
            });
            try {
                const safeChannel = JSON.stringify(eventName);
                const safePayload = JSON.stringify(args[0] ?? null);
                this.execute(pid, `if(typeof onEvent==='function'){onEvent(${safeChannel},${safePayload})}`, this.getProcessTimeout(pid));
            } catch (err) { console.warn('[Runtime] onEvent dispatch failed (runtime may be destroyed):', err); }
        };

        const res = this.eventBus.on(processAppId, eventName, listener);
        if (!res.success) return res;
        state.eventSubscriptions.set(eventName, listener);
        return { success: true };
    }

    protected unsubscribeProcessEvent(pid: number, processAppId: string, eventName: string): EventBusResult {
        const state = this.processStates.get(pid);
        if (!state) return { success: false, error: 'UnknownError' };

        const listener = state.eventSubscriptions.get(eventName);
        if (!listener) return { success: true };

        const res = this.eventBus.off(processAppId, eventName, listener);
        if (!res.success) return res;
        state.eventSubscriptions.delete(eventName);
        return { success: true };
    }

    // ── IPC 路由 ─────────────────────────────────────────────

    private sendToParent(process: ProcessView, payload: unknown): RuntimeResult<boolean> {
        if (!this.permissions.has(process.processAppId, Permissions.IPC_SEND_PARENT)) {
            return { success: false, error: 'PermissionDenied' };
        }
        if (process.parentPid === null) {
            return { success: false, error: 'InvalidTarget' };
        }
        return this.pushMessage(process.pid, process.parentPid, 'parent', payload);
    }

    private sendToChild(process: ProcessView, childPid: number, payload: unknown): RuntimeResult<boolean> {
        if (!this.permissions.has(process.processAppId, Permissions.IPC_SEND_CHILD)) {
            return { success: false, error: 'PermissionDenied' };
        }
        if (!process.children.has(childPid)) {
            return { success: false, error: 'InvalidTarget' };
        }
        return this.pushMessage(process.pid, childPid, 'child', payload);
    }

    private broadcastChildren(process: ProcessView, payload: unknown): RuntimeResult<number> {
        if (!this.permissions.has(process.processAppId, Permissions.IPC_SEND_CHILD)) {
            return { success: false, error: 'PermissionDenied' };
        }
        let sent = 0;
        for (const childPid of process.children) {
            const sentRes = this.pushMessage(process.pid, childPid, 'child', payload);
            if (sentRes.success) sent += 1;
        }
        return { success: true, data: sent };
    }

    protected pushMessage(fromPid: number, toPid: number, channel: string, payload: unknown): RuntimeResult<boolean> {
        const MAX_INBOX_SIZE = 256;
        const INBOX_WARN_THRESHOLD = Math.floor(MAX_INBOX_SIZE * 0.8);
        const targetProc = this.getProcess(toPid);
        if (!targetProc || targetProc.status !== 'running') {
            return { success: false, error: 'ProcessNotFound' };
        }

        const targetState = this.processStates.get(toPid);
        if (!targetState) {
            return { success: false, error: 'ProcessNotFound' };
        }

        if (targetState.inbox.length >= MAX_INBOX_SIZE) {
            return { success: false, error: 'InboxFull' };
        }

        const message: Message = {
            fromPid,
            toPid,
            type: 'ipc',
            channel,
            payload,
            timestamp: Date.now()
        };
        targetState.inbox.push(message);

        if (targetState.inbox.length === INBOX_WARN_THRESHOLD) {
            this.eventBus.emit(targetProc.processAppId, Events.PROCESS_INBOX_NEAR_FULL, {
                pid: toPid,
                inboxSize: targetState.inbox.length,
                maxInboxSize: MAX_INBOX_SIZE,
            });
        }

        // 自動呼叫目標程序的 onMessage 回呼（若存在）
        try {
            const safeMsg = JSON.stringify({ fromPid: message.fromPid, channel: message.channel, payload: message.payload, timestamp: message.timestamp });
            this.execute(toPid, `if(typeof onMessage==='function'){onMessage(${safeMsg})}`, this.getProcessTimeout(toPid));
        } catch (err) {
            // JSON.stringify may fail on circular references; log and continue
            console.warn('[Runtime] onMessage dispatch failed:', err);
        }

        return { success: true, data: true };
    }

    protected readInbox(pid: number): Message[] {
        const state = this.processStates.get(pid);
        if (!state) return [];
        const snapshot = [...state.inbox];
        state.inbox.length = 0;
        return snapshot;
    }

    // ── 輔助方法 ────────────────────────────────────────────

    protected getProcess(pid: number): ProcessView | undefined {
        return this.processManager.get(pid) as unknown as ProcessView | undefined;
    }
}

export { BaseRuntime };
