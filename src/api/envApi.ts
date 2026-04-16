import type { Kernel } from '../kernel/Kernel';
import { Permissions } from '../kernel/constants';

export function registerEnvApi(kernel: Kernel): void {
  const runtime = kernel.resolve('runtime');
  const permissions = kernel.resolve('permissions');
  const environmentManager = kernel.resolve('environmentManager');
  const catalogApps = kernel.get('catalogApps');

  runtime.registerApi('envApi', ({ pid, process }) => ({
    getVariable: (key: string) => {
      if (!permissions.has(process.processAppId, Permissions.ENV_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return { success: true, data: environmentManager.getVariable(key) };
    },
    getAllVariables: () => {
      if (!permissions.has(process.processAppId, Permissions.ENV_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return { success: true, data: environmentManager.getAllVariables() };
    },
    setVariable: (key: string, value: string) => {
      if (!permissions.has(process.processAppId, Permissions.ENV_WRITE)) {
        return { success: false, error: 'PermissionDenied' };
      }
      environmentManager.setVariable(key, value);
      return { success: true };
    },
    removeVariable: (key: string) => {
      if (!permissions.has(process.processAppId, Permissions.ENV_WRITE)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return { success: true, data: environmentManager.removeVariable(key) };
    },
    registerAutoStart: () => {
      if (!permissions.has(process.processAppId, Permissions.ENV_AUTOSTART)) {
        return { success: false, error: 'PermissionDenied' };
      }
      environmentManager.registerAutoStart(process.appDefId);
      return { success: true };
    },
    unregisterAutoStart: () => {
      if (!permissions.has(process.processAppId, Permissions.ENV_AUTOSTART)) {
        return { success: false, error: 'PermissionDenied' };
      }
      environmentManager.unregisterAutoStart(process.appDefId);
      return { success: true };
    },
    loadLibrary: (libraryId: string) => {
      if (!permissions.has(process.processAppId, Permissions.ENV_LOAD_LIBRARY)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const code = environmentManager.getLibraryCode(libraryId);
      if (!code) return { success: false, error: 'LibraryNotFound' };
      return runtime.evaluateInContext(pid, code);
    },
    listLibraries: () => {
      return { success: true, data: environmentManager.getLibraryIds() };
    },
    registerCommand: (name: unknown, description: unknown, usage?: unknown) => {
      const cmdName = String(name);
      if (!cmdName || cmdName.length === 0) return { success: false, error: 'InvalidName' };
      const matchedApp = catalogApps.find(a => a.appId === process.appDefId);
      const libraryId = matchedApp ? matchedApp.packageName + '/' + matchedApp.name : process.appDefId;
      environmentManager.registerCommand(cmdName, {
        libraryId,
        description: String(description ?? ''),
        usage: usage ? String(usage) : undefined,
      });
      return { success: true };
    },
  }), ['env'], 'env');
}
