import type { ScriptRuntime } from '../core/ScriptRuntime';
import type { ApiDependencies } from './types';
import { Permissions } from '../core/constants';

export function registerStorageApi(runtime: ScriptRuntime, deps: ApiDependencies): void {
  runtime.registerApi('storageApi', ({ process }) => ({
    usage: () => {
      if (!deps.permissions.has(process.processAppId, Permissions.STORAGE_USAGE)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return deps.fileSystem.usage(process.processAppId);
    },
  }));
}
