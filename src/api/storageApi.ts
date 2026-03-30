import type { Kernel } from '../kernel/Kernel';
import { Permissions } from '../kernel/constants';

export function registerStorageApi(kernel: Kernel): void {
  const runtime = kernel.resolve('runtime');
  const permissions = kernel.resolve('permissions');
  const fileSystem = kernel.resolve('fileSystem');

  runtime.registerApi('storageApi', ({ process }) => ({
    read: (tier: string, key: string) => {
      return fileSystem.read(process.processAppId, tier as any, key);
    },
    write: (tier: string, key: string, data: unknown, options?: Record<string, unknown>) => {
      return fileSystem.write(process.processAppId, tier as any, key, data as any, options);
    },
    delete: (tier: string, key: string) => {
      return fileSystem.delete(process.processAppId, tier as any, key);
    },
    list: (tier?: string) => {
      return fileSystem.list(process.processAppId, tier as any);
    },
    exists: (tier: string, key: string) => {
      return fileSystem.exists(process.processAppId, tier as any, key);
    },
    usage: () => {
      if (!permissions.has(process.processAppId, Permissions.STORAGE_USAGE)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return fileSystem.usage(process.processAppId);
    },
  }));
}
