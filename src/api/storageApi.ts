import type { Kernel } from '../kernel/Kernel';
import type { StorageTier } from '../storage/FileSystem';
import { Permissions } from '../kernel/constants';
import type { RegisteredApplication } from '../application/ApplicationCatalog';

// ── Path Resolution ────────────────────────────────────────
// 路徑格式: [tier:][@namespace/]filename
//   tier:        sys | app | user | cache（預設 app）
//   @namespace/  跨應用存取（需要 file.cross-app 權限）
//   filename     檔案名稱（支援 / 子目錄）
//
// 範例:
//   "test.json"                → app 層, key = "{storageId}/test.json"
//   "user:doc:readme"          → user 層, key = "{storageId}/doc:readme"
//   "sys:boot-config"          → sys 層, key = "boot-config"（全域，無命名空間）
//   "@terminal/config.json"    → app 層, key = "terminal/config.json"（跨應用）
//   "user:@terminal/data.json" → user 層, key = "terminal/data.json"（跨應用）

interface ResolvedPath {
  tier: StorageTier;
  key: string;
  crossApp: boolean;
  namespace: string;
}

const TIER_PREFIXES: readonly string[] = ['sys:', 'app:', 'user:', 'cache:'];

function resolvePath(path: string, appId: string): ResolvedPath {
  let tier: StorageTier = 'app';
  let remaining = path;

  // 1. 提取 tier 前綴
  for (const prefix of TIER_PREFIXES) {
    if (remaining.startsWith(prefix)) {
      tier = prefix.slice(0, -1) as StorageTier;
      remaining = remaining.slice(prefix.length);
      break;
    }
  }

  // 2. 提取跨應用命名空間 (@appId/)
  let namespace = appId;
  let crossApp = false;

  if (remaining.startsWith('@')) {
    const slashIdx = remaining.indexOf('/');
    if (slashIdx > 1) {
      namespace = remaining.slice(1, slashIdx);
      remaining = remaining.slice(slashIdx + 1);
      crossApp = true;
    }
  }

  // 3. 建立最終 key（sys 層是全域的，不加命名空間前綴）
  const key = tier === 'sys' ? remaining : `${namespace}/${remaining}`;

  return { tier, key, crossApp, namespace };
}

function stripNamespaceFromKey(key: string, namespace: string, tier: StorageTier): string {
  if (tier === 'sys') return key;
  const prefix = namespace + '/';
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

export function registerStorageApi(kernel: Kernel): void {
  const runtime = kernel.resolve('runtime');
  const permissions = kernel.resolve('permissions');
  const fileSystem = kernel.resolve('fileSystem');
  const catalogApps = kernel.get('catalogApps');

  /** 用 appDefId 查出穩定的 manifestId，作為儲存命名空間 */
  function resolveStorageId(appDefId: string): string {
    const entry = catalogApps.find((a: RegisteredApplication) => a.appId === appDefId);
    return entry?.manifestId ?? appDefId;
  }

  runtime.registerApi('storageApi', ({ process }) => {
    const appId = process.processAppId;           // 權限檢查用
    const storageId = resolveStorageId(process.appDefId);  // 儲存命名空間用

    function checkCrossApp(resolved: ResolvedPath): string | null {
      if (resolved.crossApp && !permissions.has(appId, Permissions.FILE_CROSS_APP)) {
        return 'PermissionDenied';
      }
      return null;
    }

    return {
      readFile: (path: string) => {
        const resolved = resolvePath(path, storageId);
        const err = checkCrossApp(resolved);
        if (err) return { success: false, error: err };

        const result = fileSystem.read(appId, resolved.tier, resolved.key);
        if (result.success && result.data) {
          result.data = {
            ...result.data,
            key: stripNamespaceFromKey(result.data.key, resolved.namespace, resolved.tier),
          };
        }
        return result;
      },

      writeFile: (path: string, data: unknown, options?: Record<string, unknown>) => {
        const resolved = resolvePath(path, storageId);
        const err = checkCrossApp(resolved);
        if (err) return { success: false, error: err };

        const result = fileSystem.write(appId, resolved.tier, resolved.key, data as any, options);
        if (result.success && result.data) {
          result.data = {
            ...result.data,
            key: stripNamespaceFromKey(result.data.key, resolved.namespace, resolved.tier),
          };
        }
        return result;
      },

      deleteFile: (path: string) => {
        const resolved = resolvePath(path, storageId);
        const err = checkCrossApp(resolved);
        if (err) return { success: false, error: err };

        return fileSystem.delete(appId, resolved.tier, resolved.key);
      },

      listFiles: (path?: string) => {
        const resolved = resolvePath(path || '', storageId);
        const err = checkCrossApp(resolved);
        if (err) return { success: false, error: err };

        const result = fileSystem.listByPrefix(appId, resolved.tier, resolved.key);
        if (result.success && result.data) {
          result.data = result.data.map(entry => ({
            ...entry,
            key: stripNamespaceFromKey(entry.key, resolved.namespace, resolved.tier),
          }));
        }
        return result;
      },

      fileExists: (path: string) => {
        const resolved = resolvePath(path, storageId);
        const err = checkCrossApp(resolved);
        if (err) return { success: false, error: err };

        return fileSystem.exists(appId, resolved.tier, resolved.key);
      },

      storageUsage: () => {
        if (!permissions.has(appId, Permissions.STORAGE_USAGE)) {
          return { success: false, error: 'PermissionDenied' };
        }
        return fileSystem.usage(appId);
      },

      listAllFiles: (tier?: string) => {
        if (!permissions.has(appId, Permissions.FILE_LIST_ALL)) {
          return { success: false, error: 'PermissionDenied' };
        }
        return fileSystem.list(appId, tier as StorageTier | undefined);
      },
    };
  });
}
