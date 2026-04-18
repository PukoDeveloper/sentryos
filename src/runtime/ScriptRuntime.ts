// ── ScriptRuntime ─────────────────────────────────────────────
// QuickJS-emscripten 引擎的 Runtime 實作。
// 繼承 BaseRuntime（包含所有引擎無關的公用邏輯），
// 本類別只負責 QuickJS 特有的沙箱建立、程式碼執行、API 注入與資源釋放。

import { shouldInterruptAfterDeadline } from 'quickjs-emscripten';
import type { QuickJSContext, QuickJSHandle } from 'quickjs-emscripten';
import type { Kernel } from '../kernel/Kernel';
import { DEFAULT_EXECUTION_TIMEOUT_MS } from '../kernel/constants';
import { getQuickJSInstance } from './QuickJsInit';
import { BaseRuntime } from './BaseRuntime';
import type { IRuntime } from './IRuntime';
import type {
    RuntimeResult,
    ProcessView,
    HostApiValue,
    HostApiFunction,
    RuntimeProcess,
    RuntimeMemoryUsage,
    ResponseType,
} from './types';

class ScriptRuntime extends BaseRuntime implements IRuntime {
    constructor(kernel: Kernel) {
        super(kernel);
    }

    // ── IRuntime: 程式碼執行 ─────────────────────────────────

    execute(pid: number, code: string, timeoutMs = DEFAULT_EXECUTION_TIMEOUT_MS, entryPath?: string): RuntimeResult<unknown> {
        const proc = this.getProcess(pid);
        if (!proc) return { success: false, error: 'ProcessNotFound' };
        if (proc.status !== 'running') return { success: false, error: 'ProcessNotRunning' };

        const runtimeProcess = this.ensureRuntimeProcess(proc);
        if (entryPath !== undefined) {
            runtimeProcess.entryPath = entryPath;
            // Inject imports() lazily on first entryPath assignment
            if (!runtimeProcess.importsInjected) {
                runtimeProcess.importsInjected = true;
                const global = runtimeProcess.context.global;
                try {
                    this.injectImportCommand(runtimeProcess.context, runtimeProcess); //TIP: 取代imports()載入方法，採用ESModule-like的全域函式實作，提供更靈活的模組載入能力
                    this.injectImportsFunction(runtimeProcess.context, global, runtimeProcess);
                } finally {
                    global.dispose();
                }
            }
        }

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

    /** 在已存在的程序上下文中執行代碼（不重新注入 API），用於載入程式庫 */
    evaluateInContext(pid: number, code: string): RuntimeResult<unknown> {
        const runtimeProcess = this.processStates.get(pid) as RuntimeProcess | undefined;
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

    // ── IRuntime: 程序生命週期 ───────────────────────────────

    destroyProcessRuntime(pid: number): void {
        const runtimeProcess = this.processStates.get(pid) as RuntimeProcess | undefined;
        if (!runtimeProcess) return;
        this.processStates.delete(pid);
        const proc = this.getProcess(pid);
        if (proc) {
            for (const [eventName, listener] of runtimeProcess.eventSubscriptions) {
                this.eventBus.off(proc.processAppId, eventName, listener);
            }
        }
        // 釋放模組快取中的 QuickJS handle
        for (const handle of runtimeProcess.moduleCache.values()) {
            try { handle.dispose(); } catch { /* already disposed */ }
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
        try { runtimeProcess.context.dispose(); } catch (err) { console.warn('[Runtime] context.dispose failed:', err); }
        try { runtimeProcess.runtime.dispose(); } catch (err) { console.warn('[Runtime] runtime.dispose failed:', err); }
    }

    destroyAll(): void {
        for (const pid of Array.from(this.processStates.keys())) {
            this.destroyProcessRuntime(pid);
        }
    }

    // ── 記憶體使用量 ────────────────────────────────────────

    getMemoryUsage(): RuntimeMemoryUsage {
        let totalModuleCache = 0;
        let totalTimers = 0;
        let estimatedBytes = 0;
        const engineMemory: Record<string, number> = {};

        for (const [pid, state] of this.processStates) {
            const rp = state as RuntimeProcess;
            totalModuleCache += rp.moduleCache.size;
            totalTimers += rp.timers.size;

            // 使用 QuickJS dumpMemoryUsage 取得引擎堆資訊
            try {
                const dump = rp.runtime.dumpMemoryUsage();
                const memUsed = this.parseMemoryUsedFromDump(dump);
                if (memUsed > 0) {
                    engineMemory[`pid_${pid}_heap`] = memUsed;
                    estimatedBytes += memUsed;
                }
            } catch { /* runtime may already be disposed */ }
        }

        engineMemory['moduleCacheEntries'] = totalModuleCache;
        engineMemory['activeTimers'] = totalTimers;

        return {
            engineName: 'quickjs',
            activeProcesses: this.processStates.size,
            totalModuleCacheEntries: totalModuleCache,
            totalTimers,
            engineMemory,
            estimatedBytes,
        };
    }

    private parseMemoryUsedFromDump(dump: string): number {
        // QuickJS dumpMemoryUsage 格式包含 "memory_used_size: 12345" 行
        const match = dump.match(/memory_used_size:\s*(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
    }

    // ── QuickJS Runtime 管理 ─────────────────────────────────

    private ensureRuntimeProcess(proc: ProcessView): RuntimeProcess {
        const existing = this.processStates.get(proc.pid) as RuntimeProcess | undefined;
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
        this.processStates.set(proc.pid, runtimeProcess);
        try {
            this.injectApis(context, proc);
        } catch (err) {
            this.processStates.delete(proc.pid);
            try { context.dispose(); } catch { /* noop */ }
            try { runtime.dispose(); } catch { /* noop */ }
            throw err;
        }
        return runtimeProcess;
    }

    // ── API 注入 / 編排 ──────────────────────────────────────

    private injectApis(context: QuickJSContext, process: ProcessView): void {
        const runtimeProcess = this.processStates.get(process.pid) as RuntimeProcess | undefined;
        const global = context.global;
        const osApi = context.newObject();
        const surface = this.buildApiSurface(process);

        for (const [name, value] of Object.entries(surface)) {
            const handle = this.toHandle(context, value);
            context.setProp(osApi, name, handle);
            handle.dispose();
        }

        context.setProp(global, 'OS', osApi);
        osApi.dispose();

        // 注入 timer 函式
        if (runtimeProcess) {
            this.injectTimerFunctions(context, global, process.pid, runtimeProcess);
        }

        global.dispose();
    }

    // ── imports() 機制 ───────────────────────────────────────

    /** 注入 import 預設模組載入方法 */
    private injectImportCommand(context: QuickJSContext, runtimeProcess: RuntimeProcess): void {
        runtimeProcess.runtime.setModuleLoader((moduleName: unknown) => {

            const throwImportError = (msg: string) => {
                const err = context.newError(msg);
                return { error: err };
            };

            if (typeof moduleName !== 'string') {
                return throwImportError('Module name must be a string');
            }

            // ── Library imports (@-prefix) ────────────────────────────────
            // import '@packageName/libName' → look up the registered library code
            if (typeof moduleName === 'string' && moduleName.startsWith('@')) {
                const libraryId = moduleName.slice(1);
                const code = this.environmentManager.getLibraryCode(libraryId);
                if (code === undefined) {
                    return throwImportError(`Library '${moduleName}' is not registered`);
                }
                return code;
            }

            const entryPath = runtimeProcess.entryPath;
            if (!entryPath) {
                return throwImportError('imports() is not available in this context');
            }

            const resolved = this.resolveModulePath(entryPath, moduleName);
            if ('error' in resolved) {
                return throwImportError(`imports('${moduleName}'): ${resolved.error}`);
            }
            const resolvedPath = resolved.path;

            if (runtimeProcess.moduleCache.has(resolvedPath)) {
                const cached = runtimeProcess.moduleCache.get(resolvedPath) as QuickJSHandle;
                // QuickJS supports returning a pre-evaluated module handle from the loader,
                // but the TypeScript types only model string source code. The cast is safe at runtime.
                return cached.dup() as unknown as string;
            }

            // 同步載入檔案
            const [code, type] = this.syncFetch(resolvedPath);
            if (code === null) {
                return throwImportError(`imports('${moduleName}'): module not found at '${resolvedPath}'`);
            }
            if (type === 'javascript') {
                return code;
            }
            else if (type === 'json') {
                try {
                    return Object.entries(JSON.parse(code)).map(([k, v]: [string, unknown]) => {
                        return "export const " + k + " = " + JSON.stringify(v) + ";";
                    }).join("\n") + "\nexport default " + code + ";";
                } catch {
                    return throwImportError(`imports('${moduleName}'): invalid JSON at '${resolvedPath}'`);
                }
            }
            else {
                return "const code = " + JSON.stringify(code) + "; export default code;";
            }
        });
    }

    /**
     * 注入 imports() 全域函式，讓應用程式可以載入同一套件中的其他檔案。
     * 使用 CommonJS-like 的 module.exports 慣例。
     */
    private injectImportsFunction(context: QuickJSContext, global: QuickJSHandle, runtimeProcess: RuntimeProcess): void {
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

            if (runtimeProcess.moduleCache.has(resolvedPath)) {
                const cached = runtimeProcess.moduleCache.get(resolvedPath) as QuickJSHandle;
                return cached.dup();
            }

            // 同步載入檔案
            const [code] = self.syncFetch(resolvedPath);
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

    // ── Timer 注入 ───────────────────────────────────────────

    /**
     * 注入 setTimeout / setInterval / clearTimeout / clearInterval。
     * 回呼在 host-side 觸發後透過 context.callFunction 呼叫 QuickJS 函式。
     */
    private injectTimerFunctions(context: QuickJSContext, global: QuickJSHandle, pid: number, runtimeProcess: RuntimeProcess): void {
        const self = this;

        const makeTimerFn = (repeat: boolean) =>
            context.newFunction(repeat ? 'setInterval' : 'setTimeout', (...args: any[]) => {
                if (args.length === 0) return context.undefined;
                const callbackHandle = args[0];
                if (context.typeof(callbackHandle) !== 'function') {
                    return context.undefined;
                }
                const delay = args.length > 1 ? (context.dump(args[1]) ?? 0) : 0;

                const callbackDup = callbackHandle.dup();
                // 回收已釋放的 guest ID，避免 ID 無限遞增
                let guestId: number;
                if (runtimeProcess.timerFreeIds && runtimeProcess.timerFreeIds.length > 0) {
                    guestId = runtimeProcess.timerFreeIds.pop()!;
                } else {
                    guestId = runtimeProcess.timerNextId++;
                }

                const hostFn = repeat ? window.setInterval : window.setTimeout;
                const hostId = hostFn(() => {
                    // 若 process 已銷毀，清理自身
                    if (!self.processStates.has(pid)) {
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
                    } catch (err) {
                        console.warn('[Runtime] timer callback error (context may be disposed):', err);
                        // 若回呼出錯且為 repeat timer，清理資源避免 handle 洩漏
                        if (repeat) {
                            window.clearInterval(hostId);
                            runtimeProcess.timers.delete(hostId);
                            runtimeProcess.timerMap.delete(guestId);
                            runtimeProcess.timerCallbacks.delete(guestId);
                            if (!runtimeProcess.timerFreeIds) runtimeProcess.timerFreeIds = [];
                            runtimeProcess.timerFreeIds.push(guestId);
                            try { callbackDup.dispose(); } catch { /* noop */ }
                        }
                    }

                    // 單次 timer 觸發後自動清理
                    if (!repeat) {
                        runtimeProcess.timers.delete(hostId);
                        runtimeProcess.timerMap.delete(guestId);
                        runtimeProcess.timerCallbacks.delete(guestId);
                        if (!runtimeProcess.timerFreeIds) runtimeProcess.timerFreeIds = [];
                        runtimeProcess.timerFreeIds.push(guestId);
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
                    if (!runtimeProcess.timerFreeIds) runtimeProcess.timerFreeIds = [];
                    runtimeProcess.timerFreeIds.push(guestId);
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
    private syncFetch(path: string): [string, ResponseType] | [null, null] {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', path, false);
            xhr.send();
            const typeText = xhr.getResponseHeader('Content-Type') ?? '';
            const responseType = this.getResponseType(typeText);
            return xhr.status === 200 ? [xhr.responseText, responseType] : [null, null];
        } catch {
            return [null, null];
        }
    }

    private getResponseType(text: string): ResponseType {
        if (/json/i.test(text)) return 'json';
        if (/javascript/i.test(text)) return 'javascript';
        return 'text';
    }

    // ── 型別轉換（JS 值 → QuickJS Handle）──────────────────

    private toHandle(context: QuickJSContext, value: HostApiValue): QuickJSHandle {
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
}

export { ScriptRuntime };
