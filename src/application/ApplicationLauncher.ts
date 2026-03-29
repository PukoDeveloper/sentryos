import type { Kernel } from '../kernel/Kernel';
import type { RegisteredApplication } from './ApplicationCatalog';
import type { ConsoleWindowController, WindowUiEvent } from '../window/types';
import { bios } from '../ui/Bios';
import { Events, type AppType } from '../kernel/constants';

export interface LaunchContext {
  app: RegisteredApplication;
  type: AppType;
}

export class ApplicationLauncher {
  private readonly kernel: Kernel;
  private readonly consoleControllers = new Map<string, ConsoleWindowController>();

  constructor(kernel: Kernel) {
    this.kernel = kernel;
  }

  private get systemAppId() { return this.kernel.get('systemAppId'); }
  private get eventBus() { return this.kernel.resolve('eventBus'); }
  private get appManager() { return this.kernel.resolve('appManager'); }
  private get processManager() { return this.kernel.resolve('processManager'); }
  private get runtime() { return this.kernel.resolve('runtime'); }
  private get windowManager() { return this.kernel.resolve('windowManager'); }
  private get environmentManager() { return this.kernel.resolve('environmentManager'); }
  private get systemMonitor() { return this.kernel.resolve('systemMonitor'); }

  getConsoleControllers(): Map<string, ConsoleWindowController> {
    return this.consoleControllers;
  }

  terminateApplication(processAppId: string, reason: string): void {
    const proc = this.processManager.getByProcessAppId(processAppId);
    if (!proc) return;

    const appDef = this.appManager.get(proc.appDefId);
    const appName = appDef?.name ?? proc.appDefId;

    bios.log('PROC', 'INFO', `Terminating ${appName} (PID ${proc.pid}): ${reason}`);
    this.systemMonitor.recordProcessTerminate(proc.pid, proc.appDefId);

    // Clean up console controller if present
    this.consoleControllers.delete(processAppId);

    // Close all windows owned by this process
    const windowIds = this.windowManager.getWindowsByProcess(processAppId);
    for (const wid of windowIds) {
      try { this.windowManager.closeWindow(processAppId, wid); } catch { /* window may already be gone */ }
    }

    // Destroy QuickJS runtime
    this.runtime.destroyProcessRuntime(proc.pid);

    // Terminate process tree
    this.processManager.terminate(this.systemAppId, proc.pid);

    // Emit lifecycle event
    this.eventBus.emit(this.systemAppId, Events.PROCESS_STOPPED, {
      pid: proc.pid,
      appDefId: proc.appDefId,
      type: proc.type,
    });
  }

  focusExistingInstance(appDefId: string): void {
    const processes = this.processManager.getByApp(appDefId);
    for (const proc of processes) {
      const windowIds = this.windowManager.getWindowsByProcess(proc.processAppId);
      if (windowIds.length > 0) {
        this.windowManager.focusWindow(proc.processAppId, windowIds[0]);
        return;
      }
    }
  }

  async launchApplication(context: LaunchContext): Promise<void> {
    const { app, type } = context;
    if (!app.appId) {
      return;
    }

    const launch = this.processManager.launch(this.systemAppId, app.appId, { type });
    if (!launch.success || typeof launch.data !== 'number') {
      if (launch.error === 'MaxInstancesReached') {
        this.focusExistingInstance(app.appId);
      } else {
        bios.log('PROC', 'ERROR', `Failed to launch ${app.name}: ${launch.error ?? 'UnknownError'}`);
      }
      return;
    }

    const pid = launch.data;
    const proc = this.processManager.get(pid);
    if (!proc) {
      bios.log('PROC', 'ERROR', `Process not found after launch: PID ${pid}`);
      return;
    }

    this.systemMonitor.recordProcessLaunch(proc.pid, proc.appDefId, proc.processAppId, proc.type);

    let source: Response;
    try {
      source = await fetch(app.mainPath);
    } catch (err) {
      bios.log('PROC', 'ERROR', `Failed to fetch main script: ${app.mainPath}`);
      this.terminateApplication(proc.processAppId, `Fetch error: ${app.mainPath}`);
      return;
    }

    if (!source.ok) {
      bios.log('PROC', 'ERROR', `HTTP ${source.status} fetching ${app.mainPath}`);
      this.terminateApplication(proc.processAppId, `HTTP ${source.status}: ${app.mainPath}`);
      return;
    }

    const code = await source.text();

    // Library type: cache source code, execute init, then clean up process
    if (type === 'Library') {
      const libraryId = app.packageName + '/' + app.name;
      this.environmentManager.registerLibrary(libraryId, code);
      bios.log('BOOT', 'INFO', `Library registered: ${libraryId}`);

      const initResult = this.runtime.execute(pid, code);
      if (!initResult.success) {
        bios.log('BOOT', 'WARN', `Library init failed: ${libraryId} — ${String(initResult.data ?? initResult.error)}`);
      }

      // Library process served its purpose — release runtime resources
      this.runtime.destroyProcessRuntime(pid);
      this.processManager.terminate(this.systemAppId, pid);
      this.eventBus.emit(this.systemAppId, Events.PROCESS_STARTED, {
        pid: proc.pid,
        appDefId: proc.appDefId,
        type: proc.type,
      });
      return;
    }

    // Console type: auto-create console window before running code
    if (type === 'Console') {
      const controller = this.windowManager.createConsoleWindow(
        {
          processAppId: proc.processAppId,
          appDefId: app.appId!,
          appName: app.name,
          icon: app.icon,
        },
        app.name,
        (line: string) => {
          try {
            this.runtime.dispatchConsoleInput(proc.processAppId, line);
          } catch {
            // Runtime destroyed — ignore
          }
        }
      );
      this.consoleControllers.set(proc.processAppId, controller);
    }

    const executed = this.runtime.execute(pid, code, undefined, app.entryPath);
    if (!executed.success) {
      const errorDetail = this.formatError(executed.data ?? executed.error);
      this.terminateApplication(proc.processAppId, `Runtime error: ${errorDetail}`);
      return;
    }

    // Emit lifecycle event
    this.eventBus.emit(this.systemAppId, Events.PROCESS_STARTED, {
      pid: proc.pid,
      appDefId: proc.appDefId,
      type: proc.type,
    });
  }

  onWindowUiEvent(event: WindowUiEvent): void {
    let result: ReturnType<typeof this.runtime.dispatchUiEvent>;
    try {
      result = this.runtime.dispatchUiEvent(event.processAppId, {
        eventId: event.eventId,
        windowId: event.windowId,
        processAppId: event.processAppId,
        type: event.type,
        controlId: event.controlId,
        value: event.value,
      });
    } catch {
      // Runtime was destroyed (e.g. process terminated) — expected, ignore
      return;
    }
    if (!result.success && result.error === 'RuntimeError') {
      const errorDetail = this.formatError(result.data ?? 'Unknown runtime error');
      this.terminateApplication(event.processAppId, `UI event handler crashed: ${errorDetail}`);
    }
  }

  private formatError(value: unknown): string {
    if (value === null || value === undefined) return 'Unknown error';
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch { return String(value); }
  }
}
