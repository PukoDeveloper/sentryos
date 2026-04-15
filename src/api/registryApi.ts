import type { Kernel } from '../kernel/Kernel';
import { Permissions } from '../kernel/constants';

export function registerRegistryApi(kernel: Kernel): void {
  const runtime = kernel.resolve('runtime');
  const permissions = kernel.resolve('permissions');
  const registry = kernel.resolve('systemRegistry');

  runtime.registerApi('registryApi', ({ process }) => ({
    /** 取得某系統角色的預設應用程式 appDefId */
    getDefaultApp: (role: unknown) => {
      if (!permissions.has(process.processAppId, Permissions.REGISTRY_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      if (typeof role !== 'string') return { success: false, error: 'InvalidArgument' };
      const appDefId = registry.getDefaultApp(role);
      return { success: true, data: appDefId ?? null };
    },

    /** 取得所有已註冊的角色對應表 */
    getAllRoles: () => {
      if (!permissions.has(process.processAppId, Permissions.REGISTRY_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return { success: true, data: registry.getAllRoles() };
    },

    /** 設定某系統角色的預設應用程式（需寫入權限） */
    setDefaultApp: (role: unknown, appDefId: unknown) => {
      if (!permissions.has(process.processAppId, Permissions.REGISTRY_WRITE)) {
        return { success: false, error: 'PermissionDenied' };
      }
      if (typeof role !== 'string' || typeof appDefId !== 'string') {
        return { success: false, error: 'InvalidArgument' };
      }
      registry.setDefaultApp(role, appDefId);
      registry.persist();
      return { success: true, data: null };
    },

    /** 取得副檔名對應的預設應用程式 */
    getFileTypeHandler: (extension: unknown) => {
      if (!permissions.has(process.processAppId, Permissions.REGISTRY_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      if (typeof extension !== 'string') return { success: false, error: 'InvalidArgument' };
      const handler = registry.getFileTypeHandler(extension);
      return { success: true, data: handler ?? null };
    },

    /** 取得所有檔案類型關聯 */
    getAllFileTypeHandlers: () => {
      if (!permissions.has(process.processAppId, Permissions.REGISTRY_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return { success: true, data: registry.getAllFileTypeHandlers() };
    },

    /** 設定副檔名對應的預設應用程式（需寫入權限） */
    setFileTypeHandler: (extension: unknown, appDefId: unknown, mimeType?: unknown) => {
      if (!permissions.has(process.processAppId, Permissions.REGISTRY_WRITE)) {
        return { success: false, error: 'PermissionDenied' };
      }
      if (typeof extension !== 'string' || typeof appDefId !== 'string') {
        return { success: false, error: 'InvalidArgument' };
      }
      const mime = typeof mimeType === 'string' ? mimeType : undefined;
      registry.setFileTypeHandler(extension, appDefId, mime);
      registry.persist();
      return { success: true, data: null };
    },

    /** 移除副檔名的檔案類型關聯（需寫入權限） */
    removeFileTypeHandler: (extension: unknown) => {
      if (!permissions.has(process.processAppId, Permissions.REGISTRY_WRITE)) {
        return { success: false, error: 'PermissionDenied' };
      }
      if (typeof extension !== 'string') return { success: false, error: 'InvalidArgument' };
      const removed = registry.removeFileTypeHandler(extension);
      if (removed) registry.persist();
      return { success: true, data: removed };
    },

    /** 取得完整註冊表快照 */
    getSnapshot: () => {
      if (!permissions.has(process.processAppId, Permissions.REGISTRY_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return { success: true, data: registry.getSnapshot() };
    },
  }), ['registry'], 'registry');
}
