import { getQuickJS, QuickJSWASMModule, shouldInterruptAfterDeadline } from 'quickjs-emscripten';
import type { EventBusResult } from './types';
import EventBus from './EventBus';
import PermissionsManager from './PermissionsManager';
import { ProcessManager } from './App';
import { DEFAULT_EXECUTION_TIMEOUT_MS, Permissions, Events, type AppType } from './constants';
import type { SystemMonitor } from './SystemMonitor';

var QuickJS: QuickJSWASMModule;
export async function initializeQuickJS() {
    if (!QuickJS) {
        QuickJS = await getQuickJS();
    }
}

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

export class ScriptRuntime {
    private readonly processManager: ProcessManager;
    private readonly eventBus: EventBus;
    private readonly permissions: PermissionsManager;
    private readonly processRuntimes: Map<number, RuntimeProcess> = new Map();
    private readonly apiFactories: Map<ApiScope, Map<string, ApiFactory>> = new Map();
    private monitor: SystemMonitor | null = null;

    constructor(
        _systemAppId: string,
        processManager: ProcessManager,
        eventBus: EventBus,
        permissions: PermissionsManager
    ) {
        this.processManager = processManager;
        this.eventBus = eventBus;
        this.permissions = permissions;
        this.apiFactories.set('all', new Map());
        this.apiFactories.set('service', new Map());
        this.apiFactories.set('window', new Map());
        this.apiFactories.set('console', new Map());
        this.apiFactories.set('library', new Map());
        this.registerBuiltinApis();
    }

    setMonitor(monitor: SystemMonitor): void {
        this.monitor = monitor;
    }

    registerApi(name: string, factory: ApiFactory, scope: ApiScope = 'all'): void {
        this.apiFactories.get(scope)!.set(name, factory);
        // 已存在的程序在下次 execute 時會自動重建注入內容
    }

    unregisterApi(name: string, scope: ApiScope = 'all'): boolean {
        return this.apiFactories.get(scope)!.delete(name);
    }

    execute(pid: number, code: string, timeoutMs = DEFAULT_EXECUTION_TIMEOUT_MS): RuntimeResult<unknown> {
        const proc = this.getProcess(pid);
        if (!proc) return { success: false, error: 'ProcessNotFound' };
        if (proc.status !== 'running') return { success: false, error: 'ProcessNotRunning' };

        const runtimeProcess = this.ensureRuntimeProcess(proc);
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
        // Remove from map first so no further execute() calls can target this runtime
        this.processRuntimes.delete(pid);
        const proc = this.getProcess(pid);
        if (proc) {
            for (const [eventName, listener] of runtimeProcess.eventSubscriptions) {
                this.eventBus.off(proc.processAppId, eventName, listener);
            }
        }
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

    private ensureRuntimeProcess(proc: ProcessView): RuntimeProcess {
        const existing = this.processRuntimes.get(proc.pid);
        if (existing) return existing;
        const runtime = QuickJS.newRuntime();
        const context = runtime.newContext();
        const runtimeProcess: RuntimeProcess = {
            runtime,
            context,
            inbox: [],
            eventSubscriptions: new Map()
        };
        this.processRuntimes.set(proc.pid, runtimeProcess);
        return runtimeProcess;
    }

    private injectApis(context: any, process: ProcessView): void {
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
            globalThis.envApi = Sentry.envApi ?? {};            globalThis.shellApi   = Sentry.shellApi ?? {};            globalThis.notificationApi = Sentry.notificationApi ?? {};            globalThis.monitorApi = Sentry.monitorApi ?? {};        `);
        if (!prelude.error) {
            prelude.value.dispose();
        } else {
            prelude.error.dispose();
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

    private subscribeProcessEvent(pid: number, processAppId: string, eventName: string): EventBusResult {
        const runtimeProcess = this.processRuntimes.get(pid);
        if (!runtimeProcess) return { success: false, error: 'UnknownError' };

        if (runtimeProcess.eventSubscriptions.has(eventName)) {
            return { success: true };
        }

        const listener = (...args: unknown[]) => {
            // Guard: runtime may have been destroyed by a prior handler in the same emit cycle
            if (!this.processRuntimes.has(pid)) return;
            runtimeProcess.inbox.push({
                fromPid: -1,
                toPid: pid,
                type: 'event',
                channel: eventName,
                payload: args,
                timestamp: Date.now()
            });
            // Dispatch real-time onEvent handler if defined
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