import { initializeQuickJS } from '../runtime/QuickJsInit';
import { ScriptRuntime } from '../runtime/ScriptRuntime';
import { RuntimeRegistry } from '../runtime/RuntimeRegistry';
import { PermissionsManager } from '../permissions/PermissionsManager';
import { EventBus } from '../events/EventBus';
import { ApplicationManager, type Application } from '../application/ApplicationManager';
import { ProcessManager } from '../process/ProcessManager';
import { loadApplicationCatalog, loadRemoteApplicationCatalog, normalizeCatalogEntry, type RegisteredApplication, type OsRejectedApp } from '../application/ApplicationCatalog';
import { AppInstaller } from '../application/AppInstaller';
import { WebFileSystemAdapter } from '../storage/FileSystem';
import type { FileSystemAdapter } from '../storage/FileSystem';
import { WindowManager } from '../window/WindowManager';
import { EnvironmentManager } from '../environment/EnvironmentManager';
import { DesktopShell } from '../ui/DesktopShell';
import { NotificationManager } from '../notification/NotificationManager';
import { SystemMonitor } from '../monitor/SystemMonitor';
import { SystemAlert } from '../notification/SystemAlert';
import { KernelConsole } from '../console/KernelConsole';
import { AllowlistNetworkManager } from '../network/AllowlistNetworkManager';
import { SystemRegistry } from '../registry/SystemRegistry';
import { DialogManager } from '../dialog/DialogManager';
import { ApplicationLauncher } from '../application/ApplicationLauncher';
import { ClipboardManager } from '../clipboard/ClipboardManager';
import { AudioManager } from '../audio/AudioManager';
import { Kernel } from '../kernel/Kernel';
import { registerAllHostApis } from '../api';
import { bios } from '../ui/Bios';
import { lockScreen } from '../ui/LockScreen';
import { AuthProvider } from '../auth/AuthProvider';
import { Events, USER_DEFAULT_PERMISSIONS, BUILTIN_KERNEL_CONSOLE } from '../kernel/constants';
import { PluginManager, type PluginModule } from '../plugin/PluginManager';
import type { SentryPlugin } from 'sentryos-sdk';
import { LanguageManager } from '../language/LanguageManager';
import { desktopShellPack, systemAlertPack, bootstrapPack, kernelConsolePack, appInstallerPack, lockScreenPack } from '../language/systemPacks';

// ── Public API types ─────────────────────────────────────────────

/**
 * Options passed to {@link createSentryOS} to configure the OS instance.
 */
export interface SentryOSOptions {
  /** The host element that SentryOS will be mounted into. */
  container: HTMLElement;
  /**
   * Called when the OS needs to restart (e.g. after a boot error).
   * Defaults to `() => location.reload()` in standalone mode.
   */
  onRestart?: () => void;
  /**
   * Pre-imported plugin modules to load at boot time.
   * These are resolved before any path-based plugins configured in `system`.
   */
  pluginInstances?: SentryPlugin[];
  /**
   * Optional factory for creating the kernel's filesystem adapter.
   *
   * Called during kernel initialization with the partially-constructed `Kernel`.
   * The following services are already registered at call time:
   * `permissions`, `eventBus`, `appManager`, `processManager`, `runtime`,
   * and `runtimeRegistry`.
   * The returned adapter is registered as the `'fileSystem'` service.
   *
   * If omitted, the default {@link WebFileSystemAdapter} backed by
   * `localStorage` is used.
   *
   * @example
   * ```ts
   * createSentryOS({
   *   container,
   *   fileSystem: (kernel) => new MyIndexedDbAdapter(kernel),
   * });
   * ```
   */
  fileSystem?: (kernel: Kernel) => FileSystemAdapter;
  /**
   * System bootstrap configuration. By default no application catalog, plugin
   * list, or built-in app registry is injected.
   */
  system?: {
    /** Predefined permissions granted to the login user session. */
    userDefaultPermissions?: string[];
    /** URL of an app catalog JSON file (same format as `/app.json`). */
    appCatalogUrl?: string;
    /** Direct app catalog entries (same values as `app.json` array items). */
    appCatalogEntries?: string[];
    /** URL of a plugin list JSON file (same format as `/plugins.json`). */
    pluginListUrl?: string;
    /** Direct plugin module paths to load via PluginManager. */
    pluginPaths?: string[];
    /** URL of auth config JSON file. */
    authConfigUrl?: string;
    /** Whether to register the built-in kernel console app. */
    enableBuiltinKernelConsole?: boolean;
    /** manifestId -> system role defaults to seed SystemRegistry. */
    defaultRegistryRoles?: Record<string, string>;
    /** file extension -> default handler manifestId/mime to seed SystemRegistry. */
    defaultRegistryFileTypes?: Record<string, { handler: string; mime?: string }>;
  };
  /**
   * @deprecated Use `system` instead.
   * Legacy URL overrides for catalog / auth endpoints.
   */
  config?: {
    authConfigUrl?: string;
    appCatalogUrl?: string;
    pluginListUrl?: string;
  };
}

/**
 * Handle returned by {@link createSentryOS} representing a running OS instance.
 */
export interface SentryOSInstance {
  /** The kernel of this OS instance — use for advanced host-page integration. */
  readonly kernel: Kernel;
  /**
   * Gracefully shuts down the OS: unloads all plugins, terminates all
   * processes, removes DOM nodes and event listeners added by this instance.
   */
  shutdown(): Promise<void>;
}

// ── Bootstrap ───────────────────────────────────────────────────

type BufferedLog = (source: string, level: Parameters<typeof bios.log>[1], message: string) => void;

/**
 * Boot SentryOS inside `options.container` and resolve with a handle that
 * lets the caller shut the instance down later.
 */
export async function createSentryOS(options: SentryOSOptions): Promise<SentryOSInstance> {
  const { container, onRestart = () => location.reload(), pluginInstances = [] } = options;
  const systemConfig = options.system;
  const appCatalogUrl = systemConfig?.appCatalogUrl ?? options.config?.appCatalogUrl;
  const appCatalogEntries = systemConfig?.appCatalogEntries;
  const pluginListUrl = systemConfig?.pluginListUrl ?? options.config?.pluginListUrl;
  const pluginPaths = systemConfig?.pluginPaths;
  const authConfigUrl = systemConfig?.authConfigUrl ?? options.config?.authConfigUrl;
  const enableBuiltinKernelConsole = systemConfig?.enableBuiltinKernelConsole ?? false;
  const userDefaultPermissions = systemConfig?.userDefaultPermissions ?? USER_DEFAULT_PERMISSIONS;
  const registryRoleMap = systemConfig?.defaultRegistryRoles ?? {};
  const registryFileTypeMap = systemConfig?.defaultRegistryFileTypes ?? {};

  // Point the singletons at our container instead of the global `#app` element.
  bios.setContainer(container);
  lockScreen.setContainer(container);

  // ── Per-instance boot log buffer ────────────────────────────
  const bootLog: string[] = [];
  const originalLog = bios.log.bind(bios);
  function bufferedLog(source: string, level: Parameters<typeof bios.log>[1], message: string): void {
    bootLog.push(`[${source}] [${level}] ${message}`);
    originalLog(source, level, message);
  }

  // ── System-level error: show BIOS error screen ──────────────
  function bootT(kernel: Kernel | undefined, key: string, fallback: string): string {
    try {
      if (kernel) {
        const lm = kernel.resolve('languageManager') as LanguageManager;
        return lm.t('bootstrap', key);
      }
    } catch { /* languageManager may not be available yet */ }
    return fallback;
  }

  function showSystemError(title: string, error?: unknown, kernel?: Kernel): void {
    const restartLabel = bootT(kernel, 'boot.btn.restart', '重新啟動系統');

    const details = [...bootLog];
    if (error instanceof Error) {
      details.push('', `[CRITICAL] ${error.message}`);
      if (error.stack) {
        for (const line of error.stack.split('\n').slice(1, 6)) {
          details.push(`  ${line.trim()}`);
        }
      }
    } else if (error !== undefined) {
      details.push('', `[CRITICAL] ${String(error)}`);
    }

    bios.destroyBootTerminal();
    bios.showErrorScreen(title, details, [
      { label: restartLabel, handler: onRestart },
    ]);
  }

  // ── Contextmenu suppression (scoped to container) ───────────
  const handleContextMenu = (e: Event) => e.preventDefault();
  container.addEventListener('contextmenu', handleContextMenu);

  bios.createBootTerminal();
  bios.init();
  bufferedLog('BOOT', 'INFO', 'Preparing core services');

  // 1. Initialize kernel & core services
  let kernel: Kernel;
  try {
    kernel = await initializeCore(bufferedLog, options.fileSystem, userDefaultPermissions);
  } catch (err) {
    showSystemError('核心服務初始化失敗', err);
    container.removeEventListener('contextmenu', handleContextMenu);
    throw err;
  }

  const desktopShell = kernel.resolve('desktopShell');
  const appManager = kernel.resolve('appManager');

  // 1.5. Destroy boot terminal and show lock screen before the desktop mounts
  bios.destroyBootTerminal();
  {
    const envManager = kernel.resolve('environmentManager');
    const networkManager = kernel.resolve('networkManager');
    const authProvider = new AuthProvider(envManager, networkManager);
    await authProvider.loadConfig(authConfigUrl ?? '/auth.config.json');
    const languageManager = kernel.resolve('languageManager');
    const authResult = await lockScreen.show(authProvider, (key) => languageManager.t('lockscreen', key));
    kernel.set('loginUser', authResult.username);
    kernel.set('userKey', authResult.userkey);
  }

  // 2. Load application catalog
  let catalogApps: RegisteredApplication[];
  let allRejectedApps: OsRejectedApp[] = [];
  try {
    if (Array.isArray(appCatalogEntries) || typeof appCatalogUrl === 'string') {
      const catalogResult = await loadApplicationCatalog(appCatalogEntries ?? appCatalogUrl);
      if (!catalogResult.success || !catalogResult.data) {
        showSystemError(bootT(kernel, 'boot.catalogLoadFailed', '應用程式目錄載入失敗'), catalogResult.error ?? 'UnknownError', kernel);
        container.removeEventListener('contextmenu', handleContextMenu);
        return createShutdownOnlyInstance(kernel, container, handleContextMenu);
      }
      catalogApps = catalogResult.data.apps;
      allRejectedApps = catalogResult.data.rejected;
    } else {
      catalogApps = [];
      allRejectedApps = [];
    }
  } catch (err) {
    showSystemError(bootT(kernel, 'boot.catalogLoadFailed', '應用程式目錄載入失敗'), err, kernel);
    container.removeEventListener('contextmenu', handleContextMenu);
    return createShutdownOnlyInstance(kernel, container, handleContextMenu);
  }

  // 2.5. Load remote apps from sys:app.js
  {
    const fileSystem = kernel.resolve('fileSystem');
    const systemAppId = kernel.get('systemAppId');
    const remoteAppsEntry = fileSystem.read(systemAppId, 'sys', 'app.js');
    if (!remoteAppsEntry.success) {
      // First boot: initialize with empty remote app list
      fileSystem.write(systemAppId, 'sys', 'app.js', [] as string[], { ownerLabel: 'system' });
    } else {
      const remoteUrls = remoteAppsEntry.data?.data;
      if (Array.isArray(remoteUrls) && remoteUrls.length > 0) {
        try {
          const remoteResult = await loadRemoteApplicationCatalog(remoteUrls as string[]);
          if (remoteResult.success && remoteResult.data) {
            catalogApps = [...catalogApps, ...remoteResult.data.apps];
            allRejectedApps = [...allRejectedApps, ...remoteResult.data.rejected];
            bufferedLog('BOOT', 'INFO', `Remote apps loaded: ${remoteResult.data.apps.length} app(s)`);
          } else {
            bufferedLog('BOOT', 'WARN', `Remote app catalog load failed: ${remoteResult.error ?? 'UnknownError'}`);
          }
        } catch (err) {
          bufferedLog('BOOT', 'WARN', `Remote app catalog error: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  // 3. Register applications
  const { applications, iconMap } = registerApplications(appManager, catalogApps);

  // Register built-in kernel console as a native application
  if (enableBuiltinKernelConsole) {
    appManager.registerBuiltin(BUILTIN_KERNEL_CONSOLE, {
      name: 'System Terminal',
      version: '1.0.0',
      permissions: [],     // 權限由 userAppId 管理，不需 manifest 層權限
      maxInstances: 8,
    });

    const kernelConsoleEntry: RegisteredApplication = {
      name: 'System Terminal',
      version: '1.0.0',
      permissions: [],
      maxInstances: 8,
      appId: BUILTIN_KERNEL_CONSOLE,
      packageName: 'system',
      entryPath: '',
      mainPath: '',
      icon: '/default-app-icon.svg',
      runtimeType: 'Console',
      autoStart: false,
      hidden: false,
    };
    catalogApps.push(kernelConsoleEntry);
    applications.push({ ...kernelConsoleEntry });
  }

  kernel.set('catalogApps', catalogApps);
  kernel.set('iconMap', iconMap);

  // 3.5  Populate system registry defaults
  populateDefaultRegistry(kernel, catalogApps, {
    includeBuiltinTerminal: enableBuiltinKernelConsole,
    roleMap: registryRoleMap,
    fileTypeMap: registryFileTypeMap,
  });

  // 4. Mount desktop shell
  const mounted = desktopShell.mount(applications, container);
  if (!mounted) {
    showSystemError(bootT(kernel, 'boot.shellMountFailed', '桌面外殼掛載失敗'), 'Desktop shell mount failed — app container is unavailable', kernel);
    container.removeEventListener('contextmenu', handleContextMenu);
    return createShutdownOnlyInstance(kernel, container, handleContextMenu);
  }

  desktopShell.setApplications(catalogApps.filter(a => a.runtimeType !== 'Service' && a.runtimeType !== 'Library' && !a.hidden));

  // Restore persisted theme settings
  {
    const fs = kernel.resolve('fileSystem');
    const sysId = kernel.get('systemAppId');
    const savedTheme = fs.read(sysId, 'sys', 'system-theme');
    if (savedTheme.success && savedTheme.data) {
      desktopShell.applyTheme(savedTheme.data.data as Parameters<typeof desktopShell.applyTheme>[0]);
    }
  }

  // Register notification overlay
  const notifContainer = kernel.resolve('notificationManager').createContainer();
  desktopShell.registerOverlay({ id: 'notification-layer', element: notifContainer, order: 100 });

  // Register system alert overlay
  const systemAlert = kernel.resolve('systemAlert');
  const alertContainer = systemAlert.createContainer();
  desktopShell.registerOverlay({ id: 'system-alert-layer', element: alertContainer, order: 200 });

  // Register app installer overlay
  const appInstallerService = kernel.resolve('appInstaller');
  const installerContainer = appInstallerService.createContainer();
  desktopShell.registerOverlay({ id: 'app-installer-layer', element: installerContainer, order: 250 });

  // Show OS-incompatibility alerts if any apps were skipped during catalog loading
  if (allRejectedApps.length > 0) {
    const formatAppList = (apps: OsRejectedApp[]) =>
      apps.map(a => `• ${a.name} (${a.packageName})`).join('\n');
    const outdated = allRejectedApps.filter(a => a.reason === 'outdated');
    const requiresNewer = allRejectedApps.filter(a => a.reason === 'requiresNewerOs');
    if (outdated.length > 0) {
      systemAlert.show({ code: 'APP_OS_OUTDATED', detail: formatAppList(outdated) });
    }
    if (requiresNewer.length > 0) {
      systemAlert.show({ code: 'APP_OS_REQUIRES_NEWER', detail: formatAppList(requiresNewer) });
    }
  }

  // Boot-time permission consent check for remote apps
  // For each entry in sys/app.js, verify that the user has previously consented to the
  // app's permissions. If new permissions were added since last install, show re-consent.
  // Apps whose consent is declined are removed from the catalog and from sys/app.js.
  await checkRemoteAppConsent(kernel, appInstallerService, catalogApps, bufferedLog);

  // 5. Create window manager
  const windowHost = desktopShell.getWindowHost();
  if (!windowHost) {
    showSystemError(bootT(kernel, 'boot.shellMountFailed', '桌面外殼掛載失敗'), 'Desktop shell has no window host element', kernel);
    container.removeEventListener('contextmenu', handleContextMenu);
    return createShutdownOnlyInstance(kernel, container, handleContextMenu);
  }

  // Create the application launcher (resolves deps from kernel)
  const launcher = new ApplicationLauncher(kernel);
  kernel.register('applicationLauncher', launcher);

  const dialogManager = new DialogManager(kernel);
  kernel.register('dialogManager', dialogManager);

  const windowManager = new WindowManager(windowHost, (event) => {
    launcher.onWindowUiEvent(event);
  });
  kernel.register('windowManager', windowManager);

  // Wire floating taskbar mode to window manager
  desktopShell.onTaskbarModeChange((mode) => {
    const height = mode === 'docked' ? 96 : mode === 'fullwidth' ? 64 : 0;
    windowManager.setMaximizedTaskbarHeight(height);
  });
  // Apply the current mode immediately — the saved theme may have already set
  // a non-default taskbar mode before onTaskbarModeChange was registered.
  {
    const currentMode = desktopShell.getTaskbarMode();
    const initialHeight = currentMode === 'docked' ? 96 : currentMode === 'fullwidth' ? 64 : 0;
    windowManager.setMaximizedTaskbarHeight(initialHeight, false);
  }

  const kernelConsole = new KernelConsole(kernel);
  kernel.register('kernelConsole', kernelConsole);

  const systemAppId = kernel.get('systemAppId');
  const processManager = kernel.resolve('processManager');
  const runtimeRegistry = kernel.resolve('runtimeRegistry');
  const eventBus = kernel.resolve('eventBus');
  const systemMonitor = kernel.resolve('systemMonitor');

  windowManager.setWindowChangeListener((event) => {
    const summaries = windowManager.getOpenWindowSummaries();
    desktopShell.syncOpenWindows(summaries);

    if (event.type === 'closed') {
      // 若 picker 程序的視窗關閉，自動取消對應的 dialog
      dialogManager.onPickerProcessTerminated(event.processAppId);

      const remainingWindows = windowManager.getWindowsByProcess(event.processAppId);
      if (remainingWindows.length === 0) {
        const proc = processManager.getByProcessAppId(event.processAppId);
        if (proc) {
          systemMonitor.recordProcessTerminate(proc.pid, proc.appDefId);
          runtimeRegistry.getForPid(proc.pid).destroyProcessRuntime(proc.pid);
          runtimeRegistry.unbindProcess(proc.pid, proc.processAppId);
          processManager.terminate(systemAppId, proc.pid);
          kernel.resolve('audioManager').stopAll(proc.processAppId);
          eventBus.emit(systemAppId, Events.PROCESS_STOPPED, {
            pid: proc.pid,
            appDefId: proc.appDefId,
            type: proc.type,
          });
        }
      }
    }

    if (event.type === 'resized' && event.bounds) {
      try {
        runtimeRegistry.getForProcessAppId(event.processAppId).dispatchUiEvent(event.processAppId, {
          eventId: '',
          windowId: event.windowId,
          processAppId: event.processAppId,
          type: 'resize',
          width: event.bounds.width,
          height: event.bounds.height,
        });
      } catch { /* process may be gone */ }
    }
  });

  // Wire html-view script dispatcher: extracts from <script> tags are evaluated in the process sandbox
  windowManager.setScriptDispatcher((processAppId, code) => {
    try {
      runtimeRegistry.getForProcessAppId(processAppId).dispatchHtmlViewScript(processAppId, code);
    } catch { /* process may be gone */ }
  });

  // 6. Register all Host APIs via modular registrars
  registerAllHostApis(kernel);

  // 6.5. Wire runtime memory provider to system monitor
  systemMonitor.setRuntimeMemoryProvider(() => runtimeRegistry.getAllMemoryUsage());

  // 6.6. Start clipboard paste listener (bridges external browser clipboard into the system)
  kernel.resolve('clipboardManager').init();

  // 7. Wire desktop shell events
  desktopShell.onTaskbarWindowClick((windowId, processAppId) => {
    windowManager.focusWindow(processAppId, windowId);
  });

  desktopShell.onLaunchRequest((app) => {
    if (app.appId === BUILTIN_KERNEL_CONSOLE) {
      launcher.launchKernelConsole(BUILTIN_KERNEL_CONSOLE, app.name, app.icon);
    } else {
      launcher.launchApplication({ app, type: app.runtimeType });
    }
  });

  // 7.5 Wire keyboard events (scoped to container, not the whole document)
  // 有焦點視窗時 → 直接 dispatch 給該程序的 onKeyboardEvent
  // 無焦點視窗時 → 透過 EventBus 廣播 keyboard 事件
  const handleKeyboardEvent = (e: KeyboardEvent) => {
    // 忽略輸入欄位中的按鍵，避免干擾正常文字輸入
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
      return;
    }

    const keyEvent: Record<string, unknown> = {
      type: e.type,
      key: e.key,
      code: e.code,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
      repeat: e.repeat,
    };

    const focusedProcessAppId = windowManager.getFocusedProcessAppId();
    if (focusedProcessAppId) {
      try {
        runtimeRegistry.getForProcessAppId(focusedProcessAppId).dispatchKeyboardEvent(focusedProcessAppId, keyEvent);
      } catch { /* process may be gone */ }
    } else {
      eventBus.emit(systemAppId, Events.KEYBOARD, keyEvent);
    }
  };
  container.addEventListener('keydown', handleKeyboardEvent);
  container.addEventListener('keyup', handleKeyboardEvent);

  // 8. Load plugins
  const pluginManager = new PluginManager(kernel);
  kernel.register('pluginManager', pluginManager);

  try {
    // 8a. Load pre-imported plugin instances (from host page / NPM packages)
    if (pluginInstances.length > 0) {
      const instanceResult = await pluginManager.loadPluginModules(pluginInstances as unknown as PluginModule[]);
      for (const name of instanceResult.loaded) {
        bufferedLog('BOOT', 'INFO', `Plugin (instance) loaded: ${name}`);
      }
      for (const { name, error } of instanceResult.failed) {
        bufferedLog('BOOT', 'WARN', `Plugin (instance) failed: ${name} — ${error}`);
      }
    }

    // 8b. Load path-based plugins from plugins.json
    if (Array.isArray(pluginPaths)) {
      const result = await pluginManager.loadPlugins(pluginPaths);
      for (const path of result.loaded) {
        bufferedLog('BOOT', 'INFO', `Plugin loaded: ${path}`);
      }
      for (const { path, error } of result.failed) {
        bufferedLog('BOOT', 'WARN', `Plugin failed: ${path} — ${error}`);
      }
    } else if (typeof pluginListUrl === 'string') {
      const pluginListRes = await fetch(pluginListUrl);
      if (pluginListRes.ok) {
        const listFromUrl: string[] = await pluginListRes.json();
        const result = await pluginManager.loadPlugins(listFromUrl);
        for (const path of result.loaded) {
          bufferedLog('BOOT', 'INFO', `Plugin loaded: ${path}`);
        }
        for (const { path, error } of result.failed) {
          bufferedLog('BOOT', 'WARN', `Plugin failed: ${path} — ${error}`);
        }
      } else {
        bufferedLog('BOOT', 'INFO', `Plugin list not found at ${pluginListUrl}, skipping plugin loading`);
      }
    } else {
      bufferedLog('BOOT', 'INFO', 'No plugin list configured, skipping plugin loading');
    }
  } catch (err) {
    bufferedLog('BOOT', 'WARN', `Plugin loading error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 9. Boot auto-start apps (Library → Service → Window/Console)
  // 自動啟動由系統發起，使用 systemAppId 繞過使用者權限限制
  const systemAppIdForBoot = kernel.get('systemAppId');
  const libraries = catalogApps.filter(a => a.runtimeType === 'Library');
  const autoStartApps = catalogApps.filter(a => a.runtimeType !== 'Library' && a.autoStart);

  for (const lib of libraries) {
    await launcher.launchApplication({ app: lib, type: 'Library', callerAppId: systemAppIdForBoot });
  }
  // Services have no UI and are independent, so they can be started in parallel.
  // Window/Console apps launch sequentially to preserve their z-order and cascade positions.
  const serviceApps = autoStartApps.filter(a => a.runtimeType === 'Service');
  const uiApps = autoStartApps.filter(a => a.runtimeType !== 'Service');
  await Promise.all(serviceApps.map(app =>
    launcher.launchApplication({ app, type: app.runtimeType, callerAppId: systemAppIdForBoot })
  ));
  for (const app of uiApps) {
    await launcher.launchApplication({ app, type: app.runtimeType, callerAppId: systemAppIdForBoot });
  }

  bios.destroyBootTerminal();

  // ── Return instance handle ────────────────────────────────────
  return {
    kernel,
    async shutdown(): Promise<void> {
      container.removeEventListener('keydown', handleKeyboardEvent);
      container.removeEventListener('keyup', handleKeyboardEvent);
      container.removeEventListener('contextmenu', handleContextMenu);

      if (kernel.has('pluginManager')) {
        await (kernel.resolve('pluginManager') as PluginManager).unloadAll();
      }

      const pm = kernel.resolve('processManager');
      for (const proc of pm.getAllProcesses()) {
        try {
          const runtime = runtimeRegistry.getForPid(proc.pid);
          if (runtime) {
            runtime.destroyProcessRuntime(proc.pid);
          }
        } catch { /* runtime may already be gone */ }
        try {
          runtimeRegistry.unbindProcess(proc.pid, proc.processAppId);
          pm.terminate(systemAppId, proc.pid);
        } catch { /* process may already be gone */ }
      }

      container.replaceChildren();
    },
  };
}

/**
 * Creates a minimal shutdown-only instance for early-abort error paths where
 * the full boot sequence did not complete.
 */
function createShutdownOnlyInstance(
  kernel: Kernel,
  container: HTMLElement,
  handleContextMenu: (e: Event) => void,
): SentryOSInstance {
  return {
    kernel,
    async shutdown(): Promise<void> {
      container.removeEventListener('contextmenu', handleContextMenu);
      container.replaceChildren();
    },
  };
}

async function initializeCore(
  bufferedLog: BufferedLog,
  fileSystemFactory: ((kernel: Kernel) => FileSystemAdapter) | undefined,
  userDefaultPermissions: string[],
): Promise<Kernel> {
  await initializeQuickJS();
  bufferedLog('BOOT', 'INFO', 'QuickJS WASM runtime loaded');

  const kernel = new Kernel();

  const permissions = new PermissionsManager(kernel);
  const initResult = permissions.init();
  if (!initResult.success || typeof initResult.data !== 'string') {
    throw new Error('PermissionsManager initialization failed');
  }
  bufferedLog('BOOT', 'INFO', 'PermissionsManager initialized');
  kernel.register('permissions', permissions);

  const systemAppId = initResult.data;
  kernel.set('systemAppId', systemAppId);

  // 建立使用者權限實體（與系統分離，受可配置的 default permissions 約束）
  const userResult = permissions.createUser(systemAppId, userDefaultPermissions);
  if (!userResult.success || typeof userResult.data !== 'string') {
    throw new Error('User session creation failed');
  }
  kernel.set('userAppId', userResult.data);
  bufferedLog('BOOT', 'INFO', 'User session created');

  const eventBus = new EventBus(kernel);
  kernel.register('eventBus', eventBus);

  const appManager = new ApplicationManager();
  kernel.register('appManager', appManager);

  const processManager = new ProcessManager(kernel);
  kernel.register('processManager', processManager);

  const runtime = new ScriptRuntime(kernel);
  kernel.register('runtime', runtime);

  const runtimeRegistry = new RuntimeRegistry();
  runtimeRegistry.register('quickjs', runtime);
  kernel.register('runtimeRegistry', runtimeRegistry);

  const fileSystem = fileSystemFactory ? fileSystemFactory(kernel) : new WebFileSystemAdapter(kernel);
  kernel.register('fileSystem', fileSystem);

  const environmentManager = new EnvironmentManager();
  kernel.register('environmentManager', environmentManager);

  const languageManager = new LanguageManager(kernel);
  kernel.register('languageManager', languageManager);

  // 註冊系統翻譯包
  languageManager.registerSystemPack('desktop', desktopShellPack);
  languageManager.registerSystemPack('alert', systemAlertPack);
  languageManager.registerSystemPack('bootstrap', bootstrapPack);
  languageManager.registerSystemPack('console', kernelConsolePack);
  languageManager.registerSystemPack('installer', appInstallerPack);
  languageManager.registerSystemPack('lockscreen', lockScreenPack);

  const notificationManager = new NotificationManager();
  kernel.register('notificationManager', notificationManager);

  const sysAlert = new SystemAlert(kernel);
  kernel.register('systemAlert', sysAlert);

  const appInstaller = new AppInstaller(kernel);
  kernel.register('appInstaller', appInstaller);

  const networkManager = new AllowlistNetworkManager();
  kernel.register('networkManager', networkManager);

  // Restore persisted network settings
  const netState = fileSystem.read(systemAppId, 'sys', 'network-settings');
  if (netState.success && netState.data) {
    networkManager.importState(netState.data.data as any);
  }

  const systemRegistry = new SystemRegistry(kernel);
  kernel.register('systemRegistry', systemRegistry);

  const clipboardManager = new ClipboardManager(kernel);
  kernel.register('clipboardManager', clipboardManager);

  const audioManager = new AudioManager();
  kernel.register('audioManager', audioManager);

  const desktopShell = new DesktopShell();
  kernel.register('desktopShell', desktopShell);

  const bootStartTime = Date.now();
  kernel.set('bootStartTime', bootStartTime);

  const systemMonitor = new SystemMonitor(bootStartTime);
  kernel.register('systemMonitor', systemMonitor);

  bufferedLog('BOOT', 'INFO', 'All core services initialized');

  return kernel;
}

function registerApplications(appManager: ApplicationManager, apps: RegisteredApplication[]): { applications: Application[]; iconMap: Map<string, string> } {
  const applications: Application[] = [];
  const iconMap = new Map<string, string>();
  for (const app of apps) {
    const appId = appManager.register({
      name: app.name,
      version: app.version,
      permissions: app.permissions,
      maxInstances: app.maxInstances,
    }, app.manifestId);

    // Write appId back to the original RegisteredApplication so that
    // catalogApps, boot loops, and API lookups all reference the correct ID.
    app.appId = appId;

    applications.push({ ...app, appId });
    if (app.icon) {
      iconMap.set(appId, app.icon);
    }
  }
  return { applications, iconMap };
}

// ── Default registry population ────────────────────────────────

/** manifest id → system role 對照表 */
export const DEFAULT_REGISTRY_ROLE_MAP: Record<string, string> = {
  'task-manager-app': 'task-manager',
  'file-manager-app': 'file-manager',
  'settings-app': 'settings',
  'text-manager-app': 'text-editor',
};

/** 預設檔案類型 → manifest id 對照表 */
export const DEFAULT_REGISTRY_FILE_TYPE_MAP: Record<string, { handler: string; mime?: string }> = {
  '.txt': { handler: 'text-manager-app', mime: 'text/plain' },
  '.md': { handler: 'text-manager-app', mime: 'text/markdown' },
  '.json': { handler: 'text-manager-app', mime: 'application/json' },
  '.js': { handler: 'text-manager-app', mime: 'application/javascript' },
  '.ts': { handler: 'text-manager-app', mime: 'application/typescript' },
  '.css': { handler: 'text-manager-app', mime: 'text/css' },
  '.html': { handler: 'text-manager-app', mime: 'text/html' },
  '.xml': { handler: 'text-manager-app', mime: 'application/xml' },
  '.log': { handler: 'text-manager-app', mime: 'text/plain' },
  '.cfg': { handler: 'text-manager-app', mime: 'text/plain' },
  '.ini': { handler: 'text-manager-app', mime: 'text/plain' },
  '.yaml': { handler: 'text-manager-app', mime: 'text/yaml' },
  '.yml': { handler: 'text-manager-app', mime: 'text/yaml' },
  '.csv': { handler: 'text-manager-app', mime: 'text/csv' },
};

type RegistryDefaults = {
  includeBuiltinTerminal: boolean;
  roleMap: Record<string, string>;
  fileTypeMap: Record<string, { handler: string; mime?: string }>;
};

function populateDefaultRegistry(kernel: Kernel, catalogApps: RegisteredApplication[], defaults: RegistryDefaults): void {
  const registry = kernel.resolve('systemRegistry');
  const appManager = kernel.resolve('appManager');

  // 嘗試從 sys 層還原先前保存的設定
  const restored = registry.restore();

  if (restored) {
    // 檢查還原的 ID 是否仍然有效（舊版本可能存了開機時動態產生的 volatile ID）
    const roles = registry.getAllRoles();
    const hasStaleRoles = Object.values(roles).some(id => id !== BUILTIN_KERNEL_CONSOLE && !appManager.get(id));
    const hasStaleFileTypes = registry.getAllFileTypeHandlers().some(ft => !appManager.get(ft.appDefId));

    if (!hasStaleRoles && !hasStaleFileTypes) {
      // 所有 ID 皆有效，保留使用者自訂設定
      return;
    }
    // 包含失效的 volatile ID，清除後重新建立
  }

  // Terminal 特殊處理：使用 builtin id
  if (defaults.includeBuiltinTerminal) {
    registry.setDefaultApp('terminal', BUILTIN_KERNEL_CONSOLE);
  }

  // 現在 appDefId 即為 manifestId，可直接使用
  const knownManifestIds = new Set(catalogApps.map(a => a.manifestId).filter(Boolean));

  // 設定角色預設值
  for (const [manifestId, role] of Object.entries(defaults.roleMap)) {
    if (knownManifestIds.has(manifestId)) {
      registry.setDefaultApp(role, manifestId);
    }
  }

  // 設定檔案類型預設值
  for (const [ext, { handler, mime }] of Object.entries(defaults.fileTypeMap)) {
    if (knownManifestIds.has(handler)) {
      registry.setFileTypeHandler(ext, handler, mime);
    }
  }

  // 持久化初始設定
  registry.persist();
}

// ── Boot-time remote app permission consent check ──────────────

/** Returns true if the URL uses http or https scheme. */
function isRemoteUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 比對每個遠端 App 的目前權限與已同意的快取權限。
 * - 若從未同意（app-grants 中無記錄）→ 顯示完整安裝對話框
 * - 若有新增權限 → 顯示重新同意對話框
 * - 若使用者拒絕 → 從 sys:app.js 移除，並從 catalogApps 剔除
 * - 若使用者同意或無變更 → 更新 app-grants 快取
 *
 * catalogApps 陣列會被就地修改（splice 移除被拒絕的項目）。
 * 呼叫完成後，呼叫端應重新呼叫 desktopShell.setApplications() 以同步最新清單。
 */
async function checkRemoteAppConsent(
  kernel: Kernel,
  appInstaller: import('../application/AppInstaller').AppInstaller,
  catalogApps: RegisteredApplication[],
  bufferedLog: BufferedLog,
): Promise<void> {
  const fileSystem = kernel.resolve('fileSystem');
  const systemAppId = kernel.get('systemAppId');
  const appManager = kernel.resolve('appManager');

  const appJsResult = fileSystem.read(systemAppId, 'sys', 'app.js');
  if (!appJsResult.success || !Array.isArray(appJsResult.data?.data)) return;

  const rawEntries = appJsResult.data!.data as string[];
  if (rawEntries.length === 0) return;

  /** Map normalizedManifestUrl → { info, appsInCatalog } */
  const urlToApps = new Map<string, { name: string; version?: string; author?: string; description?: string; permissions: string[]; appsInCatalog: RegisteredApplication[] }>();

  for (const rawEntry of rawEntries) {
    const normalizedUrl = normalizeCatalogEntry(rawEntry);
    if (!isRemoteUrl(normalizedUrl)) continue;  // local paths don't need consent

    const entryBasePath = normalizedUrl.slice(0, normalizedUrl.lastIndexOf('/'));
    const appsFromUrl = catalogApps.filter(a => a.entryPath === entryBasePath);
    if (appsFromUrl.length === 0) continue;  // failed to load at boot — skip (don't remove)

    // Collect all permissions from all apps in this package
    const allPerms = new Set<string>();
    for (const a of appsFromUrl) {
      for (const p of a.permissions) allPerms.add(p);
    }

    urlToApps.set(normalizedUrl, {
      name: appsFromUrl[0].packageName || appsFromUrl[0].name,
      version: appsFromUrl[0].version,
      permissions: Array.from(allPerms),
      appsInCatalog: appsFromUrl,
    });
  }

  const toRemove: string[] = [];

  for (const [manifestUrl, entry] of urlToApps) {
    const storedPerms = appInstaller.getGrantedPermissions(manifestUrl);
    const info = {
      name: entry.name,
      version: entry.version,
      permissions: entry.permissions,
      manifestUrl,
    };

    let accepted = true;

    if (storedPerms === null) {
      // Never consented — show full install consent dialog
      const result = await appInstaller.requestInstall(info);
      accepted = result.confirmed;
    } else {
      // Check for new permissions since last consent
      const newPerms = entry.permissions.filter(p => !storedPerms.includes(p));
      if (newPerms.length > 0) {
        // New permissions added — show re-consent dialog
        accepted = await appInstaller.requestReConsent({ ...info, newPermissions: newPerms });
      } else if (entry.permissions.length < storedPerms.length) {
        // Permissions only reduced — silently update the cache
        appInstaller.updateGrants(manifestUrl, entry.permissions);
      }
      // Otherwise permissions unchanged — nothing to do
    }

    if (!accepted) {
      toRemove.push(manifestUrl);
    }
  }

  if (toRemove.length === 0) return;

  // Remove declined apps from sys:app.js and from catalogApps
  for (const manifestUrl of toRemove) {
    appInstaller.removeInstall(manifestUrl);
    const appsToRemove = urlToApps.get(manifestUrl)?.appsInCatalog ?? [];
    for (const app of appsToRemove) {
      const idx = catalogApps.indexOf(app);
      if (idx !== -1) catalogApps.splice(idx, 1);
      if (app.appId) {
        try { appManager.unregister(app.appId); } catch { /* ignore */ }
      }
    }
    bufferedLog('BOOT', 'INFO', `Removed declined remote app: ${manifestUrl}`);
  }

  // Re-sync the desktop shell app list after removals
  const desktopShell = kernel.resolve('desktopShell');
  desktopShell.setApplications(catalogApps.filter(a => a.runtimeType !== 'Service' && a.runtimeType !== 'Library' && !a.hidden));
}
