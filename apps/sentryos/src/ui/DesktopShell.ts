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

type ThemeSettings = {
  wallpaper?: string;
  tint?: string;
  accentPrimary?: string;
  accentSecondary?: string;
  accentMode?: 'dark' | 'light';
  taskbarOpacity?: number;
  taskbarMode?: TaskbarMode;
  startMenuWidth?: number;
  startMenuHeight?: number;
  startMenuGroupByPackage?: boolean;
  // ── Color tokens ───────────────────────────────────────
  colorSurface?: string;
  colorSurfaceAlt?: string;
  colorSurfaceInput?: string;
  colorSurfaceHover?: string;
  colorBorder?: string;
  colorBorderFocus?: string;
  colorText?: string;
  colorTextSecondary?: string;
  colorAccent?: string;
  colorAccentGlow?: string;
  colorShadow?: string;
  colorShadowHeavy?: string;
  colorTaskbar?: string;
  colorTaskbarBorder?: string;
};

type TaskbarMode = 'docked' | 'fullwidth' | 'floating-compact';

type ShellMode = 'desktop' | 'mobile';

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
  private folderTabEl: HTMLButtonElement | null = null;
  private searchTabEl: HTMLButtonElement | null = null;
  private addFolderBtnEl: HTMLButtonElement | null = null;
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
  private expandedPackage: string | null = null;
  private taskbarMode: TaskbarMode = 'docked';
  private taskbarTrigger: HTMLDivElement | null = null;
  private taskbarHideTimer: number | null = null;
  private taskbarModeChangeHandler: ((mode: TaskbarMode) => void) | null = null;
  private locale: string = 'zh-TW';
  private translator: ((key: string) => string) | null = null;
  private compactExpanded = false;
  private compactDragging = false;
  private compactDragOffset = { x: 0, y: 0 };

  // ── Mobile mode ───────────────────────────────────────────────
  private shellMode: ShellMode = 'desktop';
  private mobileNavBar: HTMLDivElement | null = null;
  private mobileAppDrawer: HTMLDivElement | null = null;
  private mobileRecentPanel: HTMLDivElement | null = null;
  private mobileAppDrawerOpen = false;
  private mobileRecentOpen = false;
  private orientationMql: MediaQueryList | null = null;
  private orientationChangeHandler: (() => void) | null = null;
  private shellModeChangeHandler: ((mode: ShellMode) => void) | null = null;
  private mobileBackHandler: ((windowId: string, processAppId: string) => void) | null = null;

  /** 翻譯輔助：透過外部注入的翻譯函式取得翻譯文字 */
  private t(key: string): string {
    return this.translator ? this.translator(key) : key;
  }

  /** Return a stable identifier for an app that survives page refreshes */
  private stableId(app: RegisteredApplication): string {
    return app.manifestId ?? app.mainPath;
  }

  /** Find an app by its stable identifier */
  private findAppByStableId(stableId: string): RegisteredApplication | undefined {
    return this.allApps.find(a => (a.manifestId ?? a.mainPath) === stableId);
  }

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

    // Compact mode floating handle
    const taskbarTrigger = document.createElement('div');
    taskbarTrigger.className = 'desktop-taskbar-trigger';

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
    folderTab.textContent = this.t('tab.folders');

    const searchTab = document.createElement('button');
    searchTab.type = 'button';
    searchTab.className = 'desktop-start-tab';
    searchTab.textContent = this.t('tab.search');

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
    addFolderBtn.textContent = this.t('btn.addFolder');
    addFolderBtn.addEventListener('click', () => {
      this.addFolder(this.t('folder.default'));
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
    startSearchInput.placeholder = this.t('search.placeholder');

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
    root.appendChild(taskbarTrigger);
    appRoot.appendChild(root);

    this.root = root;
    this.overlayLayer = overlayLayer;
    this.windowLayer = windowLayer;
    this.wallpaperLayer = wallpaperLayer;
    this.wallpaperTint = wallpaperTint;
    this.taskbarEl = taskbar;
    this.taskbarTrigger = taskbarTrigger;
    this.startButtonEl = startButton;
    this.taskbarAppList = appList;
    this.startPanel = startPanel;
    this.startSearchInput = startSearchInput;
    this.startSearchList = startSearchList;
    this.startFolderList = startFolderList;
    this.folderTabEl = folderTab;
    this.searchTabEl = searchTab;
    this.addFolderBtnEl = addFolderBtn;
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

    // ── Compact mode: draggable handle + click to expand/collapse ──
    taskbarTrigger.addEventListener('click', () => {
      if (this.compactDragging) return;
      this.toggleCompactExpand();
    });
    taskbarTrigger.addEventListener('mousedown', (e) => this.onCompactDragStart(e));

    this.loadFolders();
    this.renderTaskbar();
    this.renderStartMenu();
    this.renderFoldersTab();
    this.updateClock();
    this.startClock();

    // ── Device mode detection: apply mobile layout if portrait phone ──
    const initialMode = DesktopShell.detectShellMode();
    if (initialMode === 'mobile') {
      // Set shellMode directly (without animation guard) before adding the class,
      // so applyShellMode's guard doesn't skip the first call.
      this.shellMode = 'desktop'; // will be changed by applyShellMode
      this.applyShellMode('mobile');
    }

    // Listen for orientation changes so the shell switches modes dynamically
    this.orientationMql = window.matchMedia('(orientation: portrait)');
    this.orientationChangeHandler = () => {
      const newMode = DesktopShell.detectShellMode();
      if (newMode !== this.shellMode) {
        this.applyShellMode(newMode);
      }
    };
    this.orientationMql.addEventListener('change', this.orientationChangeHandler);

    return true;
  }

  getWindowHost(): HTMLDivElement | null {
    return this.windowLayer;
  }

  setApplications(applications: RegisteredApplication[]): void {
    this.allApps = applications;
    this.renderStartMenu();
    this.renderFoldersTab();
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

    // Refresh mobile recent panel if open
    if (this.mobileRecentOpen) {
      this.closeMobileRecentPanel();
      this.openMobileRecentPanel();
    }
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
    if (this.taskbarHideTimer !== null) {
      window.clearTimeout(this.taskbarHideTimer);
      this.taskbarHideTimer = null;
    }
    this.root?.remove();
    this.root = null;
    this.overlayLayer = null;
    this.windowLayer = null;
    this.wallpaperLayer = null;
    this.wallpaperTint = null;
    this.taskbarEl = null;
    this.taskbarTrigger = null;
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

    // ── Mobile mode cleanup ──
    if (this.orientationMql && this.orientationChangeHandler) {
      this.orientationMql.removeEventListener('change', this.orientationChangeHandler);
      this.orientationMql = null;
      this.orientationChangeHandler = null;
    }
    this.mobileNavBar = null;
    this.mobileAppDrawer = null;
    this.mobileRecentPanel = null;
    this.mobileAppDrawerOpen = false;
    this.mobileRecentOpen = false;
  }

  applyTheme(theme: ThemeSettings): void {
    if (theme.wallpaper !== undefined && this.wallpaperLayer) {
      const wp = theme.wallpaper;
      if (/^https?:\/\/|^data:image\//.test(wp)) {
        // Image URL — set individual properties so background-size works
        this.wallpaperLayer.style.background = 'none';
        this.wallpaperLayer.style.backgroundImage = `url("${wp.replace(/["\\]/g, '\\$&')}")`;
        this.wallpaperLayer.style.backgroundSize = 'cover';
        this.wallpaperLayer.style.backgroundPosition = 'center';
        this.wallpaperLayer.style.backgroundRepeat = 'no-repeat';
      } else {
        // CSS gradient or solid color — shorthand resets all individual props
        this.wallpaperLayer.style.background = wp;
      }
    }
    if (theme.tint !== undefined && this.wallpaperTint) {
      this.wallpaperTint.style.background = theme.tint;
    }
    if (theme.accentPrimary !== undefined && theme.accentSecondary !== undefined && this.startButtonEl) {
      this.startButtonEl.style.background = `linear-gradient(135deg, ${theme.accentPrimary}, ${theme.accentSecondary})`;
      // Derive system-wide color tokens from accent, giving all surfaces a cohesive tint
      const hex = theme.accentPrimary.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        const root = document.documentElement;
        const light = theme.accentMode === 'light';
        if (light) {
          // Light mode: bright surfaces tinted with accent
          const sr = Math.round(245 + (r - 245) * 0.06);
          const sg = Math.round(245 + (g - 245) * 0.06);
          const sb = Math.round(245 + (b - 245) * 0.06);
          root.style.setProperty('--sos-color-surface',        `rgba(${sr}, ${sg}, ${sb}, 0.86)`);
          // Titlebar: blend accent into a lighter base for visible contrast
          const tr = Math.round(230 + (r - 230) * 0.50);
          const tg = Math.round(230 + (g - 230) * 0.50);
          const tb = Math.round(230 + (b - 230) * 0.50);
          root.style.setProperty('--sos-color-surface-alt',    `rgb(${tr}, ${tg}, ${tb})`);
          root.style.setProperty('--sos-color-surface-input',  `rgba(${r}, ${g}, ${b}, 0.08)`);
          root.style.setProperty('--sos-color-surface-hover',  `rgba(${r}, ${g}, ${b}, 0.12)`);
          root.style.setProperty('--sos-color-border',         `rgba(${r}, ${g}, ${b}, 0.20)`);
          root.style.setProperty('--sos-color-border-focus',   `rgba(${r}, ${g}, ${b}, 0.50)`);
          root.style.setProperty('--sos-color-text',           '#1a1a2e');
          root.style.setProperty('--sos-color-text-secondary', 'rgba(0, 0, 0, 0.45)');
          root.style.setProperty('--sos-color-accent',         theme.accentSecondary);
          root.style.setProperty('--sos-color-accent-glow',    `rgba(${r}, ${g}, ${b}, 0.25)`);
          root.style.setProperty('--sos-color-shadow',         `rgba(${r}, ${g}, ${b}, 0.12)`);
          root.style.setProperty('--sos-color-shadow-heavy',   `rgba(${r}, ${g}, ${b}, 0.22)`);
          root.style.setProperty('--sos-color-taskbar',        `rgba(${sr}, ${sg}, ${sb}, 0.82)`);
          root.style.setProperty('--sos-color-taskbar-border', `rgba(${r}, ${g}, ${b}, 0.15)`);
        } else {
          // Dark mode: dark surfaces tinted with accent
          const dr = Math.round(r * 0.08);
          const dg = Math.round(g * 0.08);
          const db = Math.round(b * 0.08);
          root.style.setProperty('--sos-color-surface',        `rgba(${dr}, ${dg}, ${db}, 0.92)`);
          root.style.setProperty('--sos-color-surface-alt',    `rgba(${r}, ${g}, ${b}, 0.07)`);
          root.style.setProperty('--sos-color-surface-input',  `rgba(${r}, ${g}, ${b}, 0.06)`);
          root.style.setProperty('--sos-color-surface-hover',  `rgba(${r}, ${g}, ${b}, 0.10)`);
          root.style.setProperty('--sos-color-border',         `rgba(${r}, ${g}, ${b}, 0.18)`);
          root.style.setProperty('--sos-color-border-focus',   `rgba(${r}, ${g}, ${b}, 0.42)`);
          root.style.setProperty('--sos-color-text',           '#f4f7fb');
          root.style.setProperty('--sos-color-text-secondary', 'rgba(255, 255, 255, 0.3)');
          root.style.setProperty('--sos-color-accent',         theme.accentPrimary);
          root.style.setProperty('--sos-color-accent-glow',    `rgba(${r}, ${g}, ${b}, 0.35)`);
          root.style.setProperty('--sos-color-shadow',         `rgba(${dr}, ${dg}, ${db}, 0.35)`);
          root.style.setProperty('--sos-color-shadow-heavy',   `rgba(${dr}, ${dg}, ${db}, 0.50)`);
          root.style.setProperty('--sos-color-taskbar-border', `rgba(${r}, ${g}, ${b}, 0.18)`);
        }
      }
    }
    if (theme.taskbarOpacity !== undefined) {
      const opacity = Math.max(0, Math.min(1, theme.taskbarOpacity));
      const mode = theme.accentMode ?? this.currentTheme.accentMode;
      if (mode === 'light') {
        document.documentElement.style.setProperty('--sos-color-taskbar', `rgba(240, 240, 245, ${opacity})`);
      } else {
        document.documentElement.style.setProperty('--sos-color-taskbar', `rgba(7, 12, 20, ${opacity})`);
      }
    }
    if (theme.startMenuWidth !== undefined && this.startPanel) {
      const w = Math.max(280, Math.min(640, theme.startMenuWidth));
      this.startPanel.style.setProperty('--start-menu-width', `${w}px`);
    }
    if (theme.startMenuHeight !== undefined && this.startPanel) {
      const h = Math.max(300, Math.min(800, theme.startMenuHeight));
      this.startPanel.style.setProperty('--start-menu-height', `${h}px`);
    }
    if (theme.taskbarMode !== undefined) {
      this.setTaskbarMode(theme.taskbarMode);
    }
    if (theme.startMenuGroupByPackage !== undefined) {
      this.expandedPackage = null;
    }

    // ── Apply color tokens as CSS variables ──────────────
    const colorMap: [keyof ThemeSettings, string][] = [
      ['colorSurface',       '--sos-color-surface'],
      ['colorSurfaceAlt',    '--sos-color-surface-alt'],
      ['colorSurfaceInput',  '--sos-color-surface-input'],
      ['colorSurfaceHover',  '--sos-color-surface-hover'],
      ['colorBorder',        '--sos-color-border'],
      ['colorBorderFocus',   '--sos-color-border-focus'],
      ['colorText',          '--sos-color-text'],
      ['colorTextSecondary', '--sos-color-text-secondary'],
      ['colorAccent',        '--sos-color-accent'],
      ['colorAccentGlow',    '--sos-color-accent-glow'],
      ['colorShadow',        '--sos-color-shadow'],
      ['colorShadowHeavy',   '--sos-color-shadow-heavy'],
      ['colorTaskbar',       '--sos-color-taskbar'],
      ['colorTaskbarBorder', '--sos-color-taskbar-border'],
    ];
    const root = document.documentElement;
    for (const [key, cssVar] of colorMap) {
      const val = theme[key];
      if (typeof val === 'string') {
        root.style.setProperty(cssVar, val);
      }
    }

    Object.assign(this.currentTheme, theme);
    if (theme.startMenuGroupByPackage !== undefined) {
      this.renderStartMenu();
    }
  }

  getTheme(): ThemeSettings {
    return { ...this.currentTheme };
  }

  // ── Floating taskbar ──────────────────────────────────────

  setTaskbarMode(mode: TaskbarMode): void {
    if (mode === this.taskbarMode) return;
    this.taskbarMode = mode;

    if (!this.taskbarEl || !this.taskbarTrigger) return;

    // Reset classes
    this.taskbarEl.classList.remove('is-fullwidth', 'is-floating', 'is-compact', 'is-compact-expanded');
    this.taskbarTrigger.style.display = 'none';
    this.taskbarTrigger.style.removeProperty('left');
    this.taskbarTrigger.style.removeProperty('top');
    this.taskbarTrigger.style.removeProperty('right');
    this.taskbarTrigger.style.removeProperty('bottom');
    this.compactExpanded = false;

    if (this.taskbarHideTimer !== null) {
      window.clearTimeout(this.taskbarHideTimer);
      this.taskbarHideTimer = null;
    }

    if (mode === 'fullwidth') {
      this.taskbarEl.classList.add('is-fullwidth');
    } else if (mode === 'floating-compact') {
      this.taskbarEl.classList.add('is-floating', 'is-compact');
      this.taskbarTrigger.style.display = 'flex';
    }
    // 'docked' — default, no extra classes

    this.taskbarModeChangeHandler?.(mode);
  }

  getTaskbarMode(): TaskbarMode {
    return this.taskbarMode;
  }

  onTaskbarModeChange(handler: (mode: TaskbarMode) => void): void {
    this.taskbarModeChangeHandler = handler;
  }

  setLocale(locale: string, translator?: (key: string) => string): void {
    this.locale = locale;
    if (translator) this.translator = translator;
    this.updateLocaleStrings();
    this.updateClock();
    this.renderStartMenu();
    this.renderFoldersTab();
  }

  private updateLocaleStrings(): void {
    if (this.folderTabEl) this.folderTabEl.textContent = this.t('tab.folders');
    if (this.searchTabEl) this.searchTabEl.textContent = this.t('tab.search');
    if (this.addFolderBtnEl) this.addFolderBtnEl.textContent = this.t('btn.addFolder');
    if (this.startSearchInput) this.startSearchInput.placeholder = this.t('search.placeholder');
  }

  private toggleCompactExpand(): void {
    if (this.taskbarMode !== 'floating-compact' || !this.taskbarEl) return;
    this.compactExpanded = !this.compactExpanded;
    this.taskbarEl.classList.toggle('is-compact-expanded', this.compactExpanded);
  }

  private onCompactDragStart(e: MouseEvent): void {
    if (this.taskbarMode !== 'floating-compact' || !this.taskbarTrigger) return;
    const rect = this.taskbarTrigger.getBoundingClientRect();
    this.compactDragging = false;
    const startX = e.clientX;
    const startY = e.clientY;
    this.compactDragOffset.x = e.clientX - rect.left;
    this.compactDragOffset.y = e.clientY - rect.top;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!this.compactDragging && Math.abs(dx) + Math.abs(dy) < 5) return;
      this.compactDragging = true;
      const trigger = this.taskbarTrigger!;
      // Clear auto-positioning so inline left/top take effect
      trigger.style.right = 'auto';
      trigger.style.bottom = 'auto';
      trigger.style.left = `${Math.max(0, Math.min(window.innerWidth - 52, ev.clientX - this.compactDragOffset.x))}px`;
      trigger.style.top = `${Math.max(0, Math.min(window.innerHeight - 52, ev.clientY - this.compactDragOffset.y))}px`;
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      // Reset dragging flag after a tick so click handler can check it
      setTimeout(() => { this.compactDragging = false; }, 0);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
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
    const sid = this.stableId(app);

    const rootRect = this.root?.getBoundingClientRect();
    const x = e.clientX - (rootRect?.left ?? 0);
    const y = e.clientY - (rootRect?.top ?? 0);

    const items: { label: string; action: () => void }[] = [];

    if (!this.pinnedAppIds.includes(sid)) {
      items.push({
        label: this.t('ctx.pin'),
        action: () => this.pinApp(sid),
      });
    } else {
      items.push({
        label: this.t('ctx.unpin'),
        action: () => this.unpinApp(sid),
      });
    }

    for (const folder of this.folders) {
      if (!folder.appIds.includes(sid)) {
        items.push({
          label: this.t('ctx.addToFolder').replace('{name}', folder.name),
          action: () => this.addAppToFolder(folder.name, sid),
        });
      }
    }

    this.showContextMenu(x, y, items);
  }

  private showPinnedContextMenu(e: MouseEvent, sid: string): void {
    const rootRect = this.root?.getBoundingClientRect();
    const x = e.clientX - (rootRect?.left ?? 0);
    const y = e.clientY - (rootRect?.top ?? 0);

    const items: { label: string; action: () => void }[] = [
      { label: this.t('ctx.unpin'), action: () => this.unpinApp(sid) },
    ];

    for (const folder of this.folders) {
      if (!folder.appIds.includes(sid)) {
        items.push({
          label: this.t('ctx.moveToFolder').replace('{name}', folder.name),
          action: () => {
            this.pinnedAppIds = this.pinnedAppIds.filter(id => id !== sid);
            this.addAppToFolder(folder.name, sid);
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
        label: this.t('ctx.rename'),
        action: () => {
          this.openFolderName = folderName;
          this.editingFolderName = folderName;
          this.renderFoldersTab();
        },
      },
      {
        label: this.t('ctx.deleteFolder'),
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
    for (const sid of this.pinnedAppIds) {
      const app = this.findAppByStableId(sid);
      if (!app) continue;

      const item = this.createAppItem(app);
      item.draggable = true;
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer?.setData('text/plain', sid);
        e.dataTransfer?.setData('application/x-sentryos-source', 'pinned');
      });
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showPinnedContextMenu(e, sid);
      });
      this.startFolderList.appendChild(item);
    }

    if (this.folders.length === 0 && this.pinnedAppIds.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'desktop-start-folder-empty';
      hint.textContent = this.t('hint.addFromSearch');
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
      countEl.textContent = this.t('folder.appCount').replace('{count}', String(folder.appIds.length));

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
    backBtn.textContent = this.t('btn.back');
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
      renameBtn.title = this.t('tooltip.rename');
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
      hint.textContent = this.t('hint.dragApp');
      this.startFolderList.appendChild(hint);
    } else {
      for (const sid of folder.appIds) {
        const app = this.findAppByStableId(sid);
        if (!app) continue;

        const row = document.createElement('div');
        row.className = 'desktop-start-folder-app';

        const appBtn = this.createAppItem(app);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'desktop-start-folder-remove-app';
        removeBtn.textContent = '✕';
        removeBtn.title = this.t('tooltip.removeFromFolder');
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeAppFromFolder(folder.name, sid);
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

      const text = `${app.name} ${app.description ?? ''} ${app.packageName ?? ''}`.toLowerCase();
      return text.includes(keyword);
    });

    this.startSearchList.replaceChildren();

    const groupByPackage = this.currentTheme.startMenuGroupByPackage === true;

    if (groupByPackage && !keyword) {
      // ── Package grouped mode ──
      const packageMap = new Map<string, RegisteredApplication[]>();
      for (const app of matches) {
        const pkg = app.packageName || app.name;
        if (!packageMap.has(pkg)) {
          packageMap.set(pkg, []);
        }
        packageMap.get(pkg)!.push(app);
      }

      for (const [pkgName, apps] of packageMap) {
        if (apps.length === 1) {
          // Single app in package — render directly
          const button = this.createAppItem(apps[0]);
          button.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showSearchContextMenu(e, apps[0]);
          });
          button.draggable = true;
          button.addEventListener('dragstart', (e) => {
            e.dataTransfer?.setData('text/plain', this.stableId(apps[0]));
            e.dataTransfer?.setData('application/x-sentryos-source', 'search');
          });
          this.startSearchList.appendChild(button);
        } else {
          // Multiple apps — render as collapsible group
          const isExpanded = this.expandedPackage === pkgName;
          const group = document.createElement('div');
          group.className = 'desktop-start-package-group';
          if (isExpanded) group.classList.add('is-expanded');

          const header = document.createElement('button');
          header.type = 'button';
          header.className = 'desktop-start-package-header';

          const iconEl = document.createElement('span');
          iconEl.className = 'desktop-start-item-icon';
          // Use first app's icon or package initial
          const firstApp = apps[0];
          if (firstApp.icon) {
            const img = document.createElement('img');
            img.src = firstApp.icon;
            img.alt = '';
            img.draggable = false;
            img.addEventListener('error', () => {
              img.remove();
              iconEl.textContent = pkgName.charAt(0).toUpperCase();
            });
            iconEl.appendChild(img);
          } else {
            iconEl.textContent = pkgName.charAt(0).toUpperCase();
          }

          const label = document.createElement('span');
          label.className = 'desktop-start-item-label';
          label.textContent = pkgName;

          const badge = document.createElement('span');
          badge.className = 'desktop-start-package-badge';
          badge.textContent = String(apps.length);

          const chevron = document.createElement('span');
          chevron.className = 'desktop-start-package-chevron';
          chevron.textContent = isExpanded ? '▼' : '▶';

          header.appendChild(iconEl);
          header.appendChild(label);
          header.appendChild(badge);
          header.appendChild(chevron);

          header.addEventListener('click', () => {
            this.expandedPackage = this.expandedPackage === pkgName ? null : pkgName;
            this.renderStartMenu();
          });

          group.appendChild(header);

          if (isExpanded) {
            const body = document.createElement('div');
            body.className = 'desktop-start-package-body';

            for (const app of apps) {
              const button = this.createAppItem(app);
              button.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showSearchContextMenu(e, app);
              });
              button.draggable = true;
              button.addEventListener('dragstart', (e) => {
                e.dataTransfer?.setData('text/plain', this.stableId(app));
                e.dataTransfer?.setData('application/x-sentryos-source', 'search');
              });
              body.appendChild(button);
            }
            group.appendChild(body);
          }

          this.startSearchList.appendChild(group);
        }
      }
    } else {
      // ── Flat mode (default / search active) ──
      for (const app of matches) {
        const button = this.createAppItem(app);

        button.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.showSearchContextMenu(e, app);
        });

        button.draggable = true;
        button.addEventListener('dragstart', (e) => {
          e.dataTransfer?.setData('text/plain', this.stableId(app));
          e.dataTransfer?.setData('application/x-sentryos-source', 'search');
        });

        this.startSearchList.appendChild(button);
      }
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
    this.clockLabel.textContent = now.toLocaleTimeString(this.locale, {
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

  // ── Shell mode detection ──────────────────────────────────────

  /** Maximum width in pixels at which portrait mode is considered a mobile device. */
  private static readonly MOBILE_BREAKPOINT_WIDTH = 768;

  /** Detect whether the current viewport is a portrait mobile device. */
  static detectShellMode(): ShellMode {
    return window.innerWidth <= DesktopShell.MOBILE_BREAKPOINT_WIDTH && window.innerHeight > window.innerWidth ? 'mobile' : 'desktop';
  }

  /** Return the current shell mode ('desktop' | 'mobile'). */
  getShellMode(): ShellMode {
    return this.shellMode;
  }

  /** Register a callback that fires when the shell mode changes due to orientation change. */
  onShellModeChange(handler: (mode: ShellMode) => void): void {
    this.shellModeChangeHandler = handler;
  }

  /** Register a handler that is called when the mobile back button is tapped and there is a
   *  visible (non-minimized) window to dismiss. The handler should minimise the given window. */
  onMobileBack(handler: (windowId: string, processAppId: string) => void): void {
    this.mobileBackHandler = handler;
  }

  /** Return the first non-minimized window currently tracked, or null. */
  private getVisibleWindow(): { windowId: string; processAppId: string } | null {
    for (const info of this.openedWindows.values()) {
      if (info.state !== 'minimized') {
        return { windowId: info.windowId, processAppId: info.processAppId };
      }
    }
    return null;
  }

  // ── Mobile nav bar ────────────────────────────────────────────

  /** Build and append the mobile bottom navigation bar to the root. */
  private mountMobileNavBar(): void {
    if (!this.root) return;

    const nav = document.createElement('div');
    nav.className = 'mobile-nav-bar';

    // Back button
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'mobile-nav-btn';
    backBtn.setAttribute('aria-label', 'Back');
    backBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<polyline points="15 18 9 12 15 6"/>' +
      '</svg>';
    backBtn.addEventListener('click', () => {
      // 1. Dismiss any open overlay first (drawer or recent-apps panel).
      if (this.mobileAppDrawerOpen) {
        this.closeMobileAppDrawer();
        return;
      }
      if (this.mobileRecentOpen) {
        this.closeMobileRecentPanel();
        return;
      }
      // 2. Minimise the currently visible window (equivalent to "exit current app").
      const visible = this.getVisibleWindow();
      if (visible) {
        this.mobileBackHandler?.(visible.windowId, visible.processAppId);
      }
    });

    // Home button
    const homeBtn = document.createElement('button');
    homeBtn.type = 'button';
    homeBtn.className = 'mobile-nav-btn mobile-nav-btn-home';
    homeBtn.setAttribute('aria-label', 'Home');
    homeBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>' +
      '<polyline points="9 22 9 12 15 12 15 22"/>' +
      '</svg>';
    homeBtn.addEventListener('click', () => {
      this.closeMobileRecentPanel();
      this.toggleMobileAppDrawer();
    });

    // Recent apps button
    const recentBtn = document.createElement('button');
    recentBtn.type = 'button';
    recentBtn.className = 'mobile-nav-btn';
    recentBtn.setAttribute('aria-label', 'Recent apps');
    recentBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="3" y="3" width="7" height="7" rx="1"/>' +
      '<rect x="14" y="3" width="7" height="7" rx="1"/>' +
      '<rect x="3" y="14" width="7" height="7" rx="1"/>' +
      '<rect x="14" y="14" width="7" height="7" rx="1"/>' +
      '</svg>';
    recentBtn.addEventListener('click', () => {
      this.closeMobileAppDrawer();
      this.toggleMobileRecentPanel();
    });

    nav.appendChild(backBtn);
    nav.appendChild(homeBtn);
    nav.appendChild(recentBtn);

    this.root.appendChild(nav);
    this.mobileNavBar = nav;
  }

  /** Remove the mobile nav bar from the DOM. */
  private unmountMobileNavBar(): void {
    this.mobileNavBar?.remove();
    this.mobileNavBar = null;
  }

  // ── Mobile app drawer ─────────────────────────────────────────

  private toggleMobileAppDrawer(): void {
    if (this.mobileAppDrawerOpen) {
      this.closeMobileAppDrawer();
    } else {
      this.openMobileAppDrawer();
    }
  }

  private openMobileAppDrawer(): void {
    if (!this.root || this.mobileAppDrawerOpen) return;
    this.mobileAppDrawerOpen = true;

    const drawer = document.createElement('div');
    drawer.className = 'mobile-app-drawer';

    const header = document.createElement('div');
    header.className = 'mobile-app-drawer-header';

    const title = document.createElement('span');
    title.className = 'mobile-app-drawer-title';
    title.textContent = this.t('mobile.allApps');

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'mobile-app-drawer-search';
    searchInput.placeholder = this.t('search.placeholder');

    header.appendChild(title);
    header.appendChild(searchInput);

    const grid = document.createElement('div');
    grid.className = 'mobile-app-drawer-grid';

    const renderGrid = (keyword: string) => {
      grid.replaceChildren();
      const lower = keyword.trim().toLowerCase();
      const apps = lower
        ? this.allApps.filter(a =>
            `${a.name} ${a.description ?? ''} ${a.packageName ?? ''}`.toLowerCase().includes(lower)
          )
        : this.allApps;

      for (const app of apps) {
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'mobile-app-tile';

        const iconEl = document.createElement('span');
        iconEl.className = 'mobile-app-tile-icon';
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
        label.className = 'mobile-app-tile-label';
        label.textContent = app.name;

        tile.appendChild(iconEl);
        tile.appendChild(label);

        tile.addEventListener('click', () => {
          this.closeMobileAppDrawer();
          this.launchHandler?.(app);
        });

        grid.appendChild(tile);
      }
    };

    renderGrid('');
    searchInput.addEventListener('input', () => renderGrid(searchInput.value));

    drawer.appendChild(header);
    drawer.appendChild(grid);

    this.root.appendChild(drawer);
    this.mobileAppDrawer = drawer;

    requestAnimationFrame(() => drawer.classList.add('is-open'));
  }

  private closeMobileAppDrawer(): void {
    if (!this.mobileAppDrawer || !this.mobileAppDrawerOpen) return;
    this.mobileAppDrawerOpen = false;
    const drawer = this.mobileAppDrawer;
    drawer.classList.remove('is-open');
    drawer.addEventListener('transitionend', () => drawer.remove(), { once: true });
    this.mobileAppDrawer = null;
  }

  // ── Mobile recent apps panel ──────────────────────────────────

  private toggleMobileRecentPanel(): void {
    if (this.mobileRecentOpen) {
      this.closeMobileRecentPanel();
    } else {
      this.openMobileRecentPanel();
    }
  }

  private openMobileRecentPanel(): void {
    if (!this.root || this.mobileRecentOpen) return;
    this.mobileRecentOpen = true;

    const panel = document.createElement('div');
    panel.className = 'mobile-recent-panel';

    const title = document.createElement('div');
    title.className = 'mobile-recent-title';
    title.textContent = this.t('mobile.recentApps');
    panel.appendChild(title);

    const list = document.createElement('div');
    list.className = 'mobile-recent-list';

    for (const windowInfo of this.openedWindows.values()) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'mobile-recent-card';

      const iconEl = document.createElement('span');
      iconEl.className = 'mobile-recent-card-icon';
      if (windowInfo.icon) {
        const img = document.createElement('img');
        img.src = windowInfo.icon;
        img.alt = '';
        img.draggable = false;
        img.addEventListener('error', () => {
          img.remove();
          iconEl.textContent = windowInfo.title.charAt(0).toUpperCase();
        });
        iconEl.appendChild(img);
      } else {
        iconEl.textContent = windowInfo.title.charAt(0).toUpperCase();
      }

      const label = document.createElement('span');
      label.className = 'mobile-recent-card-label';
      label.textContent = windowInfo.title;

      card.appendChild(iconEl);
      card.appendChild(label);

      card.addEventListener('click', () => {
        this.closeMobileRecentPanel();
        this.taskbarWindowClickHandler?.(windowInfo.windowId, windowInfo.processAppId);
      });

      list.appendChild(card);
    }

    if (this.openedWindows.size === 0) {
      const empty = document.createElement('div');
      empty.className = 'mobile-recent-empty';
      empty.textContent = this.t('mobile.noRecentApps');
      list.appendChild(empty);
    }

    panel.appendChild(list);
    this.root.appendChild(panel);
    this.mobileRecentPanel = panel;

    requestAnimationFrame(() => panel.classList.add('is-open'));
  }

  private closeMobileRecentPanel(): void {
    if (!this.mobileRecentPanel || !this.mobileRecentOpen) return;
    this.mobileRecentOpen = false;
    const panel = this.mobileRecentPanel;
    panel.classList.remove('is-open');
    panel.addEventListener('transitionend', () => panel.remove(), { once: true });
    this.mobileRecentPanel = null;
  }

  // ── Shell mode switching ──────────────────────────────────────

  /** Switch the shell between desktop and mobile layouts. */
  private applyShellMode(mode: ShellMode): void {
    if (!this.root) return;
    if (mode === this.shellMode) return;

    this.shellMode = mode;

    if (mode === 'mobile') {
      this.root.classList.add('is-mobile');
      // Hide desktop taskbar & start panel
      if (this.taskbarEl) this.taskbarEl.style.display = 'none';
      if (this.taskbarTrigger) this.taskbarTrigger.style.display = 'none';
      if (this.startPanel) this.startPanel.classList.add('is-hidden');
      this.mountMobileNavBar();
    } else {
      this.root.classList.remove('is-mobile');
      // Restore desktop taskbar
      if (this.taskbarEl) this.taskbarEl.style.removeProperty('display');
      if (this.taskbarMode === 'floating-compact' && this.taskbarTrigger) {
        this.taskbarTrigger.style.display = 'flex';
      }
      this.unmountMobileNavBar();
      this.closeMobileAppDrawer();
      this.closeMobileRecentPanel();
    }

    this.shellModeChangeHandler?.(mode);
  }
}

export { DesktopShell, type DesktopOverlayRegistration, type ThemeSettings, type TaskbarMode, type ShellMode };
