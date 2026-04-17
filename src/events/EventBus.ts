import type { EventBusResult } from '../kernel/types';
import type { Kernel } from '../kernel/Kernel';
import { Permissions } from '../kernel/constants';


interface ListenerEntry {
    appId: string;
    listener: (...args: unknown[]) => void;
}

class EventBus {
    // 依事件類型索引：eventType -> [{appId, listener}]
    private eventListeners: Map<string, ListenerEntry[]>;
    // 依應用程式 ID 索引：appId -> [{event, listener}]
    private appListeners: Map<string, Array<{ event: string; listener: (...args: unknown[]) => void }>>;
    private readonly kernel: Kernel;

    constructor(kernel: Kernel) {
        this.eventListeners = new Map();
        this.appListeners = new Map();
        this.kernel = kernel;
    }

    private get permissions() { return this.kernel.resolve('permissions'); }
    private get monitor() { return this.kernel.has('systemMonitor') ? this.kernel.resolve('systemMonitor') : null; }

    on(appId: string, event: string, listener: (...args: unknown[]) => void): EventBusResult {
        if (!this.permissions.has(appId, Permissions.eventSubscribe(event))) {
            return { success: false, error: 'PermissionDenied' };
        }
        const entry: ListenerEntry = { appId, listener };
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event)!.push(entry);

        if (!this.appListeners.has(appId)) {
            this.appListeners.set(appId, []);
        }
        this.appListeners.get(appId)!.push({ event, listener });
        this.monitor?.recordEventSubscribe(event);
        return { success: true };
    }


    off(appId: string, event: string, listener: (...args: unknown[]) => void): EventBusResult {
        if (!this.permissions.has(appId, Permissions.eventSubscribe(event))) {
            return { success: false, error: 'PermissionDenied' };
        }

        const entries = this.eventListeners.get(event);
        if (entries) {
            this.eventListeners.set(
                event,
                entries.filter(e => !(e.appId === appId && e.listener === listener))
            );
        }
        const appEntries = this.appListeners.get(appId);
        if (appEntries) {
            this.appListeners.set(
                appId,
                appEntries.filter(e => !(e.event === event && e.listener === listener))
            );
        }
        this.monitor?.recordEventUnsubscribe(event);
        return { success: true };
    }


    emit(appId: string, event: string, ...args: unknown[]): EventBusResult {
        if (!this.permissions.has(appId, Permissions.eventEmit(event))) {
            return { success: false, error: 'PermissionDenied' };
        }
        const entries = this.eventListeners.get(event);
        if (!entries || entries.length === 0) {
            this.monitor?.recordEventEmit(appId, event);
            return { success: true };
        }
        for (const entry of entries) {
            try {
                entry.listener(...args);
            } catch (err) {
                console.warn(`[EventBus] Listener error on event '${event}' (appId: ${entry.appId}):`, err);
            }
        }
        this.monitor?.recordEventEmit(appId, event);
        return { success: true };
    }

    removeApp(appId: string): void {
        const appEntries = this.appListeners.get(appId);
        if (!appEntries) return;
        for (const { event, listener } of appEntries) {
            const entries = this.eventListeners.get(event);
            if (entries) {
                this.eventListeners.set(
                    event,
                    entries.filter(e => !(e.appId === appId && e.listener === listener))
                );
            }
        }
        this.appListeners.delete(appId);
    }
}

export { EventBus };
