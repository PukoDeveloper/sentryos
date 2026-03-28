import type { Kernel } from '../kernel/Kernel';
import { Permissions } from '../kernel/constants';

export function registerStorageApi(kernel: Kernel): void {
  const runtime = kernel.resolve('runtime');
  const permissions = kernel.resolve('permissions');
  const fileSystem = kernel.resolve('fileSystem');

  runtime.registerApi('storageApi', ({ process }) => ({
    usage: () => {
      if (!permissions.has(process.processAppId, Permissions.STORAGE_USAGE)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return fileSystem.usage(process.processAppId);
    },
  }));
}
