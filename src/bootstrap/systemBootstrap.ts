import { initializeQuickJS } from '../runtime/QuickJsInit';
import { ScriptRuntime } from '../runtime/ScriptRuntime';
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
import { ApplicationLauncher } from '../application/ApplicationLauncher';
import { Kernel } from '../kernel/Kernel';
import { registerAllHostApis } from '../api';
import { bios } from '../ui/Bios';
import { Events, USER_DEFAULT_PERMISSIONS } from '../kernel/constants';

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
  kernel.set('catalogApps', catalogApps);
  kernel.set('iconMap', iconMap);

  // 4. Mount desktop shell
  const mounted = desktopShell.mount(applications);
  if (!mounted) {
    showSystemError('桌面外殼掛載失敗', 'Desktop shell mount failed — app container is unavailable');
    return;
  }

  desktopShell.setApplications(catalogApps.filter(a => a.runtimeType !== 'Service' && a.runtimeType !== 'Library'));

  // Register notification overlay
  const notifContainer = kernel.resolve('notificationManager').createContainer();
  desktopShell.registerOverlay({ id: 'notification-layer', element: notifContainer, order: 100 });

  // 5. Create window manager
  const windowHost = desktopShell.getWindowHost();
  if (!windowHost) {
    showSystemError('桌面外殼掛載失敗', 'Desktop shell has no window host element');
    return;
  }

  // Create the application launcher (resolves deps from kernel)
  const launcher = new ApplicationLauncher(kernel);
  kernel.register('applicationLauncher', launcher);

  const windowManager = new WindowManager(windowHost, (event) => {
    launcher.onWindowUiEvent(event);
  });
  kernel.register('windowManager', windowManager);

  const systemAppId = kernel.get('systemAppId');
  const processManager = kernel.resolve('processManager');
  const runtime = kernel.resolve('runtime');
  const eventBus = kernel.resolve('eventBus');
  const systemMonitor = kernel.resolve('systemMonitor');

  windowManager.setWindowChangeListener((event) => {
    const summaries = windowManager.getOpenWindowSummaries();
    desktopShell.syncOpenWindows(summaries);

    if (event.type === 'closed') {
      const remainingWindows = windowManager.getWindowsByProcess(event.processAppId);
      if (remainingWindows.length === 0) {
        const proc = processManager.getByProcessAppId(event.processAppId);
        if (proc) {
          systemMonitor.recordProcessTerminate(proc.pid, proc.appDefId);
          runtime.destroyProcessRuntime(proc.pid);
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
        runtime.dispatchUiEvent(event.processAppId, {
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
    launcher.launchApplication({ app, type: app.runtimeType });
  });

  // 8. Boot auto-start apps (Library → Service → Window/Console)
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

  const fileSystem = new WebFileSystemAdapter(kernel);
  kernel.register('fileSystem', fileSystem);

  const environmentManager = new EnvironmentManager();
  kernel.register('environmentManager', environmentManager);

  const notificationManager = new NotificationManager();
  kernel.register('notificationManager', notificationManager);

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
    });

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

export { bootstrapSystem };
