import type { Application } from '../application/ApplicationManager';
import type { RegisteredApplication } from '../application/ApplicationCatalog';
import { getAppDiv } from './Bios';
import { CLOCK_UPDATE_INTERVAL_MS } from '../kernel/constants';

type WindowInfo = { windowId: string; title: string; state: string; processAppId: string; appDefId: string; icon?: string };

type DesktopOverlayRegistration = {
  id: string;
  element: HTMLElement;
  order?: number;
};

export type ThemeSettings = {
  wallpaper?: string;
  tint?: string;
  accentPrimary?: string;
  accentSecondary?: string;
  taskbarOpacity?: number;
};

class DesktopShell {
  private root: HTMLDivElement | null = null;
  private overlayLayer: HTMLDivElement | null = null;
  private windowLayer: HTMLDivElement | null = null;
  private wallpaperLayer: HTMLDivElement | null = null;
  private wallpaperTint: HTMLDivElement | null = null;
  private taskbarEl: HTMLDivElement | null = null;
  private startButtonEl: HTMLButtonElement | null = null;
  private taskbarAppList: HTMLDivElement | null = null;
  private startPanel: HTMLDivElement | null = null;
  private startSearchInput: HTMLInputElement | null = null;
  private startSearchList: HTMLDivElement | null = null;
  private allApps: RegisteredApplication[] = [];
  private openedWindows = new Map<string, WindowInfo>();
  private lastTaskbarFingerprint = '';
  private launchHandler: ((app: RegisteredApplication) => void) | null = null;
  private taskbarWindowClickHandler: ((windowId: string, processAppId: string) => void) | null = null;
  private groupPopup: HTMLDivElement | null = null;
  private activeGroupAppDefId: string | null = null;
  private outsideClickHandler: ((e: MouseEvent) => void) | null = null;
  private clockLabel: HTMLDivElement | null = null;
  private overlays = new Map<string, DesktopOverlayRegistration>();
  private clockTimer: number | null = null;
  private currentTheme: ThemeSettings = {};

  mount(_applications: Application[]): boolean {
    const appRoot = getAppDiv();
    if (!appRoot) {
      return false;
    }

    appRoot.replaceChildren();

    const root = document.createElement('div');
    root.className = 'desktop-shell';

    const wallpaperLayer = document.createElement('div');
    wallpaperLayer.className = 'desktop-wallpaper';

    const wallpaperTint = document.createElement('div');
    wallpaperTint.className = 'desktop-wallpaper-tint';
    wallpaperLayer.appendChild(wallpaperTint);

    const overlayLayer = document.createElement('div');
    overlayLayer.className = 'desktop-overlay-layer';

    const windowLayer = document.createElement('div');
    windowLayer.className = 'desktop-window-layer';

    const taskbar = document.createElement('div');
    taskbar.className = 'desktop-taskbar';

    const startButton = document.createElement('button');
    startButton.className = 'desktop-taskbar-start';
    startButton.type = 'button';
    startButton.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="1" y="1" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="10" y="1" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="1" y="10" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="10" y="10" width="7" height="7" rx="1.5" fill="currentColor"/></svg>';

    const startPanel = document.createElement('div');
    startPanel.className = 'desktop-start-panel is-hidden';

    const startSearchInput = document.createElement('input');
    startSearchInput.className = 'desktop-start-search';
    startSearchInput.type = 'search';
    startSearchInput.placeholder = '搜尋應用程式';

    const startSearchList = document.createElement('div');
    startSearchList.className = 'desktop-start-list';

    startPanel.appendChild(startSearchInput);
    startPanel.appendChild(startSearchList);

    const appList = document.createElement('div');
    appList.className = 'desktop-taskbar-apps';

    const clock = document.createElement('div');
    clock.className = 'desktop-taskbar-clock';

    taskbar.appendChild(startButton);
    taskbar.appendChild(appList);
    taskbar.appendChild(clock);

    root.appendChild(wallpaperLayer);
    root.appendChild(overlayLayer);
    root.appendChild(windowLayer);
    root.appendChild(startPanel);
    root.appendChild(taskbar);
    appRoot.appendChild(root);

    this.root = root;
    this.overlayLayer = overlayLayer;
    this.windowLayer = windowLayer;
    this.wallpaperLayer = wallpaperLayer;
    this.wallpaperTint = wallpaperTint;
    this.taskbarEl = taskbar;
    this.startButtonEl = startButton;
    this.taskbarAppList = appList;
    this.startPanel = startPanel;
    this.startSearchInput = startSearchInput;
    this.startSearchList = startSearchList;
    this.clockLabel = clock;

    startButton.addEventListener('click', () => {
      this.toggleStartPanel();
    });

    startSearchInput.addEventListener('input', () => {
      this.renderStartMenu();
    });

    this.renderTaskbar();
    this.renderStartMenu();
    this.updateClock();
    this.startClock();
    return true;
  }

  getWindowHost(): HTMLDivElement | null {
    return this.windowLayer;
  }

  setApplications(applications: RegisteredApplication[]): void {
    this.allApps = applications;
    this.renderStartMenu();
  }

  onLaunchRequest(handler: (app: RegisteredApplication) => void): void {
    this.launchHandler = handler;
  }

  onTaskbarWindowClick(handler: (windowId: string, processAppId: string) => void): void {
    this.taskbarWindowClickHandler = handler;
  }

  syncOpenWindows(windows: WindowInfo[]): void {
    // Build a fingerprint to skip redundant re-renders
    const fingerprint = windows.map(w => w.windowId + ':' + w.state + ':' + w.title).join('|');
    if (fingerprint === this.lastTaskbarFingerprint) {
      return;
    }
    this.lastTaskbarFingerprint = fingerprint;

    this.openedWindows.clear();
    for (const windowInfo of windows) {
      this.openedWindows.set(windowInfo.windowId, windowInfo);
    }
    this.closeGroupPopup();
    this.renderTaskbar();
  }

  registerOverlay(registration: DesktopOverlayRegistration): void {
    this.overlays.set(registration.id, registration);
    this.renderOverlays();
  }

  removeOverlay(id: string): void {
    this.overlays.delete(id);
    this.renderOverlays();
  }

  destroy(): void {
    if (this.clockTimer !== null) {
      window.clearInterval(this.clockTimer);
      this.clockTimer = null;
    }

    this.closeGroupPopup();
    this.root?.remove();
    this.root = null;
    this.overlayLayer = null;
    this.windowLayer = null;
    this.wallpaperLayer = null;
    this.wallpaperTint = null;
    this.taskbarEl = null;
    this.startButtonEl = null;
    this.taskbarAppList = null;
    this.startPanel = null;
    this.startSearchInput = null;
    this.startSearchList = null;
    this.clockLabel = null;
    this.openedWindows.clear();
    this.overlays.clear();
  }

  applyTheme(theme: ThemeSettings): void {
    if (theme.wallpaper !== undefined && this.wallpaperLayer) {
      this.wallpaperLayer.style.background = theme.wallpaper;
    }
    if (theme.tint !== undefined && this.wallpaperTint) {
      this.wallpaperTint.style.background = theme.tint;
    }
    if (theme.accentPrimary !== undefined && theme.accentSecondary !== undefined && this.startButtonEl) {
      this.startButtonEl.style.background = `linear-gradient(135deg, ${theme.accentPrimary}, ${theme.accentSecondary})`;
    }
    if (theme.taskbarOpacity !== undefined && this.taskbarEl) {
      const opacity = Math.max(0, Math.min(1, theme.taskbarOpacity));
      this.taskbarEl.style.background = `rgba(7, 12, 20, ${opacity})`;
    }
    Object.assign(this.currentTheme, theme);
  }

  getTheme(): ThemeSettings {
    return { ...this.currentTheme };
  }

  private renderTaskbar(): void {
    if (!this.taskbarAppList) {
      return;
    }

    this.taskbarAppList.replaceChildren();

    // 依 appDefId 分組
    const groups = new Map<string, WindowInfo[]>();
    for (const windowInfo of this.openedWindows.values()) {
      const key = windowInfo.appDefId;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(windowInfo);
    }

    for (const [appDefId, windows] of groups) {
      const representative = windows[0];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'desktop-taskbar-app';
      button.title = representative.title;
      button.dataset.appDefId = appDefId;

      // 若全部都是 minimized，按鈕顯示為 minimized
      const allMinimized = windows.every(w => w.state === 'minimized');
      button.dataset.windowState = allMinimized ? 'minimized' : 'normal';

      const icon = document.createElement('span');
      icon.className = 'desktop-taskbar-app-icon';
      if (representative.icon) {
        const img = document.createElement('img');
        img.src = representative.icon;
        img.alt = '';
        img.draggable = false;
        img.addEventListener('error', () => {
          img.remove();
          icon.textContent = representative.title.charAt(0).toUpperCase();
        });
        icon.appendChild(img);
      } else {
        icon.textContent = representative.title.charAt(0).toUpperCase();
      }

      button.appendChild(icon);

      // 多視窗時顯示數量 badge
      if (windows.length > 1) {
        const badge = document.createElement('span');
        badge.className = 'desktop-taskbar-app-badge';
        badge.textContent = String(windows.length);
        button.appendChild(badge);
      }

      button.addEventListener('click', (e) => {
        e.stopPropagation();
        if (windows.length === 1) {
          // 單一視窗直接 focus
          this.taskbarWindowClickHandler?.(windows[0].windowId, windows[0].processAppId);
        } else {
          // 多視窗切換分組面板
          this.toggleGroupPopup(appDefId, windows, button);
        }
      });

      this.taskbarAppList.appendChild(button);
    }
  }

  private toggleGroupPopup(appDefId: string, windows: WindowInfo[], anchor: HTMLButtonElement): void {
    // 若已開啟同一個群組面板，關閉它
    if (this.activeGroupAppDefId === appDefId && this.groupPopup) {
      this.closeGroupPopup();
      return;
    }

    this.closeGroupPopup();

    const popup = document.createElement('div');
    popup.className = 'desktop-taskbar-group-popup';

    for (const w of windows) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'desktop-taskbar-group-item';
      item.dataset.windowState = w.state;

      const label = document.createElement('span');
      label.className = 'desktop-taskbar-group-item-label';
      label.textContent = w.title;
      item.appendChild(label);

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.taskbarWindowClickHandler?.(w.windowId, w.processAppId);
        this.closeGroupPopup();
      });

      popup.appendChild(item);
    }

    // 定位：在錨定按鈕正上方
    const anchorRect = anchor.getBoundingClientRect();
    const rootRect = this.root?.getBoundingClientRect();
    if (rootRect) {
      popup.style.left = `${anchorRect.left - rootRect.left + anchorRect.width / 2}px`;
      popup.style.bottom = `${rootRect.height - anchorRect.top + rootRect.top + 8}px`;
    }

    this.root?.appendChild(popup);
    this.groupPopup = popup;
    this.activeGroupAppDefId = appDefId;

    // 点击外部关闭
    this.outsideClickHandler = (e: MouseEvent) => {
      if (!popup.contains(e.target as Node) && !anchor.contains(e.target as Node)) {
        this.closeGroupPopup();
      }
    };
    document.addEventListener('click', this.outsideClickHandler, true);
  }

  private closeGroupPopup(): void {
    if (this.groupPopup) {
      this.groupPopup.remove();
      this.groupPopup = null;
    }
    this.activeGroupAppDefId = null;
    if (this.outsideClickHandler) {
      document.removeEventListener('click', this.outsideClickHandler, true);
      this.outsideClickHandler = null;
    }
  }

  private toggleStartPanel(): void {
    if (!this.startPanel) {
      return;
    }

    this.startPanel.classList.toggle('is-hidden');
    if (!this.startPanel.classList.contains('is-hidden')) {
      this.startSearchInput?.focus();
      this.renderStartMenu();
    }
  }

  private renderStartMenu(): void {
    if (!this.startSearchList) {
      return;
    }

    const keyword = (this.startSearchInput?.value ?? '').trim().toLowerCase();
    const matches = this.allApps.filter((app) => {
      if (!keyword) {
        return true;
      }

      const text = `${app.name} ${app.description ?? ''}`.toLowerCase();
      return text.includes(keyword);
    });

    this.startSearchList.replaceChildren();

    for (const app of matches) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'desktop-start-item';

      const iconEl = document.createElement('span');
      iconEl.className = 'desktop-start-item-icon';
      if (app.icon) {
        const img = document.createElement('img');
        img.src = app.icon;
        img.alt = '';
        img.draggable = false;
        img.addEventListener('error', () => {
          img.remove();
          iconEl.textContent = app.name.charAt(0).toUpperCase();
        });
        iconEl.appendChild(img);
      } else {
        iconEl.textContent = app.name.charAt(0).toUpperCase();
      }

      const label = document.createElement('span');
      label.className = 'desktop-start-item-label';
      label.textContent = app.name;

      button.appendChild(iconEl);
      button.appendChild(label);
      button.addEventListener('click', () => {
        this.launchHandler?.(app);
        this.startPanel?.classList.add('is-hidden');
      });
      this.startSearchList.appendChild(button);
    }
  }

  private renderOverlays(): void {
    if (!this.overlayLayer) {
      return;
    }

    this.overlayLayer.replaceChildren();
    const sorted = Array.from(this.overlays.values()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const overlay of sorted) {
      this.overlayLayer.appendChild(overlay.element);
    }
  }

  private updateClock(): void {
    if (!this.clockLabel) {
      return;
    }

    const now = new Date();
    this.clockLabel.textContent = now.toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private startClock(): void {
    if (this.clockTimer !== null) {
      window.clearInterval(this.clockTimer);
    }

    this.clockTimer = window.setInterval(() => {
      this.updateClock();
    }, CLOCK_UPDATE_INTERVAL_MS);
  }
}

export { DesktopShell, type DesktopOverlayRegistration, type ThemeSettings };
