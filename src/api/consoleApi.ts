import type { Kernel } from '../kernel/Kernel';
import { Permissions } from '../kernel/constants';

export function registerConsoleApi(kernel: Kernel): void {
  const runtime = kernel.resolve('runtime');
  const permissions = kernel.resolve('permissions');
  const launcher = kernel.resolve('applicationLauncher');

  runtime.registerApi('consoleApi', ({ process }) => {
    const controller = launcher.getConsoleControllers().get(process.processAppId);
    return {
      writeLine: (text: unknown) => {
        if (!permissions.has(process.processAppId, Permissions.CONSOLE_WRITE)) {
          return { success: false, error: 'PermissionDenied' };
        }
        if (controller) controller.appendLine(String(text));
        return { success: true, data: null };
      },
      write: (text: unknown) => {
        if (!permissions.has(process.processAppId, Permissions.CONSOLE_WRITE)) {
          return { success: false, error: 'PermissionDenied' };
        }
        if (controller) controller.appendText(String(text));
        return { success: true, data: null };
      },
      clear: () => {
        if (!permissions.has(process.processAppId, Permissions.CONSOLE_WRITE)) {
          return { success: false, error: 'PermissionDenied' };
        }
        if (controller) controller.clear();
        return { success: true, data: null };
      },
    };
  }, ['console'], 'console');
}
