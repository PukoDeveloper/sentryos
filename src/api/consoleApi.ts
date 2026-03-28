import type { Kernel } from '../core/Kernel';
import { Permissions } from '../core/constants';

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
        return true;
      },
      write: (text: unknown) => {
        if (!permissions.has(process.processAppId, Permissions.CONSOLE_WRITE)) {
          return { success: false, error: 'PermissionDenied' };
        }
        if (controller) controller.appendText(String(text));
        return true;
      },
      clear: () => {
        if (!permissions.has(process.processAppId, Permissions.CONSOLE_WRITE)) {
          return { success: false, error: 'PermissionDenied' };
        }
        if (controller) controller.clear();
        return true;
      },
    };
  }, 'console');
}
