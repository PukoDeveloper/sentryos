import type { EventBusResult } from './types';
import PermissionsManager from './PermissionsManager';
import { Permissions } from './constants';
import type { SystemMonitor } from './SystemMonitor';


interface ListenerEntry {
    appId: string;
    listener: (...args: any[]) => void;
}

class EventBus {
    // 依事件類型索引：eventType -> [{appId, listener}]
    private eventListeners: Map<string, ListenerEntry[]>;
    // 依應用程式 ID 索引：appId -> [{event, listener}]
    private appListeners: Map<string, Array<{ event: string; listener: (...args: any[]) => void }>>;
    private permissions: PermissionsManager;
    private monitor: SystemMonitor | null = null;

    constructor(permissions: PermissionsManager) {
        this.eventListeners = new Map();
        this.appListeners = new Map();
        this.permissions = permissions;
    }

    setMonitor(monitor: SystemMonitor): void {
        this.monitor = monitor;
    }

    on(appId: string, event: string, listener: (...args: any[]) => void): EventBusResult {
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


    off(appId: string, event: string, listener: (...args: any[]) => void): EventBusResult {
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


    emit(appId: string, event: string, ...args: any[]): EventBusResult {
        if (!this.permissions.has(appId, Permissions.eventEmit(event))) {
            return { success: false, error: 'PermissionDenied' };
        }
        const entries = this.eventListeners.get(event);
        if (!entries) return { success: false, error: 'EventNotFound' };
        entries.forEach(entry => entry.listener(...args));
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

export default EventBus;