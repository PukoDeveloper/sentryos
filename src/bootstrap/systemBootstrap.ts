import { initializeQuickJS, ScriptRuntime } from '../core/ScriptRuntime';
import PermissionsManager from '../core/PermissionsManager';
import EventBus from '../core/EventBus';
import { ApplicationManager, ProcessManager, type Application } from '../core/App';
import { loadApplicationCatalog, type RegisteredApplication } from '../core/ApplicationCatalog';
import { WebFileSystemAdapter } from '../core/storage';
import { WindowManager, type WindowUiEvent, type ConsoleWindowController } from '../core/WindowSystem';
import { EnvironmentManager } from '../core/EnvironmentManager';
import { DesktopShell } from '../ui/DesktopShell';
import { NotificationManager } from '../core/NotificationManager';
import { SystemMonitor } from '../core/SystemMonitor';
import { bios, getAppDiv } from './bios';
import { DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT, Permissions, Events, type AppType } from '../core/constants';

interface BootDependencies {
  bios: typeof bios;
  systemAppId: string;
  permissions: PermissionsManager;
  eventBus: EventBus;
  appManager: ApplicationManager;
  processManager: ProcessManager;
  runtime: ScriptRuntime;
  fileSystem: WebFileSystemAdapter;
  desktopShell: DesktopShell;
  windowManager: WindowManager;
  environmentManager: EnvironmentManager;
  notificationManager: NotificationManager;
  systemMonitor: SystemMonitor;
  catalogApps: RegisteredApplication[];
  bootStartTime: number;
}

interface LaunchContext {
  app: RegisteredApplication;
  type: AppType;
}

// ── Boot log buffer (for error screen) ──────────────────────────
const bootLog: string[] = [];
const consoleControllers = new Map<string, ConsoleWindowController>();
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

// ── App-level error: clean up process & windows ─────────────────
function terminateApplication(dependencies: BootDependencies, processAppId: string, reason: string): void {
  const proc = dependencies.processManager.getByProcessAppId(processAppId);
  if (!proc) return;

  const appDef = dependencies.appManager.get(proc.appDefId);
  const appName = appDef?.name ?? proc.appDefId;

  dependencies.bios.log('PROC', 'INFO', `Terminating ${appName} (PID ${proc.pid}): ${reason}`);

  dependencies.systemMonitor.recordProcessTerminate(proc.pid, proc.appDefId);

  // Clean up console controller if present
  consoleControllers.delete(processAppId);

  // Close all windows owned by this process
  const windowIds = dependencies.windowManager.getWindowsByProcess(processAppId);
  for (const wid of windowIds) {
    try { dependencies.windowManager.closeWindow(processAppId, wid); } catch { /* window may already be gone */ }
  }

  // Destroy QuickJS runtime
  dependencies.runtime.destroyProcessRuntime(proc.pid);

  // Terminate process tree
  dependencies.processManager.terminate(dependencies.systemAppId, proc.pid);

  // Emit lifecycle event
  dependencies.eventBus.emit(dependencies.systemAppId, Events.PROCESS_STOPPED, {
    pid: proc.pid,
    appDefId: proc.appDefId,
    type: proc.type,
  });
}

// ── Bootstrap ───────────────────────────────────────────────────
async function bootstrapSystem(): Promise<void> {
  bios.createBootTerminal();
  bios.init();
  bufferedLog('BOOT', 'INFO', 'Preparing core services');

  let dependencies: BootDependencies;
  try {
    dependencies = await initializeCore();
  } catch (err) {
    showSystemError('核心服務初始化失敗', err);
    return;
  }

  const { desktopShell } = dependencies;

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

  dependencies.catalogApps = catalogApps;

  const { applications, iconMap } = registerApplications(dependencies.appManager, catalogApps);

  const mounted = desktopShell.mount(applications);
  if (!mounted) {
    showSystemError('桌面外殼掛載失敗', 'Desktop shell mount failed — app container is unavailable');
    return;
  }

  desktopShell.setApplications(catalogApps.filter(a => a.runtimeType !== 'Service' && a.runtimeType !== 'Library'));

  // 註冊全域通知覆蓋層
  const notifContainer = dependencies.notificationManager.createContainer();
  desktopShell.registerOverlay({ id: 'notification-layer', element: notifContainer, order: 100 });

  const windowHost = desktopShell.getWindowHost();
  if (!windowHost) {
    showSystemError('桌面外殼掛載失敗', 'Desktop shell has no window host element');
    return;
  }

  dependencies.windowManager = new WindowManager(windowHost, (event) => {
    onWindowUiEvent(dependencies, event);
  });

  dependencies.windowManager.setWindowChangeListener((event) => {
    const summaries = dependencies.windowManager.getOpenWindowSummaries();
    desktopShell.syncOpenWindows(summaries);

    if (event.type === 'closed') {
      const remainingWindows = dependencies.windowManager.getWindowsByProcess(event.processAppId);
      if (remainingWindows.length === 0) {
        const proc = dependencies.processManager.getByProcessAppId(event.processAppId);
        if (proc) {
          dependencies.systemMonitor.recordProcessTerminate(proc.pid, proc.appDefId);
          dependencies.runtime.destroyProcessRuntime(proc.pid);
          dependencies.processManager.terminate(dependencies.systemAppId, proc.pid);
          dependencies.eventBus.emit(dependencies.systemAppId, Events.PROCESS_STOPPED, {
            pid: proc.pid,
            appDefId: proc.appDefId,
            type: proc.type,
          });
        }
      }
    }

    if (event.type === 'resized' && event.bounds) {
      try {
        dependencies.runtime.dispatchUiEvent(event.processAppId, {
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

  dependencies.runtime.registerApi('ui', ({ process }) => {
    const app = dependencies.appManager.get(process.appDefId);
    if (!app) {
      return {};
    }
    return {
      createWindow: (options: Record<string, unknown>) => {
        if (!dependencies.permissions.has(process.processAppId, Permissions.WINDOW_CREATE)) {
          return { success: false, error: 'PermissionDenied' };
        }
        const result = dependencies.windowManager.createWindow(
          {
            processAppId: process.processAppId,
            appDefId: process.appDefId,
            appName: app.name,
            icon: iconMap.get(process.appDefId),
          },
          {
            title: String(options.title ?? app.name),
            width: Number(options.width ?? DEFAULT_WINDOW_WIDTH),
            height: Number(options.height ?? DEFAULT_WINDOW_HEIGHT),
            x: typeof options.x === 'number' ? options.x : undefined,
            y: typeof options.y === 'number' ? options.y : undefined,
            useDefaultFrame: options.useDefaultFrame !== false,
            alwaysOnTop: options.alwaysOnTop === true,
            resizable: options.resizable !== false,
            style: typeof options.style === 'object' ? (options.style as any) : undefined,
          }
        );
        return result;
      },
      initialize: (windowId: string, tree: unknown[]) =>
        dependencies.windowManager.initializeUi(process.processAppId, windowId, (tree ?? []) as any),
      label: (text: string, style?: Record<string, string>, id?: string) => ({ type: 'label', text, style, id }),
      button: (text: string, style?: Record<string, string>, id?: string) => ({ type: 'button', text, style, id }),
      stack: (children: unknown[], style?: Record<string, string>, id?: string) => ({ type: 'stack', children, style, id }),
      panel: (children: unknown[], style?: Record<string, string>, id?: string) => ({ type: 'panel', children, style, id }),
    };
  }, 'window');

  // ── System API: full-cycle terminate (close windows + destroy runtime + terminate process) ──
  dependencies.runtime.registerApi('systemApi', ({ pid, process }) => ({
    terminateProcess: (targetPid: number) => {
      if (!dependencies.permissions.has(process.processAppId, Permissions.PROCESS_TERMINATE)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const target = dependencies.processManager.get(targetPid);
      if (!target) return { success: false, error: 'NotFound' };
      // Always defer — synchronous termination from a host function causes re-entrant
      // execute() calls (PROCESS_STOPPED event → onEvent handler) on the caller's context.
      const reason = target.pid === pid ? 'Self-terminated' : `Terminated by PID ${pid}`;
      setTimeout(() => terminateApplication(dependencies, target.processAppId, reason), 0);
      return { success: true, data: targetPid };
    },
  }));

  // ── Storage API: query virtual storage usage ──
  dependencies.runtime.registerApi('storageApi', ({ process }) => ({
    usage: () => {
      if (!dependencies.permissions.has(process.processAppId, Permissions.STORAGE_USAGE)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return dependencies.fileSystem.usage(process.processAppId);
    },
  }));

  // ── Environment API: auto-start, env vars, library loading ──
  dependencies.runtime.registerApi('envApi', ({ pid, process }) => ({
    getVariable: (key: string) => {
      if (!dependencies.permissions.has(process.processAppId, Permissions.ENV_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return { success: true, data: dependencies.environmentManager.getVariable(key) };
    },
    getAllVariables: () => {
      if (!dependencies.permissions.has(process.processAppId, Permissions.ENV_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return { success: true, data: dependencies.environmentManager.getAllVariables() };
    },
    setVariable: (key: string, value: string) => {
      if (!dependencies.permissions.has(process.processAppId, Permissions.ENV_WRITE)) {
        return { success: false, error: 'PermissionDenied' };
      }
      dependencies.environmentManager.setVariable(key, value);
      return { success: true };
    },
    removeVariable: (key: string) => {
      if (!dependencies.permissions.has(process.processAppId, Permissions.ENV_WRITE)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return { success: true, data: dependencies.environmentManager.removeVariable(key) };
    },
    registerAutoStart: () => {
      if (!dependencies.permissions.has(process.processAppId, Permissions.ENV_AUTOSTART)) {
        return { success: false, error: 'PermissionDenied' };
      }
      dependencies.environmentManager.registerAutoStart(process.appDefId);
      return { success: true };
    },
    unregisterAutoStart: () => {
      if (!dependencies.permissions.has(process.processAppId, Permissions.ENV_AUTOSTART)) {
        return { success: false, error: 'PermissionDenied' };
      }
      dependencies.environmentManager.unregisterAutoStart(process.appDefId);
      return { success: true };
    },
    loadLibrary: (libraryId: string) => {
      if (!dependencies.permissions.has(process.processAppId, Permissions.ENV_LOAD_LIBRARY)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const code = dependencies.environmentManager.getLibraryCode(libraryId);
      if (!code) return { success: false, error: 'LibraryNotFound' };
      // Suppress command re-registration — commands are only registered at boot time
      dependencies.runtime.evaluateInContext(pid,
        `globalThis.__savedRegCmd = envApi.registerCommand; envApi.registerCommand = function(){};`
      );
      const result = dependencies.runtime.evaluateInContext(pid, code);
      dependencies.runtime.evaluateInContext(pid,
        `envApi.registerCommand = globalThis.__savedRegCmd; delete globalThis.__savedRegCmd;`
      );
      return result;
    },
    listLibraries: () => {
      return { success: true, data: dependencies.environmentManager.getLibraryIds() };
    },
    registerCommand: (name: unknown, description: unknown, usage?: unknown) => {
      const cmdName = String(name);
      if (!cmdName || cmdName.length === 0) return { success: false, error: 'InvalidName' };
      const matchedApp = dependencies.catalogApps.find(a => a.appId === process.appDefId);
      const libraryId = matchedApp ? matchedApp.packageName + '/' + matchedApp.name : process.appDefId;
      dependencies.environmentManager.registerCommand(cmdName, {
        libraryId,
        description: String(description ?? ''),
        usage: usage ? String(usage) : undefined,
      });
      return { success: true };
    },
  }));

  // ── Console API: enhanced writeLine/write/clear that update the console window ──
  dependencies.runtime.registerApi('consoleApi', ({ process }) => {
    const controller = consoleControllers.get(process.processAppId);
    return {
      writeLine: (text: unknown) => {
        if (!dependencies.permissions.has(process.processAppId, Permissions.CONSOLE_WRITE)) {
          return { success: false, error: 'PermissionDenied' };
        }
        if (controller) controller.appendLine(String(text));
        return true;
      },
      write: (text: unknown) => {
        if (!dependencies.permissions.has(process.processAppId, Permissions.CONSOLE_WRITE)) {
          return { success: false, error: 'PermissionDenied' };
        }
        if (controller) controller.appendText(String(text));
        return true;
      },
      clear: () => {
        if (!dependencies.permissions.has(process.processAppId, Permissions.CONSOLE_WRITE)) {
          return { success: false, error: 'PermissionDenied' };
        }
        if (controller) controller.clear();
        return true;
      },
    };
  }, 'console');

  // ── Shell API: system-level commands for console apps ──
  dependencies.runtime.registerApi('shellApi', ({ pid, process }) => ({
    listProcesses: () => {
      if (!dependencies.permissions.has(process.processAppId, Permissions.PROCESS_LIST)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const all = dependencies.processManager.getAllProcesses();
      return {
        success: true,
        data: all.map(p => ({
          pid: p.pid,
          appDefId: p.appDefId,
          processAppId: p.processAppId,
          type: p.type,
          status: p.status,
          parentPid: p.parentPid,
        })),
      };
    },
    killProcess: (targetPid: unknown) => {
      if (!dependencies.permissions.has(process.processAppId, Permissions.PROCESS_TERMINATE)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const tPid = Number(targetPid);
      if (!Number.isFinite(tPid)) return { success: false, error: 'InvalidPid' };
      const target = dependencies.processManager.get(tPid);
      if (!target) return { success: false, error: 'NotFound' };
      const reason = target.pid === pid ? 'Self-terminated via shell' : `Killed by PID ${pid} via shell`;
      setTimeout(() => terminateApplication(dependencies, target.processAppId, reason), 0);
      return { success: true, data: tPid };
    },
    listApps: () => {
      if (!dependencies.permissions.has(process.processAppId, Permissions.SHELL_LIST_APPS)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return {
        success: true,
        data: dependencies.catalogApps.map(a => ({
          appId: a.appId,
          name: a.name,
          version: a.version,
          type: a.runtimeType,
          package: a.packageName,
          autoStart: a.autoStart,
        })),
      };
    },
    launch: (appDefId: unknown) => {
      if (!dependencies.permissions.has(process.processAppId, Permissions.SHELL_LAUNCH)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const id = String(appDefId);
      const app = dependencies.catalogApps.find(a => a.appId === id || a.name === id);
      if (!app) return { success: false, error: 'AppNotFound' };
      if (app.runtimeType === 'Library') return { success: false, error: 'CannotLaunchLibrary' };
      // Fire-and-forget launch (async)
      launchApplication(dependencies, { app, type: app.runtimeType });
      return { success: true, data: app.name };
    },
    listWindows: () => {
      if (!dependencies.permissions.has(process.processAppId, Permissions.SHELL_WINDOWS)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return {
        success: true,
        data: dependencies.windowManager.getOpenWindowSummaries().map(w => ({
          windowId: w.windowId,
          processAppId: w.processAppId,
          title: w.title,
          state: w.state,
        })),
      };
    },
    sysinfo: () => {
      if (!dependencies.permissions.has(process.processAppId, Permissions.SHELL_SYSINFO)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const allProcs = dependencies.processManager.getAllProcesses();
      const running = allProcs.filter(p => p.status === 'running').length;
      const windows = dependencies.windowManager.getOpenWindowSummaries().length;
      const libs = dependencies.environmentManager.getLibraryIds();
      const cmds = dependencies.environmentManager.getAllCommands();
      const uptimeMs = Date.now() - dependencies.bootStartTime;
      const uptimeSec = Math.floor(uptimeMs / 1000);
      const uptimeMin = Math.floor(uptimeSec / 60);
      const uptimeH = Math.floor(uptimeMin / 60);
      return {
        success: true,
        data: {
          uptime: uptimeH > 0
            ? `${uptimeH}h ${uptimeMin % 60}m ${uptimeSec % 60}s`
            : uptimeMin > 0
              ? `${uptimeMin}m ${uptimeSec % 60}s`
              : `${uptimeSec}s`,
          processes: { total: allProcs.length, running },
          windows,
          libraries: libs.length,
          commands: cmds.length,
          apps: dependencies.catalogApps.length,
        },
      };
    },
    listCommands: () => {
      const cmds = dependencies.environmentManager.getAllCommands();
      return {
        success: true,
        data: cmds.map(c => ({
          name: c.name,
          description: c.description,
          usage: c.usage,
          libraryId: c.libraryId,
        })),
      };
    },
    resolveCommand: (name: unknown) => {
      const cmd = dependencies.environmentManager.getCommand(String(name));
      if (!cmd) return { success: false, error: 'CommandNotFound' };
      return {
        success: true,
        data: {
          name: cmd.name,
          description: cmd.description,
          usage: cmd.usage,
          libraryId: cmd.libraryId,
        },
      };
    },
  }), 'console');

  // ── Notification API: global notification for all app types ──
  dependencies.runtime.registerApi('notificationApi', ({ process }) => ({
    notify: (title: unknown, body?: unknown, type?: unknown, duration?: unknown) => {
      if (!dependencies.permissions.has(process.processAppId, Permissions.NOTIFICATION_SEND)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const appDef = dependencies.appManager.get(
        dependencies.processManager.getByProcessAppId(process.processAppId)?.appDefId ?? ''
      );
      const id = dependencies.notificationManager.notify({
        title: String(title),
        body: body != null ? String(body) : undefined,
        type: (['info', 'success', 'warning', 'error'].includes(String(type)) ? String(type) : 'info') as any,
        duration: typeof duration === 'number' ? duration : undefined,
        source: appDef?.name,
      });
      return { success: true, data: id };
    },
    dismiss: (id: unknown) => {
      dependencies.notificationManager.dismiss(String(id));
      return { success: true };
    },
  }), 'all');

  // ── Monitor API: system monitoring for task manager ──
  dependencies.runtime.registerApi('monitorApi', ({ process }) => ({
    snapshot: () => {
      if (!dependencies.permissions.has(process.processAppId, Permissions.MONITOR_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const activeCount = dependencies.processManager.getAllProcesses().length;
      return { success: true, data: dependencies.systemMonitor.getSnapshot(activeCount) };
    },
    eventStats: () => {
      if (!dependencies.permissions.has(process.processAppId, Permissions.MONITOR_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return { success: true, data: dependencies.systemMonitor.getEventStats() };
    },
    apiStats: () => {
      if (!dependencies.permissions.has(process.processAppId, Permissions.MONITOR_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return { success: true, data: dependencies.systemMonitor.getApiStats() };
    },
    permissionStats: () => {
      if (!dependencies.permissions.has(process.processAppId, Permissions.MONITOR_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return { success: true, data: dependencies.systemMonitor.getPermissionStats() };
    },
    recentEvents: (limit?: unknown) => {
      if (!dependencies.permissions.has(process.processAppId, Permissions.MONITOR_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const n = typeof limit === 'number' ? limit : 50;
      return { success: true, data: dependencies.systemMonitor.getRecentEvents(n) };
    },
    recentApiCalls: (limit?: unknown) => {
      if (!dependencies.permissions.has(process.processAppId, Permissions.MONITOR_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const n = typeof limit === 'number' ? limit : 50;
      return { success: true, data: dependencies.systemMonitor.getRecentApiCalls(n) };
    },
    processHistory: () => {
      if (!dependencies.permissions.has(process.processAppId, Permissions.MONITOR_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return { success: true, data: dependencies.systemMonitor.getProcessHistory() };
    },
  }), 'all');

  desktopShell.onTaskbarWindowClick((windowId, processAppId) => {
    dependencies.windowManager.focusWindow(processAppId, windowId);
  });

  desktopShell.onLaunchRequest((app) => {
    launchApplication(dependencies, { app, type: app.runtimeType });
  });

  // 啟動順序：Library → Service(autoStart) → Window/Console(autoStart)
  const libraries = catalogApps.filter(a => a.runtimeType === 'Library');
  const autoStartApps = catalogApps.filter(a => a.runtimeType !== 'Library' && a.autoStart);

  for (const lib of libraries) {
    await launchApplication(dependencies, { app: lib, type: 'Library' });
  }
  for (const app of autoStartApps) {
    await launchApplication(dependencies, { app, type: app.runtimeType });
  }

  bios.destroyBootTerminal();
}

async function initializeCore(): Promise<BootDependencies> {
  await initializeQuickJS();
  bufferedLog('BOOT', 'INFO', 'QuickJS WASM runtime loaded');

  const permissions = new PermissionsManager();
  const initResult = permissions.init();
  if (!initResult.success || typeof initResult.data !== 'string') {
    throw new Error('PermissionsManager initialization failed');
  }
  bufferedLog('BOOT', 'INFO', 'PermissionsManager initialized');

  const systemAppId = initResult.data;
  const eventBus = new EventBus(permissions);
  const appManager = new ApplicationManager();
  const processManager = new ProcessManager(systemAppId, permissions, appManager, eventBus);
  const runtime = new ScriptRuntime(systemAppId, processManager, eventBus, permissions);
  const fileSystem = new WebFileSystemAdapter(permissions);
  const environmentManager = new EnvironmentManager();
  const notificationManager = new NotificationManager();
  const desktopShell = new DesktopShell();
  const host = getAppDiv() ?? document.body;
  const windowManager = new WindowManager(host, () => {});

  const bootStartTime = Date.now();
  const systemMonitor = new SystemMonitor(bootStartTime);

  // Wire monitor into core modules
  eventBus.setMonitor(systemMonitor);
  runtime.setMonitor(systemMonitor);
  permissions.setMonitor(systemMonitor);

  bufferedLog('BOOT', 'INFO', 'All core services initialized');

  return {
    bios,
    systemAppId,
    permissions,
    eventBus,
    appManager,
    processManager,
    runtime,
    fileSystem,
    desktopShell,
    windowManager,
    environmentManager,
    notificationManager,
    systemMonitor,
    catalogApps: [],
    bootStartTime,
  };
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

function focusExistingInstance(dependencies: BootDependencies, appDefId: string): void {
  const processes = dependencies.processManager.getByApp(appDefId);
  for (const proc of processes) {
    const windowIds = dependencies.windowManager.getWindowsByProcess(proc.processAppId);
    if (windowIds.length > 0) {
      dependencies.windowManager.focusWindow(proc.processAppId, windowIds[0]);
      return;
    }
  }
}

async function launchApplication(dependencies: BootDependencies, context: LaunchContext): Promise<void> {
  const { app, type } = context;
  if (!app.appId) {
    return;
  }

  const launch = dependencies.processManager.launch(dependencies.systemAppId, app.appId, { type });
  if (!launch.success || typeof launch.data !== 'number') {
    if (launch.error === 'MaxInstancesReached') {
      focusExistingInstance(dependencies, app.appId);
    } else {
      dependencies.bios.log('PROC', 'ERROR', `Failed to launch ${app.name}: ${launch.error ?? 'UnknownError'}`);
    }
    return;
  }

  const pid = launch.data;
  const proc = dependencies.processManager.get(pid);
  if (!proc) {
    dependencies.bios.log('PROC', 'ERROR', `Process not found after launch: PID ${pid}`);
    return;
  }

  dependencies.systemMonitor.recordProcessLaunch(proc.pid, proc.appDefId, proc.processAppId, proc.type);

  let source: Response;
  try {
    source = await fetch(app.mainPath);
  } catch (err) {
    dependencies.bios.log('PROC', 'ERROR', `Failed to fetch main script: ${app.mainPath}`);
    terminateApplication(dependencies, proc.processAppId, `Fetch error: ${app.mainPath}`);
    return;
  }

  if (!source.ok) {
    dependencies.bios.log('PROC', 'ERROR', `HTTP ${source.status} fetching ${app.mainPath}`);
    terminateApplication(dependencies, proc.processAppId, `HTTP ${source.status}: ${app.mainPath}`);
    return;
  }

  const code = await source.text();

  // Library type: cache source code, execute init, then clean up process
  if (type === 'Library') {
    const libraryId = app.packageName + '/' + app.name;
    dependencies.environmentManager.registerLibrary(libraryId, code);
    bufferedLog('BOOT', 'INFO', `Library registered: ${libraryId}`);

    const initResult = dependencies.runtime.execute(pid, code);
    if (!initResult.success) {
      bufferedLog('BOOT', 'WARN', `Library init failed: ${libraryId} — ${String(initResult.data ?? initResult.error)}`);
    }

    // Library process served its purpose — release runtime resources
    dependencies.runtime.destroyProcessRuntime(pid);
    dependencies.processManager.terminate(dependencies.systemAppId, pid);
    dependencies.eventBus.emit(dependencies.systemAppId, Events.PROCESS_STARTED, {
      pid: proc.pid,
      appDefId: proc.appDefId,
      type: proc.type,
    });
    return;
  }

  // Console type: auto-create console window before running code
  if (type === 'Console') {
    const controller = dependencies.windowManager.createConsoleWindow(
      {
        processAppId: proc.processAppId,
        appDefId: app.appId!,
        appName: app.name,
        icon: app.icon,
      },
      app.name,
      (line: string) => {
        try {
          dependencies.runtime.dispatchConsoleInput(proc.processAppId, line);
        } catch {
          // Runtime destroyed — ignore
        }
      }
    );
    consoleControllers.set(proc.processAppId, controller);
  }

  const executed = dependencies.runtime.execute(pid, code);
  if (!executed.success) {
    const errorDetail = String(executed.data ?? executed.error);
    terminateApplication(dependencies, proc.processAppId, `Runtime error: ${errorDetail}`);
    return;
  }

  // Emit lifecycle event
  dependencies.eventBus.emit(dependencies.systemAppId, Events.PROCESS_STARTED, {
    pid: proc.pid,
    appDefId: proc.appDefId,
    type: proc.type,
  });
}

function onWindowUiEvent(dependencies: BootDependencies, event: WindowUiEvent): void {
  let result: ReturnType<typeof dependencies.runtime.dispatchUiEvent>;
  try {
    result = dependencies.runtime.dispatchUiEvent(event.processAppId, {
      eventId: event.eventId,
      windowId: event.windowId,
      processAppId: event.processAppId,
      type: event.type,
      controlId: event.controlId,
    });
  } catch {
    // Runtime was destroyed (e.g. process terminated) — expected, ignore
    return;
  }
  if (!result.success && result.error === 'RuntimeError') {
    const errorDetail = String(result.data ?? 'Unknown runtime error');
    terminateApplication(dependencies, event.processAppId, `UI event handler crashed: ${errorDetail}`);
  }
}

export { bootstrapSystem };
