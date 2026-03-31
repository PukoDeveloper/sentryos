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
  startMenuWidth?: number;
  startMenuHeight?: number;
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
  private startFolderList: HTMLDivElement | null = null;
  private allApps: RegisteredApplication[] = [];
  private openedWindows = new Map<string, WindowInfo>();
  private lastTaskbarFingerprint = '';
  private launchHandler: ((app: RegisteredApplication) => void) | null = null;
  private taskbarWindowClickHandler: ((windowId: string, processAppId: string) => void) | null = null;
  private groupPopup: HTMLDivElement | null = null;
  private activeGroupAppDefId: string | null = null;
  private outsideClickHandler: ((e: MouseEvent) => void) | null = null;
  private startOutsideClickHandler: ((e: MouseEvent) => void) | null = null;
  private clockLabel: HTMLDivElement | null = null;
  private overlays = new Map<string, DesktopOverlayRegistration>();
  private clockTimer: number | null = null;
  private currentTheme: ThemeSettings = {};
  private activeStartTab: 'folders' | 'search' = 'folders';
  private folders: { name: string; appIds: string[] }[] = [];
  private openFolderName: string | null = null;
  private editingFolderName: string | null = null;
  private contextMenu: HTMLDivElement | null = null;
  private contextMenuCloseHandler: ((e: MouseEvent) => void) | null = null;
  private pinnedAppIds: string[] = [];

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

    // ── Tab bar ──
    const tabBar = document.createElement('div');
    tabBar.className = 'desktop-start-tabs';

    const folderTab = document.createElement('button');
    folderTab.type = 'button';
    folderTab.className = 'desktop-start-tab is-active';
    folderTab.textContent = '資料夾';

    const searchTab = document.createElement('button');
    searchTab.type = 'button';
    searchTab.className = 'desktop-start-tab';
    searchTab.textContent = '搜尋';

    tabBar.appendChild(folderTab);
    tabBar.appendChild(searchTab);

    // ── Folder pane ──
    const folderPane = document.createElement('div');
    folderPane.className = 'desktop-start-pane desktop-start-pane-folders';

    const folderToolbar = document.createElement('div');
    folderToolbar.className = 'desktop-start-folder-toolbar';

    const addFolderBtn = document.createElement('button');
    addFolderBtn.type = 'button';
    addFolderBtn.className = 'desktop-start-folder-add';
    addFolderBtn.textContent = '+ 新增資料夾';
    addFolderBtn.addEventListener('click', () => {
      this.addFolder('新資料夾');
    });
    folderToolbar.appendChild(addFolderBtn);

    const startFolderList = document.createElement('div');
    startFolderList.className = 'desktop-start-folder-list';

    folderPane.appendChild(folderToolbar);
    folderPane.appendChild(startFolderList);

    // Drop on folder list (inner page mode)
    startFolderList.addEventListener('dragover', (e) => {
      if (this.openFolderName) e.preventDefault();
    });
    startFolderList.addEventListener('drop', (e) => {
      if (!this.openFolderName) return;
      e.preventDefault();
      const appId = e.dataTransfer?.getData('text/plain');
      if (!appId) return;
      const source = e.dataTransfer?.getData('application/x-sentryos-source');
      if (source === 'pinned') {
        this.pinnedAppIds = this.pinnedAppIds.filter(id => id !== appId);
      }
      this.addAppToFolder(this.openFolderName, appId);
    });

    // ── Search pane ──
    const searchPane = document.createElement('div');
    searchPane.className = 'desktop-start-pane desktop-start-pane-search is-hidden-pane';

    const startSearchInput = document.createElement('input');
    startSearchInput.className = 'desktop-start-search';
    startSearchInput.type = 'search';
    startSearchInput.placeholder = '搜尋應用程式';

    const startSearchList = document.createElement('div');
    startSearchList.className = 'desktop-start-list';

    searchPane.appendChild(startSearchInput);
    searchPane.appendChild(startSearchList);

    startPanel.appendChild(tabBar);
    startPanel.appendChild(folderPane);
    startPanel.appendChild(searchPane);

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
    this.startFolderList = startFolderList;
    this.clockLabel = clock;

    startButton.addEventListener('click', () => {
      this.toggleStartPanel();
    });

    startSearchInput.addEventListener('input', () => {
      this.renderStartMenu();
    });

    // ── Tab switching ──
    folderTab.addEventListener('click', () => this.setActiveStartTab('folders', folderTab, searchTab, folderPane, searchPane));
    searchTab.addEventListener('click', () => this.setActiveStartTab('search', searchTab, folderTab, searchPane, folderPane));

    this.loadFolders();
    this.renderTaskbar();
    this.renderStartMenu();
    this.renderFoldersTab();
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
    this.removeStartOutsideClick();
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
    this.startFolderList = null;
    this.clockLabel = null;
    this.openedWindows.clear();
    this.overlays.clear();
    this.folders = [];
    this.openFolderName = null;
    this.editingFolderName = null;
    this.pinnedAppIds = [];
    this.closeContextMenu();
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
    if (theme.startMenuWidth !== undefined && this.startPanel) {
      const w = Math.max(280, Math.min(640, theme.startMenuWidth));
      this.startPanel.style.setProperty('--start-menu-width', `${w}px`);
    }
    if (theme.startMenuHeight !== undefined && this.startPanel) {
      const h = Math.max(300, Math.min(800, theme.startMenuHeight));
      this.startPanel.style.setProperty('--start-menu-height', `${h}px`);
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

    const isHidden = this.startPanel.classList.toggle('is-hidden');

    if (!isHidden) {
      // Panel just opened
      this.openFolderName = null;
      this.closeContextMenu();
      if (this.activeStartTab === 'search') {
        this.startSearchInput?.focus();
      }
      this.renderStartMenu();
      this.renderFoldersTab();

      // Attach outside-click handler
      this.startOutsideClickHandler = (e: MouseEvent) => {
        const target = e.target as Node;
        if (
          this.startPanel && !this.startPanel.contains(target) &&
          this.startButtonEl && !this.startButtonEl.contains(target) &&
          (!this.contextMenu || !this.contextMenu.contains(target))
        ) {
          this.startPanel.classList.add('is-hidden');
          this.removeStartOutsideClick();
          this.closeContextMenu();
        }
      };
      document.addEventListener('click', this.startOutsideClickHandler, true);
    } else {
      this.removeStartOutsideClick();
    }
  }

  private removeStartOutsideClick(): void {
    if (this.startOutsideClickHandler) {
      document.removeEventListener('click', this.startOutsideClickHandler, true);
      this.startOutsideClickHandler = null;
    }
  }

  private setActiveStartTab(
    tab: 'folders' | 'search',
    activeBtn: HTMLButtonElement,
    inactiveBtn: HTMLButtonElement,
    showPane: HTMLDivElement,
    hidePane: HTMLDivElement,
  ): void {
    this.activeStartTab = tab;
    activeBtn.classList.add('is-active');
    inactiveBtn.classList.remove('is-active');
    showPane.classList.remove('is-hidden-pane');
    hidePane.classList.add('is-hidden-pane');

    if (tab === 'search') {
      this.startSearchInput?.focus();
    }
  }

  // ── Folder persistence ──

  private static FOLDER_STORAGE_KEY = 'sentryos-start-folders';

  private loadFolders(): void {
    try {
      const raw = localStorage.getItem(DesktopShell.FOLDER_STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          this.folders = data;
          this.pinnedAppIds = [];
        } else if (data && typeof data === 'object') {
          this.folders = Array.isArray(data.folders) ? data.folders : [];
          this.pinnedAppIds = Array.isArray(data.pinned) ? data.pinned : [];
        }
      }
    } catch { /* ignore corrupt data */ }
  }

  private saveFolders(): void {
    localStorage.setItem(DesktopShell.FOLDER_STORAGE_KEY, JSON.stringify({
      pinned: this.pinnedAppIds,
      folders: this.folders,
    }));
  }

  private addFolder(name: string): void {
    let uniqueName = name;
    let count = 1;
    while (this.folders.some(f => f.name === uniqueName)) {
      uniqueName = `${name} (${count++})`;
    }
    this.folders.push({ name: uniqueName, appIds: [] });
    this.openFolderName = uniqueName;
    this.editingFolderName = uniqueName;
    this.saveFolders();
    this.renderFoldersTab();
  }

  private removeFolder(name: string): void {
    this.folders = this.folders.filter(f => f.name !== name);
    if (this.openFolderName === name) {
      this.openFolderName = null;
    }
    this.saveFolders();
    this.renderFoldersTab();
  }

  private renameFolder(oldName: string, newName: string): boolean {
    if (this.folders.some(f => f.name !== oldName && f.name === newName)) return false;
    const folder = this.folders.find(f => f.name === oldName);
    if (folder) {
      folder.name = newName;
      this.saveFolders();
      return true;
    }
    return false;
  }

  private addAppToFolder(folderName: string, appId: string): void {
    const folder = this.folders.find(f => f.name === folderName);
    if (folder && !folder.appIds.includes(appId)) {
      folder.appIds.push(appId);
      this.saveFolders();
      this.renderFoldersTab();
    }
  }

  private removeAppFromFolder(folderName: string, appId: string): void {
    const folder = this.folders.find(f => f.name === folderName);
    if (folder) {
      folder.appIds = folder.appIds.filter(id => id !== appId);
      this.saveFolders();
      this.renderFoldersTab();
    }
  }

  private pinApp(appId: string): void {
    if (!this.pinnedAppIds.includes(appId)) {
      this.pinnedAppIds.push(appId);
      this.saveFolders();
      this.renderFoldersTab();
    }
  }

  private unpinApp(appId: string): void {
    this.pinnedAppIds = this.pinnedAppIds.filter(id => id !== appId);
    this.saveFolders();
    this.renderFoldersTab();
  }

  // ── App item helper ──

  private createAppItem(app: RegisteredApplication): HTMLButtonElement {
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
      this.closeContextMenu();
      this.launchHandler?.(app);
      this.startPanel?.classList.add('is-hidden');
      this.removeStartOutsideClick();
    });

    return button;
  }

  // ── Context menu ──

  private showContextMenu(x: number, y: number, items: { label: string; action: () => void }[]): void {
    this.closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'desktop-context-menu';

    for (const item of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'desktop-context-menu-item';
      btn.textContent = item.label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeContextMenu();
        item.action();
      });
      menu.appendChild(btn);
    }

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    this.root?.appendChild(menu);
    this.contextMenu = menu;

    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      const rootRect = this.root?.getBoundingClientRect();
      if (rootRect) {
        if (rect.right > rootRect.right - 8) {
          menu.style.left = `${x - rect.width}px`;
        }
        if (rect.bottom > rootRect.bottom - 8) {
          menu.style.top = `${y - rect.height}px`;
        }
      }
    });

    this.contextMenuCloseHandler = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        this.closeContextMenu();
      }
    };
    document.addEventListener('click', this.contextMenuCloseHandler, true);
  }

  private closeContextMenu(): void {
    if (this.contextMenu) {
      this.contextMenu.remove();
      this.contextMenu = null;
    }
    if (this.contextMenuCloseHandler) {
      document.removeEventListener('click', this.contextMenuCloseHandler, true);
      this.contextMenuCloseHandler = null;
    }
  }

  private showSearchContextMenu(e: MouseEvent, app: RegisteredApplication): void {
    if (!app.appId) return;
    const appId = app.appId;

    const rootRect = this.root?.getBoundingClientRect();
    const x = e.clientX - (rootRect?.left ?? 0);
    const y = e.clientY - (rootRect?.top ?? 0);

    const items: { label: string; action: () => void }[] = [];

    if (!this.pinnedAppIds.includes(appId)) {
      items.push({
        label: '📌 釘選到選單',
        action: () => this.pinApp(appId),
      });
    } else {
      items.push({
        label: '📌 從選單取消釘選',
        action: () => this.unpinApp(appId),
      });
    }

    for (const folder of this.folders) {
      if (!folder.appIds.includes(appId)) {
        items.push({
          label: `📁 新增到「${folder.name}」`,
          action: () => this.addAppToFolder(folder.name, appId),
        });
      }
    }

    this.showContextMenu(x, y, items);
  }

  private showPinnedContextMenu(e: MouseEvent, appId: string): void {
    const rootRect = this.root?.getBoundingClientRect();
    const x = e.clientX - (rootRect?.left ?? 0);
    const y = e.clientY - (rootRect?.top ?? 0);

    const items: { label: string; action: () => void }[] = [
      { label: '📌 從選單取消釘選', action: () => this.unpinApp(appId) },
    ];

    for (const folder of this.folders) {
      if (!folder.appIds.includes(appId)) {
        items.push({
          label: `📁 移動到「${folder.name}」`,
          action: () => {
            this.pinnedAppIds = this.pinnedAppIds.filter(id => id !== appId);
            this.addAppToFolder(folder.name, appId);
          },
        });
      }
    }

    this.showContextMenu(x, y, items);
  }

  private showFolderContextMenu(e: MouseEvent, folderName: string): void {
    const rootRect = this.root?.getBoundingClientRect();
    const x = e.clientX - (rootRect?.left ?? 0);
    const y = e.clientY - (rootRect?.top ?? 0);

    this.showContextMenu(x, y, [
      {
        label: '✎ 重新命名',
        action: () => {
          this.openFolderName = folderName;
          this.editingFolderName = folderName;
          this.renderFoldersTab();
        },
      },
      {
        label: '🗑 刪除資料夾',
        action: () => this.removeFolder(folderName),
      },
    ]);
  }

  // ── Folders tab rendering ──

  private renderFoldersTab(): void {
    if (!this.startFolderList) return;
    this.startFolderList.replaceChildren();

    if (this.openFolderName) {
      this.renderFolderInnerPage();
      return;
    }

    // ── Root view: pinned apps + folder tiles ──
    for (const appId of this.pinnedAppIds) {
      const app = this.allApps.find(a => a.appId === appId);
      if (!app) continue;

      const item = this.createAppItem(app);
      item.draggable = true;
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer?.setData('text/plain', appId);
        e.dataTransfer?.setData('application/x-sentryos-source', 'pinned');
      });
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showPinnedContextMenu(e, appId);
      });
      this.startFolderList.appendChild(item);
    }

    if (this.folders.length === 0 && this.pinnedAppIds.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'desktop-start-folder-empty';
      hint.textContent = '在搜尋中右鍵點擊應用程式以新增到選單';
      this.startFolderList.appendChild(hint);
      return;
    }

    for (const folder of this.folders) {
      const folderEl = document.createElement('div');
      folderEl.className = 'desktop-start-folder';

      // Drop target
      folderEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        folderEl.classList.add('is-drag-over');
      });
      folderEl.addEventListener('dragleave', () => {
        folderEl.classList.remove('is-drag-over');
      });
      folderEl.addEventListener('drop', (e) => {
        e.preventDefault();
        folderEl.classList.remove('is-drag-over');
        const appId = e.dataTransfer?.getData('text/plain');
        const source = e.dataTransfer?.getData('application/x-sentryos-source');
        if (appId) {
          if (source === 'pinned') {
            this.pinnedAppIds = this.pinnedAppIds.filter(id => id !== appId);
          }
          this.addAppToFolder(folder.name, appId);
        }
      });

      const folderIcon = document.createElement('span');
      folderIcon.className = 'desktop-start-folder-icon';
      folderIcon.textContent = '📁';

      const folderInfo = document.createElement('div');
      folderInfo.className = 'desktop-start-folder-info';

      const nameEl = document.createElement('span');
      nameEl.className = 'desktop-start-folder-name';
      nameEl.textContent = folder.name;

      const countEl = document.createElement('span');
      countEl.className = 'desktop-start-folder-count';
      countEl.textContent = `${folder.appIds.length} 個應用`;

      folderInfo.appendChild(nameEl);
      folderInfo.appendChild(countEl);
      folderEl.appendChild(folderIcon);
      folderEl.appendChild(folderInfo);

      const chevron = document.createElement('span');
      chevron.className = 'desktop-start-folder-chevron';
      chevron.textContent = '›';
      folderEl.appendChild(chevron);

      folderEl.addEventListener('click', () => {
        this.openFolderName = folder.name;
        this.renderFoldersTab();
      });

      folderEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showFolderContextMenu(e, folder.name);
      });

      this.startFolderList.appendChild(folderEl);
    }
  }

  private renderFolderInnerPage(): void {
    if (!this.startFolderList || !this.openFolderName) return;

    const folder = this.folders.find(f => f.name === this.openFolderName);
    if (!folder) {
      this.openFolderName = null;
      this.renderFoldersTab();
      return;
    }

    // Back button
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'desktop-start-folder-back-btn';
    backBtn.textContent = '← 返回';
    backBtn.addEventListener('click', () => {
      this.openFolderName = null;
      this.editingFolderName = null;
      this.renderFoldersTab();
    });
    this.startFolderList.appendChild(backBtn);

    // Title row (editable)
    const titleRow = document.createElement('div');
    titleRow.className = 'desktop-start-folder-title-row';

    if (this.editingFolderName === folder.name) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'desktop-start-folder-rename';
      input.value = folder.name;

      let committed = false;
      const commitRename = () => {
        if (committed) return;
        committed = true;
        const val = input.value.trim();
        if (val && val !== folder.name) {
          const oldName = folder.name;
          if (this.renameFolder(oldName, val)) {
            if (this.openFolderName === oldName) this.openFolderName = val;
          }
        }
        this.editingFolderName = null;
        this.renderFoldersTab();
      };

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          commitRename();
        } else if (e.key === 'Escape') {
          committed = true;
          this.editingFolderName = null;
          this.renderFoldersTab();
        }
      });
      input.addEventListener('blur', () => {
        requestAnimationFrame(() => commitRename());
      });

      titleRow.appendChild(input);
      requestAnimationFrame(() => { input.focus(); input.select(); });
    } else {
      const titleEl = document.createElement('h3');
      titleEl.className = 'desktop-start-folder-title';
      titleEl.textContent = folder.name;
      titleRow.appendChild(titleEl);

      const renameBtn = document.createElement('button');
      renameBtn.type = 'button';
      renameBtn.className = 'desktop-start-folder-rename-btn';
      renameBtn.textContent = '✎';
      renameBtn.title = '重新命名';
      renameBtn.addEventListener('click', () => {
        this.editingFolderName = folder.name;
        this.renderFoldersTab();
      });
      titleRow.appendChild(renameBtn);
    }

    this.startFolderList.appendChild(titleRow);

    // Apps in folder
    if (folder.appIds.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'desktop-start-folder-empty';
      hint.textContent = '從搜尋拖曳應用程式到此資料夾';
      this.startFolderList.appendChild(hint);
    } else {
      for (const appId of folder.appIds) {
        const app = this.allApps.find(a => a.appId === appId);
        if (!app) continue;

        const row = document.createElement('div');
        row.className = 'desktop-start-folder-app';

        const appBtn = this.createAppItem(app);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'desktop-start-folder-remove-app';
        removeBtn.textContent = '✕';
        removeBtn.title = '從資料夾移除';
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeAppFromFolder(folder.name, appId);
        });

        row.appendChild(appBtn);
        row.appendChild(removeBtn);
        this.startFolderList.appendChild(row);
      }
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
      const button = this.createAppItem(app);

      // Right-click context menu
      button.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showSearchContextMenu(e, app);
      });

      // Draggable
      if (app.appId) {
        button.draggable = true;
        button.addEventListener('dragstart', (e) => {
          e.dataTransfer?.setData('text/plain', app.appId!);
          e.dataTransfer?.setData('application/x-sentryos-source', 'search');
        });
      }

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
