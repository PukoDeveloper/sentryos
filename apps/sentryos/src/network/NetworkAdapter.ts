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

// ── WebSocket types ─────────────────────────────────────────
export type WebSocketError =
  | 'PermissionDenied'
  | 'NotAllowed'
  | 'ConnectionFailed'
  | 'Disabled'
  | 'InvalidUrl'
  | 'NotFound'
  | 'TooManyConnections'
  | 'UnknownError';

export type WebSocketResult<T = unknown> = Result<T, WebSocketError>;

/** WebSocket ready-state values matching the browser WebSocket API. */
export type WebSocketReadyState = 0 | 1 | 2 | 3; // CONNECTING | OPEN | CLOSING | CLOSED

export type WebSocketEventType = 'open' | 'message' | 'error' | 'close';

/** Event pushed to the sandbox handler when a WebSocket event occurs. */
export interface WebSocketEvent {
  socketId: string;
  type: WebSocketEventType;
  /** Message payload (present for 'message' events). */
  data?: string;
  /** Close status code (present for 'close' events). */
  code?: number;
  /** Close reason string (present for 'close' events). */
  reason?: string;
}

/** Snapshot of a live WebSocket connection. */
export interface WebSocketStatus {
  socketId: string;
  url: string;
  readyState: WebSocketReadyState;
}

/** Callback invoked on the host side when a WebSocket event arrives. */
export type WebSocketEventCallback = (event: WebSocketEvent) => void;

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

  // ── WebSocket ─────────────────────────────────────────────

  /**
   * Open a WebSocket connection on behalf of appId.
   * @param appId       The process credential ID that owns this connection.
   * @param socketId    A caller-supplied unique ID for this socket within the process.
   * @param url         The WebSocket URL (ws:// or wss://).
   * @param callback    Host-side callback invoked for each WebSocket event.
   */
  wsConnect(
    appId: string,
    socketId: string,
    url: string,
    callback: WebSocketEventCallback,
  ): WebSocketResult<string>;

  /** Send a text message on an open WebSocket connection. */
  wsSend(appId: string, socketId: string, data: string): WebSocketResult<null>;

  /** Close a WebSocket connection (optionally with code and reason). */
  wsClose(appId: string, socketId: string, code?: number, reason?: string): WebSocketResult<null>;

  /** Close all WebSocket connections owned by appId (called on process termination). */
  wsCloseAllForApp(appId: string): void;

  /** Return the status snapshot of a single WebSocket connection. */
  wsGetStatus(appId: string, socketId: string): WebSocketResult<WebSocketStatus>;

  /** Return the status snapshots of all WebSocket connections owned by appId. */
  wsListConnections(appId: string): WebSocketResult<WebSocketStatus[]>;
}
