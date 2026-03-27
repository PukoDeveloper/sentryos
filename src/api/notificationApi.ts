import type { ScriptRuntime } from '../core/ScriptRuntime';
import type { ApiDependencies } from './types';
import { Permissions } from '../core/constants';

export function registerNotificationApi(runtime: ScriptRuntime, deps: ApiDependencies): void {
  runtime.registerApi('notificationApi', ({ process }) => ({
    notify: (title: unknown, body?: unknown, type?: unknown, duration?: unknown) => {
      if (!deps.permissions.has(process.processAppId, Permissions.NOTIFICATION_SEND)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const appDef = deps.appManager.get(
        deps.processManager.getByProcessAppId(process.processAppId)?.appDefId ?? ''
      );
      const id = deps.notificationManager.notify({
        title: String(title),
        body: body != null ? String(body) : undefined,
        type: (['info', 'success', 'warning', 'error'].includes(String(type)) ? String(type) : 'info') as any,
        duration: typeof duration === 'number' ? duration : undefined,
        source: appDef?.name,
      });
      return { success: true, data: id };
    },
    dismiss: (id: unknown) => {
      deps.notificationManager.dismiss(String(id));
      return { success: true };
    },
  }), 'all');
}
