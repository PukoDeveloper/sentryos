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
  /** @deprecated No-op in mobile mode; maintained for API backward compatibility only. Do not use. */
  taskbarMode?: string;
  /** @deprecated No-op in mobile mode; maintained for API backward compatibility only. */
  startMenuWidth?: number;
  /** @deprecated No-op in mobile mode; maintained for API backward compatibility only. */
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

/** @deprecated Kept for API backward-compatibility only; mobile has no taskbar modes */
type TaskbarMode = 'docked' | 'fullwidth' | 'floating-compact';

class DesktopShell {
  private root: HTMLDivElement | null = null;
  private overlayLayer: HTMLDivElement | null = null;
  private windowLayer: HTMLDivElement | null = null;
  private wallpaperLayer: HTMLDivElement | null = null;
  private wallpaperTint: HTMLDivElement | null = null;
  // ── Mobile UI ────────────────────────────────────────────────
  private statusBarTitleEl: HTMLSpanElement | null = null;
  private appSwitcherEl: HTMLDivElement | null = null;
  private appSwitcherVisible = false;
  // ── Start panel ──────────────────────────────────────────────
  private startButtonEl: HTMLButtonElement | null = null;
  private startPanel: HTMLDivElement | null = null;
  private startSearchInput: HTMLInputElement | null = null;
  private startSearchList: HTMLDivElement | null = null;
  private startFolderList: HTMLDivElement | null = null;
  private folderTabEl: HTMLButtonElement | null = null;
  private searchTabEl: HTMLButtonElement | null = null;
  private addFolderBtnEl: HTMLButtonElement | null = null;
  // ── App data ────────────────────────────────────────────────
  private allApps: RegisteredApplication[] = [];
  private openedWindows = new Map<string, WindowInfo>();
  private lastWindowFingerprint = '';
  // ── Handlers ─────────────────────────────────────────────────
  private launchHandler: ((app: RegisteredApplication) => void) | null = null;
  private taskbarWindowClickHandler: ((windowId: string, processAppId: string) => void) | null = null;
  private windowCloseRequestHandler: ((windowId: string, processAppId: string) => void) | null = null;
  private showDesktopRequestHandler: (() => void) | null = null;
  private startOutsideClickHandler: ((e: MouseEvent) => void) | null = null;
  private switcherOutsideClickHandler: ((e: MouseEvent) => void) | null = null;
  // ── State ────────────────────────────────────────────────────
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
  private locale: string = 'zh-TW';
  private translator: ((key: string) => string) | null = null;

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

    // ── Mobile Status Bar (top) ──────────────────────────────────
    const statusBar = document.createElement('div');
    statusBar.className = 'mobile-status-bar';

    const statusBarTitle = document.createElement('span');
    statusBarTitle.className = 'mobile-status-bar-title';
    statusBarTitle.textContent = 'SentryOS';

    const statusBarClock = document.createElement('div');
    statusBarClock.className = 'mobile-status-bar-clock';

    statusBar.appendChild(statusBarTitle);
    statusBar.appendChild(statusBarClock);

    // ── Start Panel (mobile bottom sheet) ───────────────────────
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

    // ── Mobile Navigation Bar (bottom) ──────────────────────────
    const navBar = document.createElement('div');
    navBar.className = 'mobile-nav-bar';

    const recentsBtn = document.createElement('button');
    recentsBtn.type = 'button';
    recentsBtn.className = 'mobile-nav-btn';
    recentsBtn.setAttribute('aria-label', this.t('nav.recents'));
    recentsBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>' +
      `<span>${this.t('nav.recents')}</span>`;

    const homeBtn = document.createElement('button');
    homeBtn.type = 'button';
    homeBtn.className = 'mobile-nav-btn mobile-nav-btn--home';
    homeBtn.setAttribute('aria-label', this.t('nav.home'));
    homeBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 9 12 2 21 9"/><path d="M9 22V12h6v10"/><path d="M3 9v13h18V9"/></svg>' +
      `<span>${this.t('nav.home')}</span>`;

    const desktopBtn = document.createElement('button');
    desktopBtn.type = 'button';
    desktopBtn.className = 'mobile-nav-btn';
    desktopBtn.setAttribute('aria-label', this.t('nav.desktop'));
    desktopBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>' +
      `<span>${this.t('nav.desktop')}</span>`;

    navBar.appendChild(recentsBtn);
    navBar.appendChild(homeBtn);
    navBar.appendChild(desktopBtn);

    // ── App Switcher Overlay ─────────────────────────────────────
    const appSwitcher = document.createElement('div');
    appSwitcher.className = 'mobile-app-switcher is-hidden';

    // ── DOM assembly ─────────────────────────────────────────────
    root.appendChild(wallpaperLayer);
    root.appendChild(overlayLayer);
    root.appendChild(windowLayer);
    root.appendChild(statusBar);
    root.appendChild(startPanel);
    root.appendChild(navBar);
    root.appendChild(appSwitcher);
    appRoot.appendChild(root);

    // ── Store refs ───────────────────────────────────────────────
    this.root = root;
    this.overlayLayer = overlayLayer;
    this.windowLayer = windowLayer;
    this.wallpaperLayer = wallpaperLayer;
    this.wallpaperTint = wallpaperTint;
    this.statusBarTitleEl = statusBarTitle;
    this.clockLabel = statusBarClock;
    this.startButtonEl = homeBtn;
    this.startPanel = startPanel;
    this.startSearchInput = startSearchInput;
    this.startSearchList = startSearchList;
    this.startFolderList = startFolderList;
    this.folderTabEl = folderTab;
    this.searchTabEl = searchTab;
    this.addFolderBtnEl = addFolderBtn;
    this.appSwitcherEl = appSwitcher;

    // ── Event wiring ─────────────────────────────────────────────
    recentsBtn.addEventListener('click', () => this.toggleAppSwitcher());
    homeBtn.addEventListener('click', () => this.toggleStartPanel());
    desktopBtn.addEventListener('click', () => {
      this.hideAppSwitcher();
      this.startPanel?.classList.add('is-hidden');
      this.removeStartOutsideClick();
      this.showDesktopRequestHandler?.();
    });

    startSearchInput.addEventListener('input', () => {
      this.renderStartMenu();
    });

    folderTab.addEventListener('click', () => this.setActiveStartTab('folders', folderTab, searchTab, folderPane, searchPane));
    searchTab.addEventListener('click', () => this.setActiveStartTab('search', searchTab, folderTab, searchPane, folderPane));

    this.loadFolders();
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
    this.renderFoldersTab();
  }

  onLaunchRequest(handler: (app: RegisteredApplication) => void): void {
    this.launchHandler = handler;
  }

  onTaskbarWindowClick(handler: (windowId: string, processAppId: string) => void): void {
    this.taskbarWindowClickHandler = handler;
  }

  /** Register callback invoked when the user taps the close (×) button on an app switcher card. */
  onWindowCloseRequest(handler: (windowId: string, processAppId: string) => void): void {
    this.windowCloseRequestHandler = handler;
  }

  syncOpenWindows(windows: WindowInfo[]): void {
    // Build a fingerprint to skip redundant re-renders
    const fingerprint = windows.map(w => w.windowId + ':' + w.state + ':' + w.title).join('|');
    if (fingerprint === this.lastWindowFingerprint) {
      return;
    }
    this.lastWindowFingerprint = fingerprint;

    this.openedWindows.clear();
    for (const windowInfo of windows) {
      this.openedWindows.set(windowInfo.windowId, windowInfo);
    }
    // Refresh app switcher if it is visible
    if (this.appSwitcherVisible) {
      this.renderAppSwitcher();
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

    this.hideAppSwitcher();
    this.removeStartOutsideClick();
    this.root?.remove();
    this.root = null;
    this.overlayLayer = null;
    this.windowLayer = null;
    this.wallpaperLayer = null;
    this.wallpaperTint = null;
    this.statusBarTitleEl = null;
    this.appSwitcherEl = null;
    this.startButtonEl = null;
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
    // taskbarMode and startMenuWidth/Height are no-ops in mobile mode
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

  // ── Locale ───────────────────────────────────────────────────

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

  // ── Mobile: App Switcher ──────────────────────────────────────

  /** Update the status bar title to reflect the currently focused app. */
  setFocusedWindowTitle(title: string | null): void {
    if (this.statusBarTitleEl) {
      this.statusBarTitleEl.textContent = title ?? 'SentryOS';
    }
  }

  /** Register callback invoked when the user taps the "Show Desktop" nav button. */
  onShowDesktopRequest(handler: () => void): void {
    this.showDesktopRequestHandler = handler;
  }

  private toggleAppSwitcher(): void {
    if (this.appSwitcherVisible) {
      this.hideAppSwitcher();
    } else {
      this.showAppSwitcher();
    }
  }

  private showAppSwitcher(): void {
    if (!this.appSwitcherEl) return;
    // Close start panel if open
    this.startPanel?.classList.add('is-hidden');
    this.removeStartOutsideClick();
    this.renderAppSwitcher();
    this.appSwitcherEl.classList.remove('is-hidden');
    this.appSwitcherVisible = true;

    this.switcherOutsideClickHandler = (e: MouseEvent) => {
      const inner = this.appSwitcherEl?.querySelector('.mobile-app-switcher-inner');
      if (inner && !inner.contains(e.target as Node)) {
        this.hideAppSwitcher();
      }
    };
    document.addEventListener('click', this.switcherOutsideClickHandler, true);
  }

  private hideAppSwitcher(): void {
    if (!this.appSwitcherEl) return;
    this.appSwitcherEl.classList.add('is-hidden');
    this.appSwitcherVisible = false;
    if (this.switcherOutsideClickHandler) {
      document.removeEventListener('click', this.switcherOutsideClickHandler, true);
      this.switcherOutsideClickHandler = null;
    }
  }

  private renderAppSwitcher(): void {
    if (!this.appSwitcherEl) return;
    this.appSwitcherEl.replaceChildren();

    const inner = document.createElement('div');
    inner.className = 'mobile-app-switcher-inner';

    const visibleWindows = Array.from(this.openedWindows.values()).filter(w => w.state !== 'minimized');

    if (visibleWindows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'mobile-app-switcher-empty';
      empty.textContent = this.t('switcher.noWindows');
      inner.appendChild(empty);
    } else {
      for (const w of visibleWindows) {
        const card = document.createElement('div');
        card.className = 'mobile-app-card';

        const iconEl = document.createElement('span');
        iconEl.className = 'mobile-app-card-icon';
        if (w.icon) {
          const img = document.createElement('img');
          img.src = w.icon;
          img.alt = '';
          img.draggable = false;
          img.addEventListener('error', () => {
            img.remove();
            iconEl.textContent = w.title.charAt(0).toUpperCase();
          });
          iconEl.appendChild(img);
        } else {
          iconEl.textContent = w.title.charAt(0).toUpperCase();
        }

        const titleEl = document.createElement('span');
        titleEl.className = 'mobile-app-card-title';
        titleEl.textContent = w.title;

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'mobile-app-card-close';
        closeBtn.setAttribute('aria-label', this.t('btn.closeApp'));
        closeBtn.textContent = this.t('btn.closeApp');
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.windowCloseRequestHandler?.(w.windowId, w.processAppId);
          this.hideAppSwitcher();
        });

        card.appendChild(iconEl);
        card.appendChild(titleEl);
        card.appendChild(closeBtn);

        card.addEventListener('click', () => {
          this.taskbarWindowClickHandler?.(w.windowId, w.processAppId);
          this.hideAppSwitcher();
        });

        inner.appendChild(card);
      }
    }

    this.appSwitcherEl.appendChild(inner);
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
}

export { DesktopShell, type DesktopOverlayRegistration, type ThemeSettings, type TaskbarMode };
