import type { Kernel } from '../kernel/Kernel';
import { Permissions } from '../kernel/constants';

export function registerSystemApi(kernel: Kernel): void {
  const runtime = kernel.resolve('runtime');
  const permissions = kernel.resolve('permissions');
  const processManager = kernel.resolve('processManager');
  const launcher = kernel.resolve('applicationLauncher');

  runtime.registerApi('systemApi', ({ pid, process }) => ({
    terminateProcess: (targetPid: number) => {
      if (!permissions.has(process.processAppId, Permissions.PROCESS_TERMINATE)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const target = processManager.get(targetPid);
      if (!target) return { success: false, error: 'NotFound' };
      const reason = target.pid === pid ? 'Self-terminated' : `Terminated by PID ${pid}`;
      setTimeout(() => launcher.terminateApplication(target.processAppId, reason), 0);
      return { success: true, data: targetPid };
    },
  }), ['process'], 'system');
}
