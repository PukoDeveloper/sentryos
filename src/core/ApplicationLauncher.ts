import type { PermissionsManager } from './PermissionsManager';
import type { EventBus } from './EventBus';
import type { ApplicationManager, ProcessManager } from './App';
import type { ScriptRuntime } from './ScriptRuntime';
import type { WindowManager, ConsoleWindowController, WindowUiEvent } from './WindowSystem';
import type { EnvironmentManager } from './EnvironmentManager';
import type { SystemMonitor } from './SystemMonitor';
import type { RegisteredApplication } from './ApplicationCatalog';
import type { bios as BiosType } from '../bootstrap/bios';
import { Events, type AppType } from './constants';

export interface LaunchContext {
  app: RegisteredApplication;
  type: AppType;
}

export interface ApplicationLauncherDeps {
  bios: typeof BiosType;
  systemAppId: string;
  permissions: PermissionsManager;
  eventBus: EventBus;
  appManager: ApplicationManager;
  processManager: ProcessManager;
  runtime: ScriptRuntime;
  windowManager: WindowManager;
  environmentManager: EnvironmentManager;
  systemMonitor: SystemMonitor;
}

export class ApplicationLauncher {
  private readonly deps: ApplicationLauncherDeps;
  private readonly consoleControllers = new Map<string, ConsoleWindowController>();

  constructor(deps: ApplicationLauncherDeps) {
    this.deps = deps;
  }

  getConsoleControllers(): Map<string, ConsoleWindowController> {
    return this.consoleControllers;
  }

  terminateApplication(processAppId: string, reason: string): void {
    const proc = this.deps.processManager.getByProcessAppId(processAppId);
    if (!proc) return;

    const appDef = this.deps.appManager.get(proc.appDefId);
    const appName = appDef?.name ?? proc.appDefId;

    this.deps.bios.log('PROC', 'INFO', `Terminating ${appName} (PID ${proc.pid}): ${reason}`);
    this.deps.systemMonitor.recordProcessTerminate(proc.pid, proc.appDefId);

    // Clean up console controller if present
    this.consoleControllers.delete(processAppId);

    // Close all windows owned by this process
    const windowIds = this.deps.windowManager.getWindowsByProcess(processAppId);
    for (const wid of windowIds) {
      try { this.deps.windowManager.closeWindow(processAppId, wid); } catch { /* window may already be gone */ }
    }

    // Destroy QuickJS runtime
    this.deps.runtime.destroyProcessRuntime(proc.pid);

    // Terminate process tree
    this.deps.processManager.terminate(this.deps.systemAppId, proc.pid);

    // Emit lifecycle event
    this.deps.eventBus.emit(this.deps.systemAppId, Events.PROCESS_STOPPED, {
      pid: proc.pid,
      appDefId: proc.appDefId,
      type: proc.type,
    });
  }

  focusExistingInstance(appDefId: string): void {
    const processes = this.deps.processManager.getByApp(appDefId);
    for (const proc of processes) {
      const windowIds = this.deps.windowManager.getWindowsByProcess(proc.processAppId);
      if (windowIds.length > 0) {
        this.deps.windowManager.focusWindow(proc.processAppId, windowIds[0]);
        return;
      }
    }
  }

  async launchApplication(context: LaunchContext): Promise<void> {
    const { app, type } = context;
    if (!app.appId) {
      return;
    }

    const launch = this.deps.processManager.launch(this.deps.systemAppId, app.appId, { type });
    if (!launch.success || typeof launch.data !== 'number') {
      if (launch.error === 'MaxInstancesReached') {
        this.focusExistingInstance(app.appId);
      } else {
        this.deps.bios.log('PROC', 'ERROR', `Failed to launch ${app.name}: ${launch.error ?? 'UnknownError'}`);
      }
      return;
    }

    const pid = launch.data;
    const proc = this.deps.processManager.get(pid);
    if (!proc) {
      this.deps.bios.log('PROC', 'ERROR', `Process not found after launch: PID ${pid}`);
      return;
    }

    this.deps.systemMonitor.recordProcessLaunch(proc.pid, proc.appDefId, proc.processAppId, proc.type);

    let source: Response;
    try {
      source = await fetch(app.mainPath);
    } catch (err) {
      this.deps.bios.log('PROC', 'ERROR', `Failed to fetch main script: ${app.mainPath}`);
      this.terminateApplication(proc.processAppId, `Fetch error: ${app.mainPath}`);
      return;
    }

    if (!source.ok) {
      this.deps.bios.log('PROC', 'ERROR', `HTTP ${source.status} fetching ${app.mainPath}`);
      this.terminateApplication(proc.processAppId, `HTTP ${source.status}: ${app.mainPath}`);
      return;
    }

    const code = await source.text();

    // Library type: cache source code, execute init, then clean up process
    if (type === 'Library') {
      const libraryId = app.packageName + '/' + app.name;
      this.deps.environmentManager.registerLibrary(libraryId, code);
      this.deps.bios.log('BOOT', 'INFO', `Library registered: ${libraryId}`);

      const initResult = this.deps.runtime.execute(pid, code);
      if (!initResult.success) {
        this.deps.bios.log('BOOT', 'WARN', `Library init failed: ${libraryId} — ${String(initResult.data ?? initResult.error)}`);
      }

      // Library process served its purpose — release runtime resources
      this.deps.runtime.destroyProcessRuntime(pid);
      this.deps.processManager.terminate(this.deps.systemAppId, pid);
      this.deps.eventBus.emit(this.deps.systemAppId, Events.PROCESS_STARTED, {
        pid: proc.pid,
        appDefId: proc.appDefId,
        type: proc.type,
      });
      return;
    }

    // Console type: auto-create console window before running code
    if (type === 'Console') {
      const controller = this.deps.windowManager.createConsoleWindow(
        {
          processAppId: proc.processAppId,
          appDefId: app.appId!,
          appName: app.name,
          icon: app.icon,
        },
        app.name,
        (line: string) => {
          try {
            this.deps.runtime.dispatchConsoleInput(proc.processAppId, line);
          } catch {
            // Runtime destroyed — ignore
          }
        }
      );
      this.consoleControllers.set(proc.processAppId, controller);
    }

    const executed = this.deps.runtime.execute(pid, code);
    if (!executed.success) {
      const errorDetail = String(executed.data ?? executed.error);
      this.terminateApplication(proc.processAppId, `Runtime error: ${errorDetail}`);
      return;
    }

    // Emit lifecycle event
    this.deps.eventBus.emit(this.deps.systemAppId, Events.PROCESS_STARTED, {
      pid: proc.pid,
      appDefId: proc.appDefId,
      type: proc.type,
    });
  }

  onWindowUiEvent(event: WindowUiEvent): void {
    let result: ReturnType<typeof this.deps.runtime.dispatchUiEvent>;
    try {
      result = this.deps.runtime.dispatchUiEvent(event.processAppId, {
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
      this.terminateApplication(event.processAppId, `UI event handler crashed: ${errorDetail}`);
    }
  }
}
