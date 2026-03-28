import type { Application } from '../application/ApplicationManager';
import type { RegisteredApplication } from '../application/ApplicationCatalog';
import { getAppDiv } from './Bios';
import { CLOCK_UPDATE_INTERVAL_MS } from '../kernel/constants';

type DesktopOverlayRegistration = {
  id: string;
  element: HTMLElement;
  order?: number;
};

class DesktopShell {
  private root: HTMLDivElement | null = null;
  private overlayLayer: HTMLDivElement | null = null;
  private windowLayer: HTMLDivElement | null = null;
  private taskbarAppList: HTMLDivElement | null = null;
  private startPanel: HTMLDivElement | null = null;
  private startSearchInput: HTMLInputElement | null = null;
  private startSearchList: HTMLDivElement | null = null;
  private allApps: RegisteredApplication[] = [];
  private openedWindows = new Map<string, { windowId: string; title: string; state: string; processAppId: string; icon?: string }>();
  private launchHandler: ((app: RegisteredApplication) => void) | null = null;
  private taskbarWindowClickHandler: ((windowId: string, processAppId: string) => void) | null = null;
  private clockLabel: HTMLDivElement | null = null;
  private overlays = new Map<string, DesktopOverlayRegistration>();
  private clockTimer: number | null = null;

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

  syncOpenWindows(windows: Array<{ windowId: string; title: string; state: string; processAppId: string; icon?: string }>): void {
    this.openedWindows.clear();
    for (const windowInfo of windows) {
      this.openedWindows.set(windowInfo.windowId, windowInfo);
    }
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

    this.root?.remove();
    this.root = null;
    this.overlayLayer = null;
    this.windowLayer = null;
    this.taskbarAppList = null;
    this.startPanel = null;
    this.startSearchInput = null;
    this.startSearchList = null;
    this.clockLabel = null;
    this.openedWindows.clear();
    this.overlays.clear();
  }

  private renderTaskbar(): void {
    if (!this.taskbarAppList) {
      return;
    }

    this.taskbarAppList.replaceChildren();
    for (const windowInfo of this.openedWindows.values()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'desktop-taskbar-app';
      button.title = windowInfo.title;
      button.dataset.windowState = windowInfo.state;

      const icon = document.createElement('span');
      icon.className = 'desktop-taskbar-app-icon';
      if (windowInfo.icon) {
        const img = document.createElement('img');
        img.src = windowInfo.icon;
        img.alt = '';
        img.draggable = false;
        img.addEventListener('error', () => {
          img.remove();
          icon.textContent = windowInfo.title.charAt(0).toUpperCase();
        });
        icon.appendChild(img);
      } else {
        icon.textContent = windowInfo.title.charAt(0).toUpperCase();
      }

      button.appendChild(icon);
      button.addEventListener('click', () => {
        this.taskbarWindowClickHandler?.(windowInfo.windowId, windowInfo.processAppId);
      });
      this.taskbarAppList.appendChild(button);
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

export { DesktopShell, type DesktopOverlayRegistration };
