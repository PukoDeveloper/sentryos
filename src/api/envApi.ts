import type { ScriptRuntime } from '../core/ScriptRuntime';
import type { ApiDependencies } from './types';
import { Permissions } from '../core/constants';

export function registerEnvApi(runtime: ScriptRuntime, deps: ApiDependencies): void {
  runtime.registerApi('envApi', ({ pid, process }) => ({
    getVariable: (key: string) => {
      if (!deps.permissions.has(process.processAppId, Permissions.ENV_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return { success: true, data: deps.environmentManager.getVariable(key) };
    },
    getAllVariables: () => {
      if (!deps.permissions.has(process.processAppId, Permissions.ENV_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return { success: true, data: deps.environmentManager.getAllVariables() };
    },
    setVariable: (key: string, value: string) => {
      if (!deps.permissions.has(process.processAppId, Permissions.ENV_WRITE)) {
        return { success: false, error: 'PermissionDenied' };
      }
      deps.environmentManager.setVariable(key, value);
      return { success: true };
    },
    removeVariable: (key: string) => {
      if (!deps.permissions.has(process.processAppId, Permissions.ENV_WRITE)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return { success: true, data: deps.environmentManager.removeVariable(key) };
    },
    registerAutoStart: () => {
      if (!deps.permissions.has(process.processAppId, Permissions.ENV_AUTOSTART)) {
        return { success: false, error: 'PermissionDenied' };
      }
      deps.environmentManager.registerAutoStart(process.appDefId);
      return { success: true };
    },
    unregisterAutoStart: () => {
      if (!deps.permissions.has(process.processAppId, Permissions.ENV_AUTOSTART)) {
        return { success: false, error: 'PermissionDenied' };
      }
      deps.environmentManager.unregisterAutoStart(process.appDefId);
      return { success: true };
    },
    loadLibrary: (libraryId: string) => {
      if (!deps.permissions.has(process.processAppId, Permissions.ENV_LOAD_LIBRARY)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const code = deps.environmentManager.getLibraryCode(libraryId);
      if (!code) return { success: false, error: 'LibraryNotFound' };
      // Suppress command re-registration — commands are only registered at boot time
      deps.runtime.evaluateInContext(pid,
        `globalThis.__savedRegCmd = envApi.registerCommand; envApi.registerCommand = function(){};`
      );
      const result = deps.runtime.evaluateInContext(pid, code);
      deps.runtime.evaluateInContext(pid,
        `envApi.registerCommand = globalThis.__savedRegCmd; delete globalThis.__savedRegCmd;`
      );
      return result;
    },
    listLibraries: () => {
      return { success: true, data: deps.environmentManager.getLibraryIds() };
    },
    registerCommand: (name: unknown, description: unknown, usage?: unknown) => {
      const cmdName = String(name);
      if (!cmdName || cmdName.length === 0) return { success: false, error: 'InvalidName' };
      const matchedApp = deps.catalogApps.find(a => a.appId === process.appDefId);
      const libraryId = matchedApp ? matchedApp.packageName + '/' + matchedApp.name : process.appDefId;
      deps.environmentManager.registerCommand(cmdName, {
        libraryId,
        description: String(description ?? ''),
        usage: usage ? String(usage) : undefined,
      });
      return { success: true };
    },
  }));
}
