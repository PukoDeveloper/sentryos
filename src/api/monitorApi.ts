import type { Kernel } from '../kernel/Kernel';
import { Permissions } from '../kernel/constants';

export function registerMonitorApi(kernel: Kernel): void {
  const runtime = kernel.resolve('runtime');
  const permissions = kernel.resolve('permissions');
  const processManager = kernel.resolve('processManager');
  const systemMonitor = kernel.resolve('systemMonitor');

  runtime.registerApi('monitorApi', ({ process }) => ({
    snapshot: () => {
      if (!permissions.has(process.processAppId, Permissions.MONITOR_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const activeCount = processManager.getAllProcesses().length;
      return { success: true, data: systemMonitor.getSnapshot(activeCount) };
    },
    eventStats: () => {
      if (!permissions.has(process.processAppId, Permissions.MONITOR_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return { success: true, data: systemMonitor.getEventStats() };
    },
    apiStats: () => {
      if (!permissions.has(process.processAppId, Permissions.MONITOR_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return { success: true, data: systemMonitor.getApiStats() };
    },
    permissionStats: () => {
      if (!permissions.has(process.processAppId, Permissions.MONITOR_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return { success: true, data: systemMonitor.getPermissionStats() };
    },
    recentEvents: (limit?: unknown) => {
      if (!permissions.has(process.processAppId, Permissions.MONITOR_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const n = typeof limit === 'number' ? limit : 50;
      return { success: true, data: systemMonitor.getRecentEvents(n) };
    },
    recentApiCalls: (limit?: unknown) => {
      if (!permissions.has(process.processAppId, Permissions.MONITOR_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const n = typeof limit === 'number' ? limit : 50;
      return { success: true, data: systemMonitor.getRecentApiCalls(n) };
    },
    processHistory: () => {
      if (!permissions.has(process.processAppId, Permissions.MONITOR_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return { success: true, data: systemMonitor.getProcessHistory() };
    },
  }), ['monitor'], 'monitor');
}
