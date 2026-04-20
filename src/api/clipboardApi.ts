import type { Kernel } from '../kernel/Kernel';
import { Permissions } from '../kernel/constants';

export function registerClipboardApi(kernel: Kernel): void {
  const runtimeRegistry = kernel.resolve('runtimeRegistry');
  const permissions = kernel.resolve('permissions');
  const clipboardManager = kernel.resolve('clipboardManager');

  runtimeRegistry.registerApi('clipboardApi', ({ process }) => {
    const appId = process.processAppId;

    return {
      /**
       * 寫入剪貼簿文字。
       * 同步更新系統剪貼簿緩衝區，並以 fire-and-forget 方式橋接到瀏覽器原生剪貼簿。
       */
      write: (text: unknown) => {
        if (!permissions.has(appId, Permissions.CLIPBOARD_WRITE)) {
          return { success: false, error: 'PermissionDenied' };
        }
        if (typeof text !== 'string') {
          return { success: false, error: 'InvalidValue' };
        }
        clipboardManager.write(text, appId);
        return { success: true };
      },

      /**
       * 讀取剪貼簿文字。
       * 同步回傳系統記憶體緩衝區中的最新內容。
       */
      read: () => {
        if (!permissions.has(appId, Permissions.CLIPBOARD_READ)) {
          return { success: false, error: 'PermissionDenied' };
        }
        const entry = clipboardManager.read();
        return { success: true, data: entry.text };
      },

      /**
       * 清除剪貼簿。
       */
      clear: () => {
        if (!permissions.has(appId, Permissions.CLIPBOARD_WRITE)) {
          return { success: false, error: 'PermissionDenied' };
        }
        clipboardManager.clear(appId);
        return { success: true };
      },
    };
  }, ['clipboard'], 'clipboard');
}
