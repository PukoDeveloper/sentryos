// ────────────────────────────────────────────────────────────
// AuthProvider — local (default password) and remote (endpoint) auth
// ────────────────────────────────────────────────────────────

import type { EnvironmentManager } from '../environment/EnvironmentManager';
import type { NetworkAdapter } from '../network/NetworkAdapter';
import type { Result } from '../kernel/types';

export type AuthError = 'InvalidCredentials' | 'NetworkError' | 'ServerError' | 'ConfigError';
export type AuthSuccessData = { username: string; userKey: string };
export type AuthResult = Result<AuthSuccessData, AuthError>;

/**
 * Handles user authentication.
 *
 * - **Local mode** (default): accepts any username + password `"0000"`.
 * - **Remote mode**: activated when `/auth.config.json` contains an
 *   `AUTH_ENDPOINT` field.  Credentials are POSTed to that URL and the
 *   server must respond with `{ userkey: string }`.
 *
 * Developers who want remote auth should place `auth.config.json` in the
 * `public/` directory (see `auth.config.json.example`).
 */
export class AuthProvider {
  private authEndpoint: string | null = null;
  private readonly envManager: EnvironmentManager;
  private readonly networkManager: NetworkAdapter;

  constructor(envManager: EnvironmentManager, networkManager: NetworkAdapter) {
    this.envManager = envManager;
    this.networkManager = networkManager;
  }

  /**
   * Attempt to load `/auth.config.json`.  If the file is present and
   * contains a valid `AUTH_ENDPOINT`, remote mode is activated.
   * Failures are silently ignored — the system falls back to local mode.
   */
  async loadConfig(): Promise<void> {
    try {
      const res = await fetch('/auth.config.json');
      if (!res.ok) return;

      const config: unknown = await res.json();
      if (
        config !== null &&
        typeof config === 'object' &&
        'AUTH_ENDPOINT' in config &&
        typeof (config as Record<string, unknown>).AUTH_ENDPOINT === 'string'
      ) {
        const endpoint = (config as Record<string, string>).AUTH_ENDPOINT.trim();
        if (endpoint) {
          this.authEndpoint = endpoint;
          this.envManager.setVariable('AUTH_ENDPOINT', endpoint);
        }
      }
    } catch {
      // No config file or JSON parse error — use local mode
    }
  }

  /** `true` when no remote endpoint is configured (local-mode default password). */
  get isLocalMode(): boolean {
    return this.authEndpoint === null;
  }

  /**
   * Authenticate `username` / `password`.
   * Returns a `Result` — never throws.
   */
  async authenticate(username: string, password: string): Promise<AuthResult> {
    if (this.authEndpoint) {
      return this.remoteAuthenticate(username, password);
    }
    return this.localAuthenticate(username, password);
  }

  // ── Private helpers ─────────────────────────────────────────

  private localAuthenticate(username: string, password: string): AuthResult {
    if (password === '0000') {
      return { success: true, data: { username, userKey: `local_${username}` } };
    }
    return { success: false, error: 'InvalidCredentials' };
  }

  private async remoteAuthenticate(username: string, password: string): Promise<AuthResult> {
    const endpoint = this.authEndpoint!;

    // Ensure the endpoint hostname is in the network allowlist
    try {
      const host = new URL(endpoint).hostname;
      this.networkManager.addAllowlistEntry(host, 'AUTH_ENDPOINT (auto-added by AuthProvider)');
    } catch {
      return { success: false, error: 'ConfigError' };
    }

    const netResult = await this.networkManager.request('system', {
      url: endpoint,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!netResult.success || !netResult.data) {
      return { success: false, error: 'NetworkError' };
    }

    const { status, body } = netResult.data;

    // Treat any non-2xx response as invalid credentials (no info leakage)
    if (status < 200 || status >= 300) {
      return { success: false, error: 'InvalidCredentials' };
    }

    try {
      const data: unknown = JSON.parse(body);
      if (
        data !== null &&
        typeof data === 'object' &&
        'userkey' in data &&
        typeof (data as Record<string, unknown>).userkey === 'string'
      ) {
        const userKey = (data as Record<string, string>).userkey;
        return { success: true, data: { username, userKey } };
      }
      return { success: false, error: 'ServerError' };
    } catch {
      return { success: false, error: 'ServerError' };
    }
  }
}
