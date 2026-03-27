import type { ScriptRuntime } from '../core/ScriptRuntime';
import type { ApiDependencies } from './types';
import { Permissions } from '../core/constants';

export function registerConsoleApi(runtime: ScriptRuntime, deps: ApiDependencies): void {
  runtime.registerApi('consoleApi', ({ process }) => {
    const controller = deps.consoleControllers.get(process.processAppId);
    return {
      writeLine: (text: unknown) => {
        if (!deps.permissions.has(process.processAppId, Permissions.CONSOLE_WRITE)) {
          return { success: false, error: 'PermissionDenied' };
        }
        if (controller) controller.appendLine(String(text));
        return true;
      },
      write: (text: unknown) => {
        if (!deps.permissions.has(process.processAppId, Permissions.CONSOLE_WRITE)) {
          return { success: false, error: 'PermissionDenied' };
        }
        if (controller) controller.appendText(String(text));
        return true;
      },
      clear: () => {
        if (!deps.permissions.has(process.processAppId, Permissions.CONSOLE_WRITE)) {
          return { success: false, error: 'PermissionDenied' };
        }
        if (controller) controller.clear();
        return true;
      },
    };
  }, 'console');
}
