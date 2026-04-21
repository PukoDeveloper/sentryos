import type {
  NetworkAdapter,
  NetworkRequest,
  NetworkResponse,
  NetworkResult,
  NetworkStatus,
  AllowlistEntry,
} from './NetworkAdapter';

/**
 * Concrete NetworkAdapter that enforces a host/pattern allowlist.
 * Only URLs matching at least one allowlist entry are permitted.
 */
export class AllowlistNetworkManager implements NetworkAdapter {
  private enabled = true;
  private allowlist: AllowlistEntry[] = [];
  private totalRequests = 0;
  private blockedRequests = 0;

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

  // ── Internal helpers ────────────────────────────────────────

  private extractHost(url: string): string | null {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
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
