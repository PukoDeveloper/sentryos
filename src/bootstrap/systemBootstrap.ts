import { initializeQuickJS } from '../runtime/QuickJsInit';
import { ScriptRuntime } from '../runtime/ScriptRuntime';
import { RuntimeRegistry } from '../runtime/RuntimeRegistry';
import { PermissionsManager } from '../permissions/PermissionsManager';
import { EventBus } from '../events/EventBus';
import { ApplicationManager, type Application } from '../application/ApplicationManager';
import { ProcessManager } from '../process/ProcessManager';
import { loadApplicationCatalog, type RegisteredApplication } from '../application/ApplicationCatalog';
import { WebFileSystemAdapter } from '../storage/FileSystem';
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
import { Kernel } from '../kernel/Kernel';
import { registerAllHostApis } from '../api';
import { bios } from '../ui/Bios';
import { Events, USER_DEFAULT_PERMISSIONS, BUILTIN_KERNEL_CONSOLE } from '../kernel/constants';
import { PluginManager } from '../plugin/PluginManager';
import { LanguageManager } from '../language/LanguageManager';

// ── Boot log buffer (for error screen) ──────────────────────────
const bootLog: string[] = [];
const originalLog = bios.log.bind(bios);
function bufferedLog(source: string, level: Parameters<typeof bios.log>[1], message: string): void {
  bootLog.push(`[${source}] [${level}] ${message}`);
  originalLog(source, level, message);
}

// ── System-level error: show BIOS error screen ──────────────────
function showSystemError(title: string, error?: unknown): void {
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
    { label: '重新啟動系統', handler: () => location.reload() },
  ]);
}

// ── Bootstrap ───────────────────────────────────────────────────
async function bootstrapSystem(): Promise<void> {
  bios.createBootTerminal();
  bios.init();
  bufferedLog('BOOT', 'INFO', 'Preparing core services');

  // 1. Initialize kernel & core services
  let kernel: Kernel;
  try {
    kernel = await initializeCore();
  } catch (err) {
    showSystemError('核心服務初始化失敗', err);
    return;
  }

  const desktopShell = kernel.resolve('desktopShell');
  const appManager = kernel.resolve('appManager');

  // 2. Load application catalog
  let catalogApps: RegisteredApplication[];
  try {
    const catalogResult = await loadApplicationCatalog();
    if (!catalogResult.success || !catalogResult.data) {
      showSystemError('應用程式目錄載入失敗', catalogResult.error ?? 'UnknownError');
      return;
    }
    catalogApps = catalogResult.data;
  } catch (err) {
    showSystemError('應用程式目錄載入失敗', err);
    return;
  }

  // 3. Register applications
  const { applications, iconMap } = registerApplications(appManager, catalogApps);

  // Register built-in kernel console as a native application
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

  kernel.set('catalogApps', catalogApps);
  kernel.set('iconMap', iconMap);

  // 3.5  Populate system registry defaults
  populateDefaultRegistry(kernel, catalogApps);

  // 4. Mount desktop shell
  const mounted = desktopShell.mount(applications);
  if (!mounted) {
    showSystemError('桌面外殼掛載失敗', 'Desktop shell mount failed — app container is unavailable');
    return;
  }

  desktopShell.setApplications(catalogApps.filter(a => a.runtimeType !== 'Service' && a.runtimeType !== 'Library' && !a.hidden));

  // Register notification overlay
  const notifContainer = kernel.resolve('notificationManager').createContainer();
  desktopShell.registerOverlay({ id: 'notification-layer', element: notifContainer, order: 100 });

  // Register system alert overlay
  const systemAlert = kernel.resolve('systemAlert');
  const alertContainer = systemAlert.createContainer();
  desktopShell.registerOverlay({ id: 'system-alert-layer', element: alertContainer, order: 200 });

  // 5. Create window manager
  const windowHost = desktopShell.getWindowHost();
  if (!windowHost) {
    showSystemError('桌面外殼掛載失敗', 'Desktop shell has no window host element');
    return;
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

  // 6. Register all Host APIs via modular registrars
  registerAllHostApis(kernel);

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

  // 7.5 Wire keyboard events
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
  document.addEventListener('keydown', handleKeyboardEvent);
  document.addEventListener('keyup', handleKeyboardEvent);

  // 8. Load plugins
  try {
    const pluginManager = new PluginManager(kernel);
    kernel.register('pluginManager', pluginManager);

    const pluginListRes = await fetch('/plugins.json');
    if (pluginListRes.ok) {
      const pluginPaths: string[] = await pluginListRes.json();
      const result = await pluginManager.loadPlugins(pluginPaths);
      for (const path of result.loaded) {
        bufferedLog('BOOT', 'INFO', `Plugin loaded: ${path}`);
      }
      for (const { path, error } of result.failed) {
        bufferedLog('BOOT', 'WARN', `Plugin failed: ${path} — ${error}`);
      }
    } else {
      bufferedLog('BOOT', 'INFO', 'No plugins.json found, skipping plugin loading');
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
  for (const app of autoStartApps) {
    await launcher.launchApplication({ app, type: app.runtimeType, callerAppId: systemAppIdForBoot });
  }

  bios.destroyBootTerminal();
}

async function initializeCore(): Promise<Kernel> {
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

  // 建立使用者權限實體（與系統分離，受 USER_DEFAULT_PERMISSIONS 約束）
  const userResult = permissions.createUser(systemAppId, USER_DEFAULT_PERMISSIONS);
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

  const fileSystem = new WebFileSystemAdapter(kernel);
  kernel.register('fileSystem', fileSystem);

  const environmentManager = new EnvironmentManager();
  kernel.register('environmentManager', environmentManager);

  const languageManager = new LanguageManager(kernel);
  kernel.register('languageManager', languageManager);

  const notificationManager = new NotificationManager();
  kernel.register('notificationManager', notificationManager);

  const sysAlert = new SystemAlert(kernel);
  kernel.register('systemAlert', sysAlert);

  const networkManager = new AllowlistNetworkManager();
  kernel.register('networkManager', networkManager);

  // Restore persisted network settings
  const netState = fileSystem.read(systemAppId, 'sys', 'network-settings');
  if (netState.success && netState.data) {
    networkManager.importState(netState.data.data as any);
  }

  const systemRegistry = new SystemRegistry(kernel);
  kernel.register('systemRegistry', systemRegistry);

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
const ROLE_MAP: Record<string, string> = {
  'task-manager-app': 'task-manager',
  'file-manager-app': 'file-manager',
  'settings-app': 'settings',
  'text-manager-app': 'text-editor',
};

/** 預設檔案類型 → manifest id 對照表 */
const FILE_TYPE_MAP: Record<string, { handler: string; mime?: string }> = {
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

function populateDefaultRegistry(kernel: Kernel, catalogApps: RegisteredApplication[]): void {
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
  registry.setDefaultApp('terminal', BUILTIN_KERNEL_CONSOLE);

  // 現在 appDefId 即為 manifestId，可直接使用
  const knownManifestIds = new Set(catalogApps.map(a => a.manifestId).filter(Boolean));

  // 設定角色預設值
  for (const [manifestId, role] of Object.entries(ROLE_MAP)) {
    if (knownManifestIds.has(manifestId)) {
      registry.setDefaultApp(role, manifestId);
    }
  }

  // 設定檔案類型預設值
  for (const [ext, { handler, mime }] of Object.entries(FILE_TYPE_MAP)) {
    if (knownManifestIds.has(handler)) {
      registry.setFileTypeHandler(ext, handler, mime);
    }
  }

  // 持久化初始設定
  registry.persist();
}

export { bootstrapSystem };
