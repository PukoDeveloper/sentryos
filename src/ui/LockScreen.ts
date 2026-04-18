// ────────────────────────────────────────────────────────────
// LockScreen — full-screen login overlay shown before the desktop mounts
// ────────────────────────────────────────────────────────────

import { Z_INDEX_LOCK_SCREEN } from '../kernel/constants';
import { getAppDiv } from './Bios';
import type { AuthProvider } from '../auth/AuthProvider';

export interface LockScreenResult {
  username: string;
  userkey: string;
}

const DEFAULT_USERNAME = 'User';

/**
 * Full-screen lock screen rendered before the desktop shell is mounted.
 *
 * Call `show(authProvider)` to display it; the returned `Promise` resolves
 * with the authenticated user's data once login succeeds.  The overlay
 * removes itself automatically on success.
 */
export class LockScreen {
  private overlay: HTMLDivElement | null = null;

  /**
   * Render the lock screen and wait for a successful login.
   * The overlay is automatically dismissed on success.
   *
   * If the app root element is unavailable the method immediately resolves
   * with a default anonymous user so the boot sequence can continue.
   */
  show(authProvider: AuthProvider): Promise<LockScreenResult> {
    return new Promise((resolve) => {
      const root = getAppDiv();
      if (!root) {
        resolve({ username: DEFAULT_USERNAME, userkey: `local_${DEFAULT_USERNAME}` });
        return;
      }

      let currentUsername = DEFAULT_USERNAME;
      let editMode = false;

      // ── Overlay ─────────────────────────────────────────────
      const overlay = document.createElement('div');
      overlay.id = 'lock-screen-overlay';
      Object.assign(overlay.style, {
        position: 'fixed',
        inset: '0',
        zIndex: String(Z_INDEX_LOCK_SCREEN),
        background: 'radial-gradient(ellipse at 50% 20%, #1c2340 0%, #060810 60%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: '#e8eaf0',
      });

      // ── Brand ────────────────────────────────────────────────
      const brand = document.createElement('div');
      brand.textContent = 'SentryOS';
      Object.assign(brand.style, {
        fontSize: '34px',
        fontWeight: '200',
        letterSpacing: '0.3em',
        textTransform: 'uppercase',
        color: '#aabcd8',
        marginBottom: '48px',
        userSelect: 'none',
      });

      // ── Card ─────────────────────────────────────────────────
      const card = document.createElement('div');
      Object.assign(card.style, {
        width: '320px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      });

      // ── Username row ─────────────────────────────────────────
      const usernameRow = document.createElement('div');
      Object.assign(usernameRow.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      });

      // Static label
      const usernameLabel = document.createElement('span');
      usernameLabel.textContent = currentUsername;
      Object.assign(usernameLabel.style, {
        flex: '1',
        fontSize: '15px',
        color: '#c8d4e8',
        padding: '8px 12px',
        background: 'rgba(255,255,255,0.05)',
        borderRadius: '6px',
        border: '1px solid rgba(255,255,255,0.08)',
        userSelect: 'none',
      });

      // Edit input (hidden by default)
      const usernameInput = document.createElement('input');
      usernameInput.type = 'text';
      usernameInput.value = currentUsername;
      Object.assign(usernameInput.style, {
        flex: '1',
        display: 'none',
        fontSize: '15px',
        color: '#e8eaf0',
        padding: '8px 12px',
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(100,140,220,0.5)',
        borderRadius: '6px',
        outline: 'none',
        fontFamily: 'inherit',
        boxSizing: 'border-box',
      });

      // Pencil / confirm edit button
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.title = 'Edit username';
      editBtn.textContent = '✏';
      Object.assign(editBtn.style, {
        flexShrink: '0',
        width: '36px',
        height: '36px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '15px',
        color: '#c8d4e8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'inherit',
      });

      const commitUsername = () => {
        currentUsername = usernameInput.value.trim() || DEFAULT_USERNAME;
        usernameLabel.textContent = currentUsername;
        usernameLabel.style.display = '';
        usernameInput.style.display = 'none';
        editBtn.textContent = '✏';
        editMode = false;
      };

      editBtn.addEventListener('click', () => {
        if (editMode) {
          commitUsername();
        } else {
          editMode = true;
          usernameLabel.style.display = 'none';
          usernameInput.style.display = '';
          usernameInput.value = currentUsername;
          editBtn.textContent = '✔';
          usernameInput.focus();
          usernameInput.select();
        }
      });

      usernameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          commitUsername();
          passwordInput.focus();
        } else if (e.key === 'Escape') {
          usernameInput.value = currentUsername;
          commitUsername();
        }
      });

      usernameRow.appendChild(usernameLabel);
      usernameRow.appendChild(usernameInput);
      usernameRow.appendChild(editBtn);

      // ── Password input ───────────────────────────────────────
      const passwordInput = document.createElement('input');
      passwordInput.type = 'password';
      passwordInput.placeholder = 'Password';
      Object.assign(passwordInput.style, {
        fontSize: '15px',
        color: '#e8eaf0',
        padding: '10px 12px',
        background: 'rgba(255,255,255,0.07)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '6px',
        outline: 'none',
        fontFamily: 'inherit',
        width: '100%',
        boxSizing: 'border-box',
      });

      // ── Error message ────────────────────────────────────────
      const errorMsg = document.createElement('div');
      Object.assign(errorMsg.style, {
        fontSize: '13px',
        color: '#ff8080',
        textAlign: 'center',
        minHeight: '18px',
        visibility: 'hidden',
        userSelect: 'none',
      });

      // ── Login button ─────────────────────────────────────────
      const loginBtn = document.createElement('button');
      loginBtn.type = 'button';
      loginBtn.textContent = 'Login';
      Object.assign(loginBtn.style, {
        padding: '10px',
        width: '100%',
        background: 'rgba(70,110,220,0.25)',
        color: '#a8c8f8',
        border: '1px solid rgba(70,110,220,0.4)',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '15px',
        fontFamily: 'inherit',
        fontWeight: '500',
      });

      // ── Login logic ──────────────────────────────────────────
      let loading = false;

      const doLogin = async () => {
        if (loading) return;

        // Commit any pending username edit first
        if (editMode) commitUsername();

        const username = currentUsername;
        const password = passwordInput.value;

        loading = true;
        loginBtn.disabled = true;
        loginBtn.textContent = 'Logging in…';
        loginBtn.style.opacity = '0.65';
        errorMsg.style.visibility = 'hidden';

        const result = await authProvider.authenticate(username, password);

        loading = false;
        loginBtn.disabled = false;
        loginBtn.textContent = 'Login';
        loginBtn.style.opacity = '1';

        if (result.success && result.data) {
          this.dismiss();
          resolve({ username: result.data.username, userkey: result.data.userKey });
        } else {
          errorMsg.textContent = 'Invalid credentials. Please try again.';
          errorMsg.style.visibility = 'visible';
          passwordInput.value = '';
          passwordInput.focus();
        }
      };

      loginBtn.addEventListener('click', doLogin);
      passwordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doLogin();
      });

      // ── Assemble ─────────────────────────────────────────────
      card.appendChild(usernameRow);
      card.appendChild(passwordInput);
      card.appendChild(errorMsg);
      card.appendChild(loginBtn);

      overlay.appendChild(brand);
      overlay.appendChild(card);

      root.appendChild(overlay);
      this.overlay = overlay;

      passwordInput.focus();
    });
  }

  dismiss(): void {
    if (this.overlay?.isConnected) {
      this.overlay.remove();
    }
    this.overlay = null;
  }
}

export const lockScreen = new LockScreen();
