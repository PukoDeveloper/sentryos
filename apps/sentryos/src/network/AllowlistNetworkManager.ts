import type {
  NetworkAdapter,
  NetworkRequest,
  NetworkResponse,
  NetworkResult,
  NetworkStatus,
  AllowlistEntry,
  WebSocketResult,
  WebSocketStatus,
  WebSocketEventCallback,
} from './NetworkAdapter';

/** Maximum number of simultaneous WebSocket connections per process (appId). */
const MAX_WS_PER_APP = 8;

/** Composite key used to address a single socket: "<appId>:<socketId>" */
function socketKey(appId: string, socketId: string): string {
  return `${appId}:${socketId}`;
}

/** Internal record for a tracked WebSocket connection. */
interface SocketRecord {
  socket: WebSocket;
  url: string;
  appId: string;
  socketId: string;
}

/**
 * Concrete NetworkAdapter that enforces a host/pattern allowlist.
 * Only URLs matching at least one allowlist entry are permitted.
 */
export class AllowlistNetworkManager implements NetworkAdapter {
  private enabled = true;
  private allowlist: AllowlistEntry[] = [];
  private totalRequests = 0;
  private blockedRequests = 0;

  /** All live WebSocket connections keyed by "<appId>:<socketId>". */
  private readonly sockets = new Map<string, SocketRecord>();

  // ── Enable / Disable ────────────────────────────────────────

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  // ── Allowlist management ────────────────────────────────────

  getAllowlist(): AllowlistEntry[] {
    return [...this.allowlist];
  }

  addAllowlistEntry(pattern: string, description?: string): NetworkResult<AllowlistEntry> {
    const trimmed = pattern.trim().toLowerCase();
    if (!trimmed) {
      return { success: false, error: 'InvalidUrl' };
    }
    if (this.allowlist.some(e => e.pattern === trimmed)) {
      return { success: false, error: 'InvalidUrl' };
    }
    const entry: AllowlistEntry = {
      pattern: trimmed,
      description,
      createdAt: Date.now(),
    };
    this.allowlist.push(entry);
    return { success: true, data: entry };
  }

  removeAllowlistEntry(pattern: string): NetworkResult<string> {
    const trimmed = pattern.trim().toLowerCase();
    const idx = this.allowlist.findIndex(e => e.pattern === trimmed);
    if (idx === -1) {
      return { success: false, error: 'InvalidUrl' };
    }
    this.allowlist.splice(idx, 1);
    return { success: true, data: trimmed };
  }

  // ── URL matching ────────────────────────────────────────────

  isAllowed(url: string): boolean {
    if (!this.enabled) return false;
    const host = this.extractHost(url);
    if (!host) return false;
    return this.allowlist.some(entry => this.matchPattern(entry.pattern, host));
  }

  // ── Network request ─────────────────────────────────────────

  async request(_appId: string, req: NetworkRequest): Promise<NetworkResult<NetworkResponse>> {
    this.totalRequests++;

    if (!this.enabled) {
      this.blockedRequests++;
      return { success: false, error: 'Disabled' };
    }

    const host = this.extractHost(req.url);
    if (!host) {
      this.blockedRequests++;
      return { success: false, error: 'InvalidUrl' };
    }

    if (!this.isAllowed(req.url)) {
      this.blockedRequests++;
      return { success: false, error: 'NotAllowed' };
    }

    try {
      const controller = new AbortController();
      const timeout = req.timeout ?? 10_000;
      const timer = setTimeout(() => controller.abort(), timeout);

      const fetchInit: RequestInit = {
        method: req.method ?? 'GET',
        headers: req.headers,
        signal: controller.signal,
      };
      if (req.body && req.method !== 'GET' && req.method !== 'HEAD') {
        fetchInit.body = req.body;
      }

      const resp = await fetch(req.url, fetchInit);
      clearTimeout(timer);

      const respHeaders: Record<string, string> = {};
      resp.headers.forEach((v, k) => { respHeaders[k] = v; });

      const body = await resp.text();

      return {
        success: true,
        data: {
          status: resp.status,
          statusText: resp.statusText,
          headers: respHeaders,
          body,
        },
      };
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { success: false, error: 'Timeout' };
      }
      return { success: false, error: 'ConnectionFailed' };
    }
  }

  // ── Status ──────────────────────────────────────────────────

  getStatus(): NetworkStatus {
    return {
      enabled: this.enabled,
      allowlistCount: this.allowlist.length,
      totalRequests: this.totalRequests,
      blockedRequests: this.blockedRequests,
    };
  }

  // ── Persistence helpers ─────────────────────────────────────

  /** Serialize state for persistence (e.g. to FileSystem). */
  exportState(): { enabled: boolean; allowlist: AllowlistEntry[] } {
    return { enabled: this.enabled, allowlist: [...this.allowlist] };
  }

  /** Restore state from persisted data. */
  importState(data: { enabled?: boolean; allowlist?: AllowlistEntry[] }): void {
    if (typeof data.enabled === 'boolean') this.enabled = data.enabled;
    if (Array.isArray(data.allowlist)) {
      this.allowlist = data.allowlist.filter(
        e => typeof e.pattern === 'string' && e.pattern.trim()
      );
    }
  }

  // ── WebSocket ───────────────────────────────────────────────

  wsConnect(
    appId: string,
    socketId: string,
    url: string,
    callback: WebSocketEventCallback,
  ): WebSocketResult<string> {
    if (!this.enabled) {
      return { success: false, error: 'Disabled' };
    }

    // Validate and normalise the URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return { success: false, error: 'InvalidUrl' };
    }
    if (parsedUrl.protocol !== 'ws:' && parsedUrl.protocol !== 'wss:') {
      return { success: false, error: 'InvalidUrl' };
    }

    // Allowlist check uses the hostname (same policy as HTTP)
    if (!this.isAllowedHost(parsedUrl.hostname)) {
      return { success: false, error: 'NotAllowed' };
    }

    const key = socketKey(appId, socketId);
    if (this.sockets.has(key)) {
      // Caller reused a socketId that is still live – reject to avoid confusion
      return { success: false, error: 'UnknownError' };
    }

    // Enforce per-process connection limit
    const appSocketCount = this.countSocketsForApp(appId);
    if (appSocketCount >= MAX_WS_PER_APP) {
      return { success: false, error: 'TooManyConnections' };
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      return { success: false, error: 'ConnectionFailed' };
    }

    const record: SocketRecord = { socket: ws, url, appId, socketId };
    this.sockets.set(key, record);

    ws.addEventListener('open', () => {
      callback({ socketId, type: 'open' });
    });

    ws.addEventListener('message', (ev: MessageEvent) => {
      const data = typeof ev.data === 'string' ? ev.data : String(ev.data);
      callback({ socketId, type: 'message', data });
    });

    ws.addEventListener('error', () => {
      callback({ socketId, type: 'error' });
    });

    ws.addEventListener('close', (ev: CloseEvent) => {
      this.sockets.delete(key);
      callback({ socketId, type: 'close', code: ev.code, reason: ev.reason });
    });

    return { success: true, data: socketId };
  }

  wsSend(appId: string, socketId: string, data: string): WebSocketResult<null> {
    const record = this.sockets.get(socketKey(appId, socketId));
    if (!record) {
      return { success: false, error: 'NotFound' };
    }
    if (record.socket.readyState !== WebSocket.OPEN) {
      return { success: false, error: 'ConnectionFailed' };
    }
    try {
      record.socket.send(data);
      return { success: true, data: null };
    } catch {
      return { success: false, error: 'UnknownError' };
    }
  }

  wsClose(appId: string, socketId: string, code?: number, reason?: string): WebSocketResult<null> {
    const record = this.sockets.get(socketKey(appId, socketId));
    if (!record) {
      return { success: false, error: 'NotFound' };
    }
    try {
      if (code !== undefined) {
        record.socket.close(code, reason);
      } else {
        record.socket.close();
      }
      // The 'close' event handler will remove the record from the map.
      return { success: true, data: null };
    } catch {
      return { success: false, error: 'UnknownError' };
    }
  }

  wsCloseAllForApp(appId: string): void {
    for (const [key, record] of this.sockets) {
      if (record.appId === appId) {
        try { record.socket.close(); } catch { /* ignore */ }
        this.sockets.delete(key);
      }
    }
  }

  wsGetStatus(appId: string, socketId: string): WebSocketResult<WebSocketStatus> {
    const record = this.sockets.get(socketKey(appId, socketId));
    if (!record) {
      return { success: false, error: 'NotFound' };
    }
    return {
      success: true,
      data: {
        socketId,
        url: record.url,
        readyState: record.socket.readyState as 0 | 1 | 2 | 3,
      },
    };
  }

  wsListConnections(appId: string): WebSocketResult<WebSocketStatus[]> {
    const result: WebSocketStatus[] = [];
    for (const record of this.sockets.values()) {
      if (record.appId === appId) {
        result.push({
          socketId: record.socketId,
          url: record.url,
          readyState: record.socket.readyState as 0 | 1 | 2 | 3,
        });
      }
    }
    return { success: true, data: result };
  }

  // ── Internal helpers ────────────────────────────────────────

  private extractHost(url: string): string | null {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  private isAllowedHost(hostname: string): boolean {
    return this.allowlist.some(entry => this.matchPattern(entry.pattern, hostname.toLowerCase()));
  }

  private countSocketsForApp(appId: string): number {
    let count = 0;
    for (const record of this.sockets.values()) {
      if (record.appId === appId) count++;
    }
    return count;
  }

  /**
   * Match a glob-like pattern against a hostname.
   * Supports:
   *  - exact match: "api.example.com"
   *  - wildcard subdomain: "*.example.com"  (matches a.example.com, b.c.example.com, but NOT example.com itself)
   *  - full wildcard: "*" (matches everything)
   */
  private matchPattern(pattern: string, host: string): boolean {
    if (pattern === '*') return true;
    if (pattern === host) return true;
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(1);  // ".example.com"
      return host.endsWith(suffix);
    }
    return false;
  }
}
