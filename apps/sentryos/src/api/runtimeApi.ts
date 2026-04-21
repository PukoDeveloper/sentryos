import type { Kernel } from '../kernel/Kernel';
import { Permissions, MAX_EXTENDED_TIMEOUT_MS } from '../kernel/constants';

export function registerRuntimeApi(kernel: Kernel): void {
  const runtimeRegistry = kernel.resolve('runtimeRegistry');
  const permissions = kernel.resolve('permissions');

  runtimeRegistry.registerApi('runtimeApi', ({ pid, process }) => ({
    /**
     * 請求提升本程序的執行逾時上限。
     * 呼叫端必須持有 `runtime.extended-timeout` 權限；
     * 若有此權限，逾時值立即生效（上限 MAX_EXTENDED_TIMEOUT_MS）。
     *
     * @param timeoutMs 新的逾時毫秒數（正整數，最大 30000）
     * @returns 實際套用的逾時值
     */
    setExecutionTimeout: (timeoutMs: unknown) => {
      if (!permissions.has(process.processAppId, Permissions.RUNTIME_EXTENDED_TIMEOUT)) {
        return { success: false, error: 'PermissionDenied' };
      }
      if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isInteger(timeoutMs)) {
        return { success: false, error: 'InvalidTimeout' };
      }
      const clamped = Math.min(timeoutMs, MAX_EXTENDED_TIMEOUT_MS);
      runtimeRegistry.getForPid(pid).setProcessTimeout(pid, clamped);
      return { success: true, data: clamped };
    },

    /**
     * 將本程序的執行逾時重設回系統預設值（300 ms）。
     */
    resetExecutionTimeout: () => {
      if (!permissions.has(process.processAppId, Permissions.RUNTIME_EXTENDED_TIMEOUT)) {
        return { success: false, error: 'PermissionDenied' };
      }
      runtimeRegistry.getForPid(pid).setProcessTimeout(pid, undefined);
      return { success: true, data: null };
    },
  }), [], 'runtime');
}
