import type { ScriptRuntime } from '../core/ScriptRuntime';
import type { ApiDependencies } from './types';
import { Permissions } from '../core/constants';

export function registerSystemApi(runtime: ScriptRuntime, deps: ApiDependencies): void {
  runtime.registerApi('systemApi', ({ pid, process }) => ({
    terminateProcess: (targetPid: number) => {
      if (!deps.permissions.has(process.processAppId, Permissions.PROCESS_TERMINATE)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const target = deps.processManager.get(targetPid);
      if (!target) return { success: false, error: 'NotFound' };
      // Always defer — synchronous termination from a host function causes re-entrant
      // execute() calls (PROCESS_STOPPED event → onEvent handler) on the caller's context.
      const reason = target.pid === pid ? 'Self-terminated' : `Terminated by PID ${pid}`;
      setTimeout(() => deps.terminateApplication(target.processAppId, reason), 0);
      return { success: true, data: targetPid };
    },
  }));
}
