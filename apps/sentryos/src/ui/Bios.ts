type DangerLevel = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

import { Z_INDEX_BOOT_TERMINAL, Z_INDEX_ERROR_SCREEN } from '../kernel/constants';

interface ErrorScreenAction {
  label: string;
  handler: () => void;
}

function getAppDiv(): HTMLDivElement | null {
  const element = document.getElementById('app');
  if (!(element instanceof HTMLDivElement)) {
    return null;
  }

  if (!element.isConnected) {
    return null;
  }

  return element;
}

class BIOS {
  private terminalOverlay: HTMLDivElement | null = null;
  private terminalLogArea: HTMLDivElement | null = null;
  private errorOverlay: HTMLDivElement | null = null;
  private hasWarnedAboutMissingAppDiv = false;
  private injectedContainer: HTMLElement | null = null;

  /**
   * Override the container used for boot-terminal and error-screen overlays.
   * When set, `getAppDiv()` is bypassed entirely.  Call this before any other
   * BIOS method when embedding SentryOS inside a host page element.
   */
  setContainer(container: HTMLElement): void {
    this.injectedContainer = container;
  }

  private getActiveLogArea(): HTMLDivElement | null {
    if (!this.terminalOverlay || !this.terminalLogArea) {
      return null;
    }

    if (!this.terminalOverlay.isConnected || !this.terminalLogArea.isConnected) {
      this.terminalOverlay = null;
      this.terminalLogArea = null;
      return null;
    }

    return this.terminalLogArea;
  }

  private ensureAppDiv(): HTMLDivElement | null {
    // Prefer the explicitly injected container when available.
    if (this.injectedContainer) {
      if (!this.injectedContainer.isConnected) {
        if (!this.hasWarnedAboutMissingAppDiv) {
          console.warn(this.formatLine('BIOS', 'WARN', 'injected container is disconnected; falling back to console output'));
          this.hasWarnedAboutMissingAppDiv = true;
        }
        this.terminalOverlay = null;
        this.terminalLogArea = null;
        return null;
      }
      this.hasWarnedAboutMissingAppDiv = false;
      // The injected container may be any element type; BIOS only needs an
      // HTMLElement to appendChild overlays, so cast is safe here.
      return this.injectedContainer as HTMLDivElement;
    }

    const root = getAppDiv();
    if (root) {
      this.hasWarnedAboutMissingAppDiv = false;
      return root;
    }

    if (!this.hasWarnedAboutMissingAppDiv) {
      console.warn(this.formatLine('BIOS', 'WARN', 'appDiv is unavailable; falling back to console output'));
      this.hasWarnedAboutMissingAppDiv = true;
    }

    this.terminalOverlay = null;
    this.terminalLogArea = null;
    return null;
  }

  private nowTimestamp(): string {
    const now = new Date();
    const datePart = now.toISOString().replace('T', ' ').slice(0, 19);
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `${datePart}.${ms}`;
  }

  private formatLine(source: string, level: DangerLevel, message: string): string {
    return `[${this.nowTimestamp()}] [${source}] [${level}] ${message}`;
  }

  log(source: string, level: DangerLevel, message: string): void {
    const line = this.formatLine(source, level, message);

    if (level === 'ERROR' || level === 'CRITICAL') {
      console.error(line);
    } else if (level === 'WARN') {
      console.warn(line);
    } else {
      console.log(line);
    }

    const logArea = this.getActiveLogArea();
    if (!logArea) {
      return;
    }

    const row = document.createElement('div');
    row.textContent = line;
    row.style.color =
      level === 'CRITICAL' ? '#ff5f56' :
        level === 'ERROR' ? '#ff9f43' :
          level === 'WARN' ? '#ffd166' : '#9ef3c5';

    logArea.appendChild(row);
    logArea.scrollTop = logArea.scrollHeight;
  }

  createBootTerminal(): void {
    if (this.getActiveLogArea()) {
      return;
    }

    const root = this.ensureAppDiv();
    if (!root) {
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'bios-boot-terminal';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = String(Z_INDEX_BOOT_TERMINAL);
    overlay.style.background = 'radial-gradient(circle at top, #1a1f2a 0%, #020406 65%)';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.padding = '24px';
    overlay.style.boxSizing = 'border-box';
    overlay.style.fontFamily = 'Consolas, "Courier New", monospace';
    overlay.style.color = '#9ef3c5';

    const header = document.createElement('div');
    header.textContent = 'SentryOS BIOS Boot Terminal';
    header.style.fontSize = '16px';
    header.style.marginBottom = '12px';
    header.style.letterSpacing = '0.08em';
    header.style.textTransform = 'uppercase';

    const logArea = document.createElement('div');
    logArea.style.flex = '1';
    logArea.style.overflowY = 'auto';
    logArea.style.whiteSpace = 'pre-wrap';
    logArea.style.lineHeight = '1.5';
    logArea.style.border = '1px solid rgba(158, 243, 197, 0.35)';
    logArea.style.padding = '12px';
    logArea.style.background = 'rgba(1, 8, 12, 0.62)';

    overlay.appendChild(header);
    overlay.appendChild(logArea);

    if (!root.isConnected) {
      console.warn(this.formatLine('BIOS', 'WARN', 'appDiv became unavailable before boot terminal mount'));
      return;
    }

    root.appendChild(overlay);

    this.terminalOverlay = overlay;
    this.terminalLogArea = logArea;
    this.log('BIOS', 'INFO', 'Boot terminal mounted');
  }

  destroyBootTerminal(): void {
    const overlay = this.terminalOverlay;
    if (!overlay) {
      return;
    }

    this.log('BIOS', 'INFO', 'Boot terminal unmounted');
    if (overlay.isConnected) {
      overlay.remove();
    }
    this.terminalOverlay = null;
    this.terminalLogArea = null;
  }

  showErrorScreen(title: string, details: string[], actions?: ErrorScreenAction[]): void {
    this.hideErrorScreen();

    const root = this.ensureAppDiv();
    if (!root) {
      console.error(`[BIOS ERROR SCREEN] ${title}\n${details.join('\n')}`);
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'bios-error-terminal';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = String(Z_INDEX_ERROR_SCREEN);
    overlay.style.background = 'radial-gradient(circle at top, #1a0a0a 0%, #0a0204 65%)';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.padding = '24px';
    overlay.style.boxSizing = 'border-box';
    overlay.style.fontFamily = 'Consolas, "Courier New", monospace';
    overlay.style.color = '#ff8a8a';

    const header = document.createElement('div');
    header.textContent = 'SentryOS BIOS — System Error';
    header.style.fontSize = '16px';
    header.style.marginBottom = '12px';
    header.style.letterSpacing = '0.08em';
    header.style.textTransform = 'uppercase';
    header.style.color = '#ff5f56';

    const titleRow = document.createElement('div');
    titleRow.textContent = title;
    titleRow.style.fontSize = '14px';
    titleRow.style.marginBottom = '8px';
    titleRow.style.color = '#ffa07a';
    titleRow.style.fontWeight = 'bold';

    const logArea = document.createElement('div');
    logArea.style.flex = '1';
    logArea.style.overflowY = 'auto';
    logArea.style.whiteSpace = 'pre-wrap';
    logArea.style.lineHeight = '1.5';
    logArea.style.border = '1px solid rgba(255, 95, 86, 0.35)';
    logArea.style.padding = '12px';
    logArea.style.background = 'rgba(12, 1, 1, 0.62)';
    logArea.style.color = '#e8c4c4';
    logArea.style.fontSize = '13px';

    for (const line of details) {
      const row = document.createElement('div');
      row.textContent = line;
      if (line.includes('[CRITICAL]') || line.includes('[ERROR]')) {
        row.style.color = '#ff5f56';
      } else if (line.includes('[WARN]')) {
        row.style.color = '#ffd166';
      }
      logArea.appendChild(row);
    }

    overlay.appendChild(header);
    overlay.appendChild(titleRow);
    overlay.appendChild(logArea);

    if (actions && actions.length > 0) {
      const actionBar = document.createElement('div');
      actionBar.style.display = 'flex';
      actionBar.style.gap = '12px';
      actionBar.style.marginTop = '16px';

      for (const action of actions) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = action.label;
        btn.style.padding = '8px 24px';
        btn.style.background = 'rgba(255, 95, 86, 0.15)';
        btn.style.color = '#ff8a8a';
        btn.style.border = '1px solid rgba(255, 95, 86, 0.4)';
        btn.style.borderRadius = '4px';
        btn.style.cursor = 'pointer';
        btn.style.fontFamily = 'inherit';
        btn.style.fontSize = '13px';
        btn.addEventListener('click', action.handler);
        actionBar.appendChild(btn);
      }
      overlay.appendChild(actionBar);
    }

    if (!root.isConnected) {
      console.error(`[BIOS ERROR SCREEN] ${title}\n${details.join('\n')}`);
      return;
    }

    root.appendChild(overlay);
    this.errorOverlay = overlay;
    this.log('BIOS', 'CRITICAL', `Error screen displayed: ${title}`);
  }

  hideErrorScreen(): void {
    const overlay = this.errorOverlay;
    if (!overlay) {
      return;
    }

    if (overlay.isConnected) {
      overlay.remove();
    }
    this.errorOverlay = null;
  }

  init(): void {
    this.log('BIOS', 'INFO', 'BIOS initialized');
  }
}

const bios = new BIOS();

export { BIOS, bios, type DangerLevel, type ErrorScreenAction, getAppDiv };
