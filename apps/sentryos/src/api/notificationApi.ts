import type { Kernel } from '../kernel/Kernel';
import { Permissions } from '../kernel/constants';

export function registerNotificationApi(kernel: Kernel): void {
  const runtimeRegistry = kernel.resolve('runtimeRegistry');
  const permissions = kernel.resolve('permissions');
  const appManager = kernel.resolve('appManager');
  const processManager = kernel.resolve('processManager');
  const notificationManager = kernel.resolve('notificationManager');

  runtimeRegistry.registerApi('notificationApi', ({ process }) => ({
    notify: (title: unknown, body?: unknown, type?: unknown, duration?: unknown) => {
      if (!permissions.has(process.processAppId, Permissions.NOTIFICATION_SEND)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const appDef = appManager.get(
        processManager.getByProcessAppId(process.processAppId)?.appDefId ?? ''
      );
      const id = notificationManager.notify({
        title: String(title),
        body: body != null ? String(body) : undefined,
        type: (['info', 'success', 'warning', 'error'].includes(String(type)) ? String(type) : 'info') as any,
        duration: typeof duration === 'number' ? duration : undefined,
        source: appDef?.name,
      });
      return { success: true, data: id };
    },
    dismiss: (id: unknown) => {
      notificationManager.dismiss(String(id));
      return { success: true };
    },
  }), ['notification'], 'notification');
}
