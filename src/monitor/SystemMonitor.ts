// ────────────────────────────────────────────────────────────
// SystemMonitor — 全域系統監控器
// 追蹤 EventBus 事件、API 呼叫、權限檢查、應用程式使用情況與效能
// ────────────────────────────────────────────────────────────

export interface EventRecord {
    event: string;
    emitterAppId: string;
    timestamp: number;
}

export interface ApiCallRecord {
    apiName: string;
    method: string;
    processAppId: string;
    pid: number;
    duration: number;
    timestamp: number;
    success: boolean;
}

export interface PermissionCheckRecord {
    appId: string;
    permission: string;
    granted: boolean;
    timestamp: number;
}

export interface ProcessUsageRecord {
    pid: number;
    appDefId: string;
    processAppId: string;
    type: string;
    launchedAt: number;
    terminatedAt: number | null;
}

export interface EventStats {
    event: string;
    emitCount: number;
    subscriberCount: number;
    lastEmitTime: number | null;
}

export interface ApiStats {
    apiName: string;
    method: string;
    callCount: number;
    totalDuration: number;
    avgDuration: number;
    lastCallTime: number | null;
}

export interface PermissionStats {
    totalChecks: number;
    totalDenied: number;
    byApp: { [appId: string]: { checks: number; denied: number; deniedPermissions: { [perm: string]: number } } };
    byPermission: { [permission: string]: { checks: number; denied: number } };
}

export interface ProcessStats {
    totalLaunched: number;
    totalTerminated: number;
    activeProcesses: number;
    byApp: { [appDefId: string]: { launched: number; terminated: number } };
}

export interface SystemSnapshot {
    timestamp: number;
    uptime: number;
    events: {
        stats: EventStats[];
        recentEmits: EventRecord[];
        totalEmits: number;
        activeSubscriptions: number;
    };
    api: {
        stats: ApiStats[];
        recentCalls: ApiCallRecord[];
        totalCalls: number;
    };
    permissions: PermissionStats;
    processes: ProcessStats & {
        history: ProcessUsageRecord[];
    };
    performance: {
        avgExecutionTime: number;
        totalExecutions: number;
        recentExecutions: Array<{ pid: number; duration: number; timestamp: number }>;
    };
    memory: MemorySnapshot;
}

export interface MemorySnapshot {
    /** 瀏覽器 JS 堆資訊（僅 Chromium 可用） */
    jsHeap: {
        usedBytes: number | null;
        totalBytes: number | null;
        limitBytes: number | null;
    };
    /** 各 Runtime 引擎的記憶體使用量 */
    runtimes: RuntimeMemorySnapshotEntry[];
    /** 所有 Runtime 引擎的記憶體占用合計（位元組） */
    runtimeTotalBytes: number;
}

export interface RuntimeMemorySnapshotEntry {
    engineName: string;
    activeProcesses: number;
    totalModuleCacheEntries: number;
    totalTimers: number;
    engineMemory: Record<string, number>;
    estimatedBytes: number;
}

const MAX_RECENT_EVENTS = 200;
const MAX_RECENT_API_CALLS = 200;
const MAX_RECENT_EXECUTIONS = 100;

class SystemMonitor {
    // ── Event tracking ──
    private eventEmitCounts = new Map<string, number>();
    private eventSubscriberCounts = new Map<string, number>();
    private eventLastEmitTime = new Map<string, number>();
    private recentEvents: EventRecord[] = [];
    private totalEmits = 0;

    // ── API call tracking ──
    /** key = "apiName.method" */
    private apiCallCounts = new Map<string, number>();
    private apiCallDurations = new Map<string, number>();
    private apiLastCallTime = new Map<string, number>();
    private recentApiCalls: ApiCallRecord[] = [];
    private totalApiCalls = 0;

    // ── Permission tracking ──
    private permissionChecks = 0;
    private permissionDenied = 0;
    private permissionByApp = new Map<string, { checks: number; denied: number; deniedPermissions: Map<string, number> }>();
    private permissionByPerm = new Map<string, { checks: number; denied: number }>();

    // ── Process tracking ──
    private processHistory: ProcessUsageRecord[] = [];
    private totalLaunched = 0;
    private totalTerminated = 0;
    private processCountByApp = new Map<string, { launched: number; terminated: number }>();

    // ── Performance tracking ──
    private executionDurations: Array<{ pid: number; duration: number; timestamp: number }> = [];
    private totalExecutionTime = 0;
    private totalExecutions = 0;

    private readonly bootTime: number;
    /** 提供 Runtime 記憶體使用量的回呼（由外部注入以避免循環依賴） */
    private runtimeMemoryProvider: (() => RuntimeMemorySnapshotEntry[]) | null = null;

    constructor(bootTime: number) {
        this.bootTime = bootTime;
    }

    /** 設定 Runtime 記憶體使用量提供者。 */
    setRuntimeMemoryProvider(provider: () => RuntimeMemorySnapshotEntry[]): void {
        this.runtimeMemoryProvider = provider;
    }

    // ── Event hooks ──────────────────────────────────────────

    recordEventEmit(appId: string, event: string): void {
        const now = Date.now();
        this.totalEmits++;
        this.eventEmitCounts.set(event, (this.eventEmitCounts.get(event) ?? 0) + 1);
        this.eventLastEmitTime.set(event, now);
        this.recentEvents.push({ event, emitterAppId: appId, timestamp: now });
        if (this.recentEvents.length > MAX_RECENT_EVENTS) {
            this.recentEvents.shift();
        }
    }

    recordEventSubscribe(event: string): void {
        this.eventSubscriberCounts.set(event, (this.eventSubscriberCounts.get(event) ?? 0) + 1);
    }

    recordEventUnsubscribe(event: string): void {
        const current = this.eventSubscriberCounts.get(event) ?? 0;
        if (current > 0) {
            this.eventSubscriberCounts.set(event, current - 1);
        }
    }

    // ── API call hooks ───────────────────────────────────────

    recordApiCall(apiName: string, method: string, processAppId: string, pid: number, duration: number, success: boolean): void {
        const now = Date.now();
        const key = `${apiName}.${method}`;
        this.totalApiCalls++;
        this.apiCallCounts.set(key, (this.apiCallCounts.get(key) ?? 0) + 1);
        this.apiCallDurations.set(key, (this.apiCallDurations.get(key) ?? 0) + duration);
        this.apiLastCallTime.set(key, now);
        this.recentApiCalls.push({ apiName, method, processAppId, pid, duration, timestamp: now, success });
        if (this.recentApiCalls.length > MAX_RECENT_API_CALLS) {
            this.recentApiCalls.shift();
        }
    }

    // ── Permission hooks ─────────────────────────────────────

    recordPermissionCheck(appId: string, permission: string, granted: boolean): void {
        this.permissionChecks++;
        if (!granted) this.permissionDenied++;
        let entry = this.permissionByApp.get(appId);
        if (!entry) {
            entry = { checks: 0, denied: 0, deniedPermissions: new Map() };
            this.permissionByApp.set(appId, entry);
        }
        entry.checks++;
        if (!granted) {
            entry.denied++;
            entry.deniedPermissions.set(permission, (entry.deniedPermissions.get(permission) ?? 0) + 1);
        }

        let permEntry = this.permissionByPerm.get(permission);
        if (!permEntry) {
            permEntry = { checks: 0, denied: 0 };
            this.permissionByPerm.set(permission, permEntry);
        }
        permEntry.checks++;
        if (!granted) permEntry.denied++;
    }

    // ── Process hooks ────────────────────────────────────────

    recordProcessLaunch(pid: number, appDefId: string, processAppId: string, type: string): void {
        this.totalLaunched++;
        let entry = this.processCountByApp.get(appDefId);
        if (!entry) {
            entry = { launched: 0, terminated: 0 };
            this.processCountByApp.set(appDefId, entry);
        }
        entry.launched++;
        this.processHistory.push({
            pid, appDefId, processAppId, type,
            launchedAt: Date.now(),
            terminatedAt: null,
        });
    }

    recordProcessTerminate(pid: number, appDefId: string): void {
        this.totalTerminated++;
        const entry = this.processCountByApp.get(appDefId);
        if (entry) entry.terminated++;
        const historyEntry = this.processHistory.find(h => h.pid === pid && h.terminatedAt === null);
        if (historyEntry) historyEntry.terminatedAt = Date.now();
    }

    // ── Execution performance hook ───────────────────────────

    recordExecution(pid: number, duration: number): void {
        this.totalExecutions++;
        this.totalExecutionTime += duration;
        this.executionDurations.push({ pid, duration, timestamp: Date.now() });
        if (this.executionDurations.length > MAX_RECENT_EXECUTIONS) {
            this.executionDurations.shift();
        }
    }

    // ── Snapshot ─────────────────────────────────────────────

    getSnapshot(activeProcessCount: number): SystemSnapshot {
        const now = Date.now();

        // Event stats
        const allEvents = new Set([
            ...this.eventEmitCounts.keys(),
            ...this.eventSubscriberCounts.keys(),
        ]);
        const eventStats: EventStats[] = [];
        let activeSubscriptions = 0;
        for (const event of allEvents) {
            const subCount = this.eventSubscriberCounts.get(event) ?? 0;
            activeSubscriptions += subCount;
            eventStats.push({
                event,
                emitCount: this.eventEmitCounts.get(event) ?? 0,
                subscriberCount: subCount,
                lastEmitTime: this.eventLastEmitTime.get(event) ?? null,
            });
        }
        eventStats.sort((a, b) => b.emitCount - a.emitCount);

        // API stats
        const apiStats: ApiStats[] = [];
        for (const key of this.apiCallCounts.keys()) {
            const [apiName, ...rest] = key.split('.');
            const method = rest.join('.');
            const count = this.apiCallCounts.get(key) ?? 0;
            const totalDur = this.apiCallDurations.get(key) ?? 0;
            apiStats.push({
                apiName,
                method,
                callCount: count,
                totalDuration: totalDur,
                avgDuration: count > 0 ? totalDur / count : 0,
                lastCallTime: this.apiLastCallTime.get(key) ?? null,
            });
        }
        apiStats.sort((a, b) => b.callCount - a.callCount);

        // Permission stats
        const permByApp: { [appId: string]: { checks: number; denied: number; deniedPermissions: { [perm: string]: number } } } = {};
        for (const [appId, entry] of this.permissionByApp) {
            const deniedPerms: { [perm: string]: number } = {};
            for (const [perm, count] of entry.deniedPermissions) {
                deniedPerms[perm] = count;
            }
            permByApp[appId] = { checks: entry.checks, denied: entry.denied, deniedPermissions: deniedPerms };
        }
        const permByPerm: { [permission: string]: { checks: number; denied: number } } = {};
        for (const [perm, entry] of this.permissionByPerm) {
            permByPerm[perm] = { ...entry };
        }

        // Process stats
        const procByApp: { [appDefId: string]: { launched: number; terminated: number } } = {};
        for (const [appDefId, entry] of this.processCountByApp) {
            procByApp[appDefId] = { ...entry };
        }

        return {
            timestamp: now,
            uptime: now - this.bootTime,
            events: {
                stats: eventStats,
                recentEmits: [...this.recentEvents].reverse(),
                totalEmits: this.totalEmits,
                activeSubscriptions,
            },
            api: {
                stats: apiStats,
                recentCalls: [...this.recentApiCalls].reverse(),
                totalCalls: this.totalApiCalls,
            },
            permissions: {
                totalChecks: this.permissionChecks,
                totalDenied: this.permissionDenied,
                byApp: permByApp,
                byPermission: permByPerm,
            },
            processes: {
                totalLaunched: this.totalLaunched,
                totalTerminated: this.totalTerminated,
                activeProcesses: activeProcessCount,
                byApp: procByApp,
                history: [...this.processHistory],
            },
            performance: {
                avgExecutionTime: this.totalExecutions > 0 ? this.totalExecutionTime / this.totalExecutions : 0,
                totalExecutions: this.totalExecutions,
                recentExecutions: [...this.executionDurations].reverse(),
            },
            memory: this.buildMemorySnapshot(),
        };
    }

    // ── Memory ───────────────────────────────────────────────

    buildMemorySnapshot(): MemorySnapshot {
        // 瀏覽器 JS 堆（Chromium 專屬）
        const perf = performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } };
        const jsHeap = {
            usedBytes: perf.memory?.usedJSHeapSize ?? null,
            totalBytes: perf.memory?.totalJSHeapSize ?? null,
            limitBytes: perf.memory?.jsHeapSizeLimit ?? null,
        };

        const runtimes: RuntimeMemorySnapshotEntry[] = this.runtimeMemoryProvider?.() ?? [];
        let runtimeTotalBytes = 0;
        for (const r of runtimes) {
            runtimeTotalBytes += r.estimatedBytes;
        }

        return { jsHeap, runtimes, runtimeTotalBytes };
    }

    getMemorySnapshot(): MemorySnapshot {
        return this.buildMemorySnapshot();
    }

    // ── Partial queries (for lighter API calls) ──────────────

    getEventStats(): EventStats[] {
        const allEvents = new Set([
            ...this.eventEmitCounts.keys(),
            ...this.eventSubscriberCounts.keys(),
        ]);
        const stats: EventStats[] = [];
        for (const event of allEvents) {
            stats.push({
                event,
                emitCount: this.eventEmitCounts.get(event) ?? 0,
                subscriberCount: this.eventSubscriberCounts.get(event) ?? 0,
                lastEmitTime: this.eventLastEmitTime.get(event) ?? null,
            });
        }
        return stats.sort((a, b) => b.emitCount - a.emitCount);
    }

    getApiStats(): ApiStats[] {
        const stats: ApiStats[] = [];
        for (const key of this.apiCallCounts.keys()) {
            const [apiName, ...rest] = key.split('.');
            const method = rest.join('.');
            const count = this.apiCallCounts.get(key) ?? 0;
            const totalDur = this.apiCallDurations.get(key) ?? 0;
            stats.push({
                apiName,
                method,
                callCount: count,
                totalDuration: totalDur,
                avgDuration: count > 0 ? totalDur / count : 0,
                lastCallTime: this.apiLastCallTime.get(key) ?? null,
            });
        }
        return stats.sort((a, b) => b.callCount - a.callCount);
    }

    getPermissionStats(): PermissionStats {
        const byApp: PermissionStats['byApp'] = {};
        for (const [appId, entry] of this.permissionByApp) {
            const deniedPerms: { [perm: string]: number } = {};
            for (const [perm, count] of entry.deniedPermissions) {
                deniedPerms[perm] = count;
            }
            byApp[appId] = { checks: entry.checks, denied: entry.denied, deniedPermissions: deniedPerms };
        }
        const byPermission: { [permission: string]: { checks: number; denied: number } } = {};
        for (const [perm, entry] of this.permissionByPerm) {
            byPermission[perm] = { ...entry };
        }
        return {
            totalChecks: this.permissionChecks,
            totalDenied: this.permissionDenied,
            byApp,
            byPermission,
        };
    }

    getRecentEvents(limit = 50): EventRecord[] {
        return this.recentEvents.slice(-limit).reverse();
    }

    getRecentApiCalls(limit = 50): ApiCallRecord[] {
        return this.recentApiCalls.slice(-limit).reverse();
    }

    getProcessHistory(): ProcessUsageRecord[] {
        return [...this.processHistory];
    }
}

export { SystemMonitor };
