import { shouldInterruptAfterDeadline } from 'quickjs-emscripten';
import type { EventBusResult } from '../kernel/types';
import type { Kernel } from '../kernel/Kernel';
import { DEFAULT_EXECUTION_TIMEOUT_MS, Permissions, Events } from '../kernel/constants';
import { getQuickJSInstance } from './QuickJsInit';
import type {
    ProcessType,
    ApiScope,
    RuntimeResult,
    ProcessView,
    HostApiValue,
    HostApiFunction,
    ApiFactoryContext,
    ApiFactory,
    Message,
    RuntimeProcess,
} from './types';

class ScriptRuntime {
    private readonly kernel: Kernel;
    private readonly processRuntimes: Map<number, RuntimeProcess> = new Map();
    private readonly apiFactories: Map<ApiScope, Map<string, ApiFactory>> = new Map();

    constructor(kernel: Kernel) {
        this.kernel = kernel;
        this.apiFactories.set('all', new Map());
        this.apiFactories.set('service', new Map());
        this.apiFactories.set('window', new Map());
        this.apiFactories.set('console', new Map());
        this.apiFactories.set('library', new Map());
        this.registerBuiltinApis();
    }

    private get processManager() { return this.kernel.resolve('processManager'); }
    private get eventBus() { return this.kernel.resolve('eventBus'); }
    private get permissions() { return this.kernel.resolve('permissions'); }
    private get monitor() { return this.kernel.has('systemMonitor') ? this.kernel.resolve('systemMonitor') : null; }

    registerApi(name: string, factory: ApiFactory, scope: ApiScope = 'all'): void {
        this.apiFactories.get(scope)!.set(name, factory);
    }

    unregisterApi(name: string, scope: ApiScope = 'all'): boolean {
        return this.apiFactories.get(scope)!.delete(name);
    }

    execute(pid: number, code: string, timeoutMs = DEFAULT_EXECUTION_TIMEOUT_MS, entryPath?: string): RuntimeResult<unknown> {
        const proc = this.getProcess(pid);
        if (!proc) return { success: false, error: 'ProcessNotFound' };
        if (proc.status !== 'running') return { success: false, error: 'ProcessNotRunning' };

        const runtimeProcess = this.ensureRuntimeProcess(proc);
        if (entryPath !== undefined) {
            runtimeProcess.entryPath = entryPath;
        }
        this.injectApis(runtimeProcess.context, proc);

        runtimeProcess.runtime.setInterruptHandler(
            shouldInterruptAfterDeadline(Date.now() + timeoutMs)
        );

        const startTime = performance.now();
        const result = runtimeProcess.context.evalCode(code);
        const duration = performance.now() - startTime;
        this.monitor?.recordExecution(pid, duration);

        if (result.error) {
            const err = runtimeProcess.context.dump(result.error);
            result.error.dispose();
            return { success: false, error: 'RuntimeError', data: err };
        }
        const value = runtimeProcess.context.dump(result.value);
        result.value.dispose();
        return { success: true, data: value };
    }

    destroyProcessRuntime(pid: number): void {
        const runtimeProcess = this.processRuntimes.get(pid);
        if (!runtimeProcess) return;
        this.processRuntimes.delete(pid);
        const proc = this.getProcess(pid);
        if (proc) {
            for (const [eventName, listener] of runtimeProcess.eventSubscriptions) {
                this.eventBus.off(proc.processAppId, eventName, listener);
            }
        }
        // 釋放模組快取中的 QuickJS handle
        for (const handle of runtimeProcess.moduleCache.values()) {
            try { (handle as any).dispose(); } catch { /* already disposed */ }
        }
        runtimeProcess.moduleCache.clear();
        // 清理所有 host-side timers
        for (const hostId of runtimeProcess.timers) {
            window.clearTimeout(hostId);
            window.clearInterval(hostId);
        }
        runtimeProcess.timers.clear();
        runtimeProcess.timerMap.clear();
        // 釋放 timer callback handles，避免 GC assertion 錯誤
        for (const cb of runtimeProcess.timerCallbacks.values()) {
            try { cb.dispose(); } catch { /* already disposed */ }
        }
        runtimeProcess.timerCallbacks.clear();
        try { runtimeProcess.context.dispose(); } catch { /* already disposed or in-flight */ }
        try { runtimeProcess.runtime.dispose(); } catch { /* already disposed */ }
    }

    destroyAll(): void {
        for (const pid of Array.from(this.processRuntimes.keys())) {
            this.destroyProcessRuntime(pid);
        }
    }

    /** 在已存在的程序上下文中執行代碼（不重新注入 API），用於載入程式庫 */
    evaluateInContext(pid: number, code: string): RuntimeResult<unknown> {
        const runtimeProcess = this.processRuntimes.get(pid);
        if (!runtimeProcess) return { success: false, error: 'ProcessNotFound' };

        const result = runtimeProcess.context.evalCode(code);
        if (result.error) {
            const err = runtimeProcess.context.dump(result.error);
            result.error.dispose();
            return { success: false, error: 'RuntimeError', data: err };
        }
        const value = runtimeProcess.context.dump(result.value);
        result.value.dispose();
        return { success: true, data: value };
    }

    dispatchUiEvent(processAppId: string, event: Record<string, unknown>): RuntimeResult<unknown> {
        for (const [pid] of this.processRuntimes) {
            const proc = this.getProcess(pid);
            if (proc && proc.processAppId === processAppId && proc.status === 'running') {
                const payload = JSON.stringify(event);
                return this.execute(pid, `if(typeof onWindowEvent==='function'){onWindowEvent(${payload})}`, DEFAULT_EXECUTION_TIMEOUT_MS);
            }
        }
        return { success: false, error: 'ProcessNotFound' };
    }

    dispatchConsoleInput(processAppId: string, line: string): RuntimeResult<unknown> {
        for (const [pid] of this.processRuntimes) {
            const proc = this.getProcess(pid);
            if (proc && proc.processAppId === processAppId && proc.status === 'running') {
                const escaped = JSON.stringify(line);
                return this.execute(pid, `if(typeof onConsoleInput==='function'){onConsoleInput(${escaped})}`, DEFAULT_EXECUTION_TIMEOUT_MS);
            }
        }
        return { success: false, error: 'ProcessNotFound' };
    }

    // ── 內建 API 註冊 ──────────────────────────────────────

    private registerBuiltinApis(): void {
        this.registerApi('process', ({ pid, process }) => ({
            pid,
            appDefId: process.appDefId,
            appId: process.processAppId,
            type: process.type,
            parentPid: process.parentPid,
            status: () => this.getProcess(pid)?.status ?? 'stopped',
            spawnChild: (appDefId?: string, type?: ProcessType) => {
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
                const all = this.processManager.getAllProcesses();
                return {
                    success: true,
                    data: all.map(p => ({
                        pid: p.pid,
                        appDefId: p.appDefId,
                        type: p.type,
                        status: p.status,
                        parentPid: p.parentPid,
                    }))
                };
            },
            terminateProcess: (targetPid: number) =>
                this.processManager.terminate(process.processAppId, targetPid),
        }));

        this.registerApi('event', ({ pid, process }) => ({
            subscribe: (eventName: string) => this.subscribeProcessEvent(pid, process.processAppId, eventName),
            unsubscribe: (eventName: string) => this.unsubscribeProcessEvent(pid, process.processAppId, eventName),
            emit: (eventName: string, payload?: unknown): EventBusResult =>
                this.eventBus.emit(process.processAppId, eventName, payload)
        }));

        this.registerApi('ipc', ({ pid, process }) => ({
            sendToParent: (payload: unknown) => this.sendToParent(process, payload),
            sendToChild: (childPid: number, payload: unknown) => this.sendToChild(process, childPid, payload),
            broadcastChildren: (payload: unknown) => this.broadcastChildren(process, payload),
            receive: () => this.readInbox(pid)
        }));

        this.registerApi('serviceApi', ({ pid, process }) => ({
            publishHealth: (health: unknown) => {
                if (!this.permissions.has(process.processAppId, Permissions.SERVICE_PUBLISH_HEALTH)) {
                    return { success: false, error: 'PermissionDenied' };
                }
                return this.eventBus.emit(process.processAppId, Events.SERVICE_HEALTH, {
                    pid,
                    health
                });
            }
        }), 'service');

        this.registerApi('windowApi', ({ pid, process }) => ({
            postUiEvent: (name: string, payload?: unknown) =>
                this.eventBus.emit(process.processAppId, Events.WINDOW_UI, {
                    pid,
                    name,
                    payload
                })
        }), 'window');

        this.registerApi('consoleApi', ({ pid, process }) => ({
            writeLine: (text: unknown) => {
                if (!this.permissions.has(process.processAppId, Permissions.CONSOLE_WRITE)) {
                    return { success: false, error: 'PermissionDenied' };
                }
                const message = String(text);
                this.eventBus.emit(process.processAppId, Events.CONSOLE_OUTPUT, {
                    pid,
                    message
                });
                return true;
            }
        }), 'console');
    }

    // ── Runtime 管理 ────────────────────────────────────────

    private ensureRuntimeProcess(proc: ProcessView): RuntimeProcess {
        const existing = this.processRuntimes.get(proc.pid);
        if (existing) return existing;
        const QuickJS = getQuickJSInstance();
        const runtime = QuickJS.newRuntime();
        const context = runtime.newContext();
        const runtimeProcess: RuntimeProcess = {
            runtime,
            context,
            inbox: [],
            eventSubscriptions: new Map(),
            moduleCache: new Map(),
            entryPath: null,
            timers: new Set(),
            timerMap: new Map(),
            timerCallbacks: new Map(),
            timerNextId: 1,
        };
        this.processRuntimes.set(proc.pid, runtimeProcess);
        return runtimeProcess;
    }

    // ── API 注入 / 編排 ─────────────────────────────────────

    private injectApis(context: any, process: ProcessView): void {
        const runtimeProcess = this.processRuntimes.get(process.pid);
        const global = context.global;
        const sentryApi = context.newObject();
        const surface = this.buildApiSurface(process);

        for (const [name, value] of Object.entries(surface)) {
            const handle = this.toHandle(context, value);
            context.setProp(sentryApi, name, handle);
            handle.dispose();
        }

        context.setProp(global, 'Sentry', sentryApi);
        sentryApi.dispose();

        const prelude = context.evalCode(`
            globalThis.processApi = Sentry.process;
            globalThis.eventApi = Sentry.event;
            globalThis.ipcApi = Sentry.ipc;
            globalThis.ui = Sentry.ui ?? {};
            globalThis.serviceApi = Sentry.serviceApi ?? {};
            globalThis.windowApi = Sentry.windowApi ?? {};
            globalThis.consoleApi = Sentry.consoleApi ?? {};
            globalThis.systemApi = Sentry.systemApi ?? {};
            globalThis.storageApi = Sentry.storageApi ?? {};
            globalThis.envApi = Sentry.envApi ?? {};
            globalThis.shellApi = Sentry.shellApi ?? {};
            globalThis.notificationApi = Sentry.notificationApi ?? {};
            globalThis.monitorApi = Sentry.monitorApi ?? {};
            globalThis.settingsApi = Sentry.settingsApi ?? {};
            globalThis.networkApi = Sentry.networkApi ?? {};
        `);
        if (!prelude.error) {
            prelude.value.dispose();
        } else {
            prelude.error.dispose();
        }

        // 注入 imports() 函式（僅限有 entryPath 的程序）
        if (runtimeProcess?.entryPath) {
            this.injectImportsFunction(context, global, runtimeProcess);
        }

        // 注入 timer 函式
        if (runtimeProcess) {
            this.injectTimerFunctions(context, global, process.pid, runtimeProcess);
        }

        global.dispose();
    }

    private buildApiSurface(process: ProcessView): Record<string, HostApiValue> {
        const ctx: ApiFactoryContext = {
            pid: process.pid,
            process
        };
        const scope = this.scopeFromType(process.type);
        const merged: Record<string, HostApiValue> = {};

        const allFactories = this.apiFactories.get('all')!;
        for (const [name, factory] of allFactories) {
            merged[name] = this.wrapApiObject(name, factory(ctx), process);
        }

        const scopedFactories = this.apiFactories.get(scope)!;
        for (const [name, factory] of scopedFactories) {
            merged[name] = this.wrapApiObject(name, factory(ctx), process);
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
                wrapped[key] = ((...args: any[]) => {
                    const start = performance.now();
                    const result = originalFn(...args);
                    const duration = performance.now() - start;
                    const success = result != null && typeof result === 'object' && 'success' in result ? !!(result as any).success : true;
                    monitor.recordApiCall(apiName, key, process.processAppId, process.pid, duration, success);
                    return result;
                }) as HostApiFunction;
            } else {
                wrapped[key] = value;
            }
        }
        return wrapped;
    }

    private scopeFromType(type: ProcessType): ApiScope {
        if (type === 'Service') return 'service';
        if (type === 'Window') return 'window';
        if (type === 'Library') return 'library';
        return 'console';
    }

    // ── imports() 機制 ──────────────────────────────────────

    /**
     * 注入 imports() 全域函式，讓應用程式可以載入同一套件中的其他檔案。
     * 使用 CommonJS-like 的 module.exports 慣例。
     */
    private injectImportsFunction(context: any, global: any, runtimeProcess: RuntimeProcess): void {
        const self = this;

        const throwImportError = (msg: string) => {
            const err = context.newError(msg);
            return { error: err };
        };

        const importsFn = context.newFunction('imports', (...args: any[]) => {
            if (args.length === 0) {
                return throwImportError('imports() requires a module path argument');
            }

            const modulePath = context.dump(args[0]);
            if (typeof modulePath !== 'string' || modulePath.length === 0) {
                return throwImportError('imports() argument must be a non-empty string');
            }

            const entryPath = runtimeProcess.entryPath;
            if (!entryPath) {
                return throwImportError('imports() is not available in this context');
            }

            // 解析並驗證路徑
            const resolved = self.resolveModulePath(entryPath, modulePath);
            if ('error' in resolved) {
                return throwImportError(`imports('${modulePath}'): ${resolved.error}`);
            }
            const resolvedPath = resolved.path;

            // 快取命中：回傳 handle 的複本（保留函式等不可序列化的值）
            if (runtimeProcess.moduleCache.has(resolvedPath)) {
                const cached = runtimeProcess.moduleCache.get(resolvedPath) as any;
                return cached.dup();
            }

            // 同步載入檔案
            const code = self.syncFetch(resolvedPath);
            if (code === null) {
                return throwImportError(`imports('${modulePath}'): module not found at '${resolvedPath}'`);
            }

            // 以 CommonJS-like IIFE 包裝，提供 module.exports / exports
            const wrapped =
                '(function(){var module={exports:{}};var exports=module.exports;\n' +
                code +
                '\n;return module.exports;})()';

            const result = context.evalCode(wrapped);
            if (result.error) {
                const err = context.dump(result.error);
                result.error.dispose();
                const detail = typeof err === 'object' && err?.message ? err.message : String(err);
                return throwImportError(`imports('${modulePath}'): ${detail}`);
            }

            // 快取 QuickJS handle（保持存活），回傳複本給呼叫端
            runtimeProcess.moduleCache.set(resolvedPath, result.value);
            return result.value.dup();
        });

        context.setProp(global, 'imports', importsFn);
        importsFn.dispose();
    }

    // ── Timer 注入 ──────────────────────────────────────────

    /**
     * 注入 setTimeout / setInterval / clearTimeout / clearInterval。
     * 回呼在 host-side 觸發後透過 context.callFunction 呼叫 QuickJS 函式。
     */
    private injectTimerFunctions(context: any, global: any, pid: number, runtimeProcess: RuntimeProcess): void {
        const self = this;

        const makeTimerFn = (repeat: boolean) =>
            context.newFunction(repeat ? 'setInterval' : 'setTimeout', (...args: any[]) => {
                if (args.length === 0) return context.undefined;
                const callbackHandle = args[0];
                if (typeof context.typeof(callbackHandle) !== 'string' || context.typeof(callbackHandle) !== 'function') {
                    // 嘗試當作 function handle 使用，即使 typeof 不精確也放行
                }
                const delay = args.length > 1 ? (context.dump(args[1]) ?? 0) : 0;

                const callbackDup = callbackHandle.dup();
                const guestId = runtimeProcess.timerNextId++;

                const hostFn = repeat ? window.setInterval : window.setTimeout;
                const hostId = hostFn(() => {
                    // 若 process 已銷毀，清理自身
                    if (!self.processRuntimes.has(pid)) {
                        window.clearInterval(hostId);
                        window.clearTimeout(hostId);
                        return;
                    }
                    try {
                        const result = context.callFunction(callbackDup, context.undefined);
                        if (result.error) {
                            result.error.dispose();
                        } else {
                            result.value.dispose();
                        }
                        context.runtime.executePendingJobs();
                    } catch { /* context may be disposed */ }

                    // 單次 timer 觸發後自動清理
                    if (!repeat) {
                        runtimeProcess.timers.delete(hostId);
                        runtimeProcess.timerMap.delete(guestId);
                        runtimeProcess.timerCallbacks.delete(guestId);
                        try { callbackDup.dispose(); } catch { /* noop */ }
                    }
                }, delay) as unknown as number;

                runtimeProcess.timers.add(hostId);
                runtimeProcess.timerMap.set(guestId, hostId);
                runtimeProcess.timerCallbacks.set(guestId, callbackDup);

                return context.newNumber(guestId);
            });

        const makeClearFn = (name: string) =>
            context.newFunction(name, (...args: any[]) => {
                if (args.length === 0) return context.undefined;
                const guestId = context.dump(args[0]);
                if (typeof guestId !== 'number') return context.undefined;
                const hostId = runtimeProcess.timerMap.get(guestId);
                if (hostId !== undefined) {
                    window.clearTimeout(hostId);
                    window.clearInterval(hostId);
                    runtimeProcess.timers.delete(hostId);
                    runtimeProcess.timerMap.delete(guestId);
                    const cb = runtimeProcess.timerCallbacks.get(guestId);
                    if (cb) { try { cb.dispose(); } catch { /* noop */ } }
                    runtimeProcess.timerCallbacks.delete(guestId);
                }
                return context.undefined;
            });

        const setTimeoutFn = makeTimerFn(false);
        const setIntervalFn = makeTimerFn(true);
        const clearTimeoutFn = makeClearFn('clearTimeout');
        const clearIntervalFn = makeClearFn('clearInterval');

        context.setProp(global, 'setTimeout', setTimeoutFn);
        context.setProp(global, 'setInterval', setIntervalFn);
        context.setProp(global, 'clearTimeout', clearTimeoutFn);
        context.setProp(global, 'clearInterval', clearIntervalFn);

        setTimeoutFn.dispose();
        setIntervalFn.dispose();
        clearTimeoutFn.dispose();
        clearIntervalFn.dispose();
    }

    /**
     * 將相對模組路徑解析為絕對 URL 路徑，並驗證不會逃離套件目錄。
     */
    private resolveModulePath(entryPath: string, modulePath: string): { path: string } | { error: string } {
        // 拒絕絕對路徑
        if (modulePath.startsWith('/') || modulePath.startsWith('\\')) {
            return { error: 'absolute paths are not allowed' };
        }
        // 拒絕含有 protocol 的路徑
        if (/^[a-z]+:/i.test(modulePath)) {
            return { error: 'protocol paths are not allowed' };
        }

        try {
            const base = new URL(entryPath + '/', globalThis.location.origin);
            const resolved = new URL(modulePath, base);

            // 必須同源
            if (resolved.origin !== globalThis.location.origin) {
                return { error: 'cross-origin imports are not allowed' };
            }

            const resolvedPath = resolved.pathname;
            const boundary = entryPath.endsWith('/') ? entryPath : entryPath + '/';

            // 安全性：解析後的路徑必須在套件目錄內，禁止跨應用程式存取
            if (!resolvedPath.startsWith(boundary)) {
                return { error: `cannot access files outside the application package ('${boundary}')` };
            }

            return { path: resolvedPath };
        } catch {
            return { error: 'invalid module path' };
        }
    }

    /**
     * 同步讀取指定路徑的檔案內容（使用 XMLHttpRequest 同步模式）。
     */
    private syncFetch(path: string): string | null {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', path, false);
            xhr.send();
            return xhr.status === 200 ? xhr.responseText : null;
        } catch {
            return null;
        }
    }

    // ── 型別轉換 ────────────────────────────────────────────

    private toHandle(context: any, value: HostApiValue): any {
        if (value === null) return context.null;
        if (value === undefined) return context.undefined;
        if (typeof value === 'boolean') return value ? context.true : context.false;
        if (typeof value === 'number') return context.newNumber(value);
        if (typeof value === 'string') return context.newString(value);

        if (typeof value === 'function') {
            return context.newFunction('hostApiFn', (...args: any[]) => {
                const jsArgs = args.map((arg) => context.dump(arg));
                const out = (value as HostApiFunction)(...jsArgs);
                return this.toHandle(context, this.normalizeReturnValue(out));
            });
        }

        if (Array.isArray(value)) {
            const arr = context.newArray();
            value.forEach((item, index) => {
                const itemHandle = this.toHandle(context, item);
                context.setProp(arr, index, itemHandle);
                itemHandle.dispose();
            });
            return arr;
        }

        const obj = context.newObject();
        for (const [k, v] of Object.entries(value)) {
            const child = this.toHandle(context, v as HostApiValue);
            context.setProp(obj, k, child);
            child.dispose();
        }
        return obj;
    }

    private normalizeReturnValue(value: unknown): HostApiValue {
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

    private subscribeProcessEvent(pid: number, processAppId: string, eventName: string): EventBusResult {
        const runtimeProcess = this.processRuntimes.get(pid);
        if (!runtimeProcess) return { success: false, error: 'UnknownError' };

        if (runtimeProcess.eventSubscriptions.has(eventName)) {
            return { success: true };
        }

        const listener = (...args: unknown[]) => {
            if (!this.processRuntimes.has(pid)) return;
            runtimeProcess.inbox.push({
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
                this.execute(pid, `if(typeof onEvent==='function'){onEvent(${safeChannel},${safePayload})}`, DEFAULT_EXECUTION_TIMEOUT_MS);
            } catch { /* runtime may have been destroyed during termination — safe to ignore */ }
        };

        const res = this.eventBus.on(processAppId, eventName, listener);
        if (!res.success) return res;
        runtimeProcess.eventSubscriptions.set(eventName, listener);
        return { success: true };
    }

    private unsubscribeProcessEvent(pid: number, processAppId: string, eventName: string): EventBusResult {
        const runtimeProcess = this.processRuntimes.get(pid);
        if (!runtimeProcess) return { success: false, error: 'UnknownError' };

        const listener = runtimeProcess.eventSubscriptions.get(eventName);
        if (!listener) return { success: true };

        const res = this.eventBus.off(processAppId, eventName, listener);
        if (!res.success) return res;
        runtimeProcess.eventSubscriptions.delete(eventName);
        return { success: true };
    }

    // ── IPC 路由 ────────────────────────────────────────────

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

    private pushMessage(fromPid: number, toPid: number, channel: string, payload: unknown): RuntimeResult<boolean> {
        const targetProc = this.getProcess(toPid);
        if (!targetProc || targetProc.status !== 'running') {
            return { success: false, error: 'ProcessNotFound' };
        }

        const targetRuntime = this.ensureRuntimeProcess(targetProc);
        targetRuntime.inbox.push({
            fromPid,
            toPid,
            type: 'ipc',
            channel,
            payload,
            timestamp: Date.now()
        });
        return { success: true, data: true };
    }

    private readInbox(pid: number): Message[] {
        const runtimeProcess = this.processRuntimes.get(pid);
        if (!runtimeProcess) return [];
        const snapshot = [...runtimeProcess.inbox];
        runtimeProcess.inbox.length = 0;
        return snapshot;
    }

    private getProcess(pid: number): ProcessView | undefined {
        return this.processManager.get(pid) as unknown as ProcessView | undefined;
    }
}

export { ScriptRuntime };
