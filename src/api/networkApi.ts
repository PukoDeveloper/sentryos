import type { Kernel } from '../kernel/Kernel';
import { Permissions } from '../kernel/constants';

const NETWORK_SETTINGS_KEY = 'network-settings';
const NETWORK_TIER = 'sys' as const;

export function registerNetworkApi(kernel: Kernel): void {
  const runtimeRegistry = kernel.resolve('runtimeRegistry');
  const permissions = kernel.resolve('permissions');
  const networkManager = kernel.resolve('networkManager');
  const fileSystem = kernel.resolve('fileSystem');
  const systemAppId = kernel.get('systemAppId');

  function persistNetworkState(): void {
    const state = (networkManager as any).exportState?.();
    if (state) {
      fileSystem.write(systemAppId, NETWORK_TIER, NETWORK_SETTINGS_KEY, state, { overwrite: true });
    }
  }

  runtimeRegistry.registerApi('networkApi', ({ process }) => ({
    // ── Request ──────────────────────────────────────────────
    request: async (url: unknown, options?: Record<string, unknown>) => {
      if (!permissions.has(process.processAppId, Permissions.NETWORK_REQUEST)) {
        return { success: false, error: 'PermissionDenied' };
      }
      if (typeof url !== 'string') {
        return { success: false, error: 'InvalidUrl' };
      }
      return networkManager.request(process.processAppId, {
        url,
        method: (typeof options?.method === 'string' ? options.method.toUpperCase() : 'GET') as any,
        headers: (options?.headers && typeof options.headers === 'object') ? options.headers as Record<string, string> : undefined,
        body: typeof options?.body === 'string' ? options.body : undefined,
        timeout: typeof options?.timeout === 'number' ? options.timeout : undefined,
      });
    },

    // ── Check if URL is allowed ──────────────────────────────
    isAllowed: (url: unknown) => {
      if (!permissions.has(process.processAppId, Permissions.NETWORK_STATUS)) {
        return { success: false, error: 'PermissionDenied' };
      }
      if (typeof url !== 'string') return { success: false, error: 'InvalidUrl' };
      return { success: true, data: networkManager.isAllowed(url) };
    },

    // ── Status ───────────────────────────────────────────────
    getStatus: () => {
      if (!permissions.has(process.processAppId, Permissions.NETWORK_STATUS)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return { success: true, data: networkManager.getStatus() };
    },

    // ── Allowlist management (admin) ─────────────────────────
    getAllowlist: () => {
      if (!permissions.has(process.processAppId, Permissions.NETWORK_MANAGE)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return { success: true, data: networkManager.getAllowlist() };
    },

    addAllowlistEntry: (pattern: unknown, description?: unknown) => {
      if (!permissions.has(process.processAppId, Permissions.NETWORK_MANAGE)) {
        return { success: false, error: 'PermissionDenied' };
      }
      if (typeof pattern !== 'string') return { success: false, error: 'InvalidUrl' };
      const result = networkManager.addAllowlistEntry(pattern, typeof description === 'string' ? description : undefined);
      if (result.success) persistNetworkState();
      return result;
    },

    removeAllowlistEntry: (pattern: unknown) => {
      if (!permissions.has(process.processAppId, Permissions.NETWORK_MANAGE)) {
        return { success: false, error: 'PermissionDenied' };
      }
      if (typeof pattern !== 'string') return { success: false, error: 'InvalidUrl' };
      const result = networkManager.removeAllowlistEntry(pattern);
      if (result.success) persistNetworkState();
      return result;
    },

    setEnabled: (enabled: unknown) => {
      if (!permissions.has(process.processAppId, Permissions.NETWORK_MANAGE)) {
        return { success: false, error: 'PermissionDenied' };
      }
      networkManager.setEnabled(!!enabled);
      persistNetworkState();
      return { success: true, data: null };
    },
  }), ['network'], 'network');
}
