import type { ScriptRuntime } from '../core/ScriptRuntime';
import type { ApiDependencies } from './types';
import { Permissions } from '../core/constants';

export function registerMonitorApi(runtime: ScriptRuntime, deps: ApiDependencies): void {
  runtime.registerApi('monitorApi', ({ process }) => ({
    snapshot: () => {
      if (!deps.permissions.has(process.processAppId, Permissions.MONITOR_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const activeCount = deps.processManager.getAllProcesses().length;
      return { success: true, data: deps.systemMonitor.getSnapshot(activeCount) };
    },
    eventStats: () => {
      if (!deps.permissions.has(process.processAppId, Permissions.MONITOR_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return { success: true, data: deps.systemMonitor.getEventStats() };
    },
    apiStats: () => {
      if (!deps.permissions.has(process.processAppId, Permissions.MONITOR_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return { success: true, data: deps.systemMonitor.getApiStats() };
    },
    permissionStats: () => {
      if (!deps.permissions.has(process.processAppId, Permissions.MONITOR_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return { success: true, data: deps.systemMonitor.getPermissionStats() };
    },
    recentEvents: (limit?: unknown) => {
      if (!deps.permissions.has(process.processAppId, Permissions.MONITOR_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const n = typeof limit === 'number' ? limit : 50;
      return { success: true, data: deps.systemMonitor.getRecentEvents(n) };
    },
    recentApiCalls: (limit?: unknown) => {
      if (!deps.permissions.has(process.processAppId, Permissions.MONITOR_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const n = typeof limit === 'number' ? limit : 50;
      return { success: true, data: deps.systemMonitor.getRecentApiCalls(n) };
    },
    processHistory: () => {
      if (!deps.permissions.has(process.processAppId, Permissions.MONITOR_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return { success: true, data: deps.systemMonitor.getProcessHistory() };
    },
  }), 'all');
}
