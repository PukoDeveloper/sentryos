import type { Result } from '../kernel/types';

// ── Network types ───────────────────────────────────────────
export type NetworkError =
  | 'PermissionDenied'
  | 'NotAllowed'
  | 'ConnectionFailed'
  | 'Timeout'
  | 'InvalidUrl'
  | 'Disabled'
  | 'UnknownError';

export type NetworkResult<T = unknown> = Result<T, NetworkError>;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export interface NetworkRequest {
  url: string;
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

export interface NetworkResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

export interface AllowlistEntry {
  pattern: string;          // glob-like pattern, e.g. "*.example.com", "api.github.com"
  description?: string;
  createdAt: number;
}

export interface NetworkStatus {
  enabled: boolean;
  allowlistCount: number;
  totalRequests: number;
  blockedRequests: number;
}

// ── Abstract interface ──────────────────────────────────────
export interface NetworkAdapter {
  /** Check whether the network subsystem is enabled. */
  isEnabled(): boolean;

  /** Enable or disable the entire network subsystem. */
  setEnabled(enabled: boolean): void;

  /** Send an HTTP request (subject to allowlist and permissions). */
  request(appId: string, req: NetworkRequest): Promise<NetworkResult<NetworkResponse>>;

  /** Check if a given URL/host is allowed by the current policy. */
  isAllowed(url: string): boolean;

  /** Return the full allowlist. */
  getAllowlist(): AllowlistEntry[];

  /** Add a pattern to the allowlist. Returns the new entry. */
  addAllowlistEntry(pattern: string, description?: string): NetworkResult<AllowlistEntry>;

  /** Remove a pattern from the allowlist. */
  removeAllowlistEntry(pattern: string): NetworkResult<string>;

  /** Return network status summary. */
  getStatus(): NetworkStatus;
}
