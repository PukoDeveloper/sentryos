import type { Kernel } from '../kernel/Kernel';
import type { HttpMethod } from '../network/NetworkAdapter';
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
    // ── Request (async) ──────────────────────────────────────
    // 非同步 HTTP 請求，使用 fetch() 進行真正的非同步 I/O。
    // 沙箱程式碼可使用 `await OS.network.requestAsync(url, options)` 呼叫。
    requestAsync: async (url: unknown, options?: Record<string, unknown>) => {
      if (!permissions.has(process.processAppId, Permissions.NETWORK_REQUEST)) {
        return { success: false, error: 'PermissionDenied' };
      }
      if (typeof url !== 'string') {
        return { success: false, error: 'InvalidUrl' };
      }
      const method = typeof options?.method === 'string' ? options.method.toUpperCase() : 'GET';
      const headers: Record<string, string> = {};
      if (options?.headers && typeof options.headers === 'object') {
        for (const [k, v] of Object.entries(options.headers as Record<string, unknown>)) {
          if (typeof v === 'string') headers[k] = v;
        }
      }
      const body = method !== 'GET' && method !== 'HEAD' && typeof options?.body === 'string'
        ? options.body
        : undefined;
      return networkManager.request(process.processAppId, {
        url,
        method: method as HttpMethod,
        headers,
        body,
      });
    },

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

    // ── WebSocket ─────────────────────────────────────────────

    /**
     * 建立 WebSocket 連線。
     * @param url         WebSocket 伺服器網址（ws:// 或 wss://）
     * @param handlerName 沙箱中接收 WebSocket 事件的全域函式名稱
     * @returns { success, data: socketId } 或錯誤
     *
     * 沙箱範例：
     *   function onWsEvent(e) {
     *     if (e.type === 'message') OS.console.log(e.data);
     *   }
     *   const r = OS.network.wsConnect('wss://echo.example.com', 'onWsEvent');
     *   if (r.success) OS.network.wsSend(r.data, 'hello');
     */
    wsConnect: (url: unknown, handlerName: unknown) => {
      if (!permissions.has(process.processAppId, Permissions.NETWORK_WEBSOCKET)) {
        return { success: false, error: 'PermissionDenied' };
      }
      if (typeof url !== 'string') {
        return { success: false, error: 'InvalidUrl' };
      }
      if (typeof handlerName !== 'string' || !handlerName) {
        return { success: false, error: 'UnknownError' };
      }

      const processAppId = process.processAppId;

      const result = networkManager.wsConnect(
        processAppId,
        url,
        (event) => {
          // Push the WebSocket event into the sandboxed process.
          const runtime = runtimeRegistry.getForProcessAppId(processAppId);
          runtime.dispatchCustomEvent(processAppId, handlerName, event);
        },
      );

      return result;
    },

    /**
     * 透過已開啟的 WebSocket 連線傳送文字訊息。
     * @param socketId 由 wsConnect 回傳的 socketId
     * @param data     要傳送的文字字串
     */
    wsSend: (socketId: unknown, data: unknown) => {
      if (!permissions.has(process.processAppId, Permissions.NETWORK_WEBSOCKET)) {
        return { success: false, error: 'PermissionDenied' };
      }
      if (typeof socketId !== 'string') return { success: false, error: 'NotFound' };
      if (typeof data !== 'string') return { success: false, error: 'UnknownError' };
      return networkManager.wsSend(process.processAppId, socketId, data);
    },

    /**
     * 關閉指定的 WebSocket 連線。
     * @param socketId 由 wsConnect 回傳的 socketId
     * @param code     選填關閉狀態碼（RFC 6455，例如 1000 = 正常關閉）
     * @param reason   選填關閉原因字串（最多 123 位元組）
     */
    wsClose: (socketId: unknown, code?: unknown, reason?: unknown) => {
      if (!permissions.has(process.processAppId, Permissions.NETWORK_WEBSOCKET)) {
        return { success: false, error: 'PermissionDenied' };
      }
      if (typeof socketId !== 'string') return { success: false, error: 'NotFound' };
      const closeCode = typeof code === 'number' ? code : undefined;
      const closeReason = typeof reason === 'string' ? reason : undefined;
      return networkManager.wsClose(process.processAppId, socketId, closeCode, closeReason);
    },

    /**
     * 取得指定 WebSocket 連線的狀態快照。
     * @param socketId 由 wsConnect 回傳的 socketId
     * @returns { socketId, url, readyState } 其中 readyState: 0=CONNECTING 1=OPEN 2=CLOSING 3=CLOSED
     */
    wsGetStatus: (socketId: unknown) => {
      if (!permissions.has(process.processAppId, Permissions.NETWORK_WEBSOCKET)) {
        return { success: false, error: 'PermissionDenied' };
      }
      if (typeof socketId !== 'string') return { success: false, error: 'NotFound' };
      return networkManager.wsGetStatus(process.processAppId, socketId);
    },

    /**
     * 列出此程序目前所有 WebSocket 連線的狀態。
     */
    wsListConnections: () => {
      if (!permissions.has(process.processAppId, Permissions.NETWORK_WEBSOCKET)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return networkManager.wsListConnections(process.processAppId);
    },
  }), ['network'], 'network');
}
