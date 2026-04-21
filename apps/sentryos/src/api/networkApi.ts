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
    // QuickJS runs in a synchronous context and cannot await a Promise.
    // We perform the HTTP request via synchronous XMLHttpRequest so the result
    // is available immediately when the guest code returns from this call.
    request: (url: unknown, options?: Record<string, unknown>) => {
      if (!permissions.has(process.processAppId, Permissions.NETWORK_REQUEST)) {
        return { success: false, error: 'PermissionDenied' };
      }
      if (typeof url !== 'string') {
        return { success: false, error: 'InvalidUrl' };
      }
      if (!networkManager.isEnabled()) {
        return { success: false, error: 'Disabled' };
      }
      if (!networkManager.isAllowed(url)) {
        return { success: false, error: 'NotAllowed' };
      }
      try {
        const method = typeof options?.method === 'string' ? options.method.toUpperCase() : 'GET';
        const xhr = new XMLHttpRequest();
        xhr.open(method, url, false /* synchronous */);
        if (options?.headers && typeof options.headers === 'object') {
          for (const [k, v] of Object.entries(options.headers as Record<string, unknown>)) {
            if (typeof v === 'string') xhr.setRequestHeader(k, v);
          }
        }
        const body = method !== 'GET' && method !== 'HEAD' && typeof options?.body === 'string'
          ? options.body
          : null;
        xhr.send(body);
        const respHeaders: Record<string, string> = {};
        for (const line of xhr.getAllResponseHeaders().trim().split('\r\n')) {
          const sep = line.indexOf(': ');
          if (sep !== -1) respHeaders[line.slice(0, sep).toLowerCase()] = line.slice(sep + 2);
        }
        return {
          success: true,
          data: {
            status: xhr.status,
            statusText: xhr.statusText,
            headers: respHeaders,
            body: xhr.responseText,
          },
        };
      } catch {
        return { success: false, error: 'ConnectionFailed' };
      }
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
