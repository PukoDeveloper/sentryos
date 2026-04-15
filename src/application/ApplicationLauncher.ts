import type { Kernel } from '../kernel/Kernel';
import type { RegisteredApplication } from './ApplicationCatalog';
import type { ConsoleWindowController, WindowUiEvent } from '../window/types';
import type { RuntimeResult } from '../runtime/types';
import { bios } from '../ui/Bios';
import { Events, type AppType } from '../kernel/constants';
import { DEFAULT_ENGINE } from '../runtime/RuntimeRegistry';

export interface LaunchContext {
  app: RegisteredApplication;
  type: AppType;
  /** 發起啟動請求的權限實體。省略時使用 userAppId（使用者發起）。 */
  callerAppId?: string;
  /** 啟動時傳入的檔案資訊，若存在則在腳本執行後以 onFileOpen 回呼傳遞。 */
  fileArgs?: Record<string, unknown>;
}

export class ApplicationLauncher {
  private readonly kernel: Kernel;
  private readonly consoleControllers = new Map<string, ConsoleWindowController>();

  constructor(kernel: Kernel) {
    this.kernel = kernel;
  }

  private get systemAppId() { return this.kernel.get('systemAppId'); }
  private get userAppId() { return this.kernel.get('userAppId'); }
  private get eventBus() { return this.kernel.resolve('eventBus'); }
  private get appManager() { return this.kernel.resolve('appManager'); }
  private get processManager() { return this.kernel.resolve('processManager'); }
  private get runtimeRegistry() { return this.kernel.resolve('runtimeRegistry'); }
  private get windowManager() { return this.kernel.resolve('windowManager'); }
  private get environmentManager() { return this.kernel.resolve('environmentManager'); }
  private get systemMonitor() { return this.kernel.resolve('systemMonitor'); }
  private get systemAlert() { return this.kernel.resolve('systemAlert'); }
  private get kernelConsole() { return this.kernel.resolve('kernelConsole'); }

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

    // Clean up kernel console session
    this.kernelConsole.closeSessionByProcess(processAppId);

    // Close all windows owned by this process
    const windowIds = this.windowManager.getWindowsByProcess(processAppId);
    for (const wid of windowIds) {
      try { this.windowManager.closeWindow(processAppId, wid); } catch { /* window may already be gone */ }
    }

    // Destroy the process's runtime and remove tracking
    this.runtimeRegistry.getForPid(proc.pid).destroyProcessRuntime(proc.pid);
    this.runtimeRegistry.unbindProcess(proc.pid, processAppId);

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

  /** 向已執行中的 app 派發 onFileOpen 回呼 */
  private dispatchFileOpenToApp(appDefId: string, fileArgs: Record<string, unknown>): void {
    const processes = this.processManager.getByApp(appDefId);
    for (const proc of processes) {
      if (proc.status === 'running') {
        this.runtimeRegistry.getForPid(proc.pid).dispatchFileOpen(proc.processAppId, fileArgs);
        return;
      }
    }
  }

  async launchApplication(context: LaunchContext): Promise<void> {
    const { app, type, callerAppId, fileArgs } = context;
    const caller = callerAppId ?? this.userAppId;
    if (!app.appId) {
      return;
    }

    const launch = this.processManager.launch(caller, app.appId, { type });
    if (!launch.success || typeof launch.data !== 'number') {
      if (launch.error === 'MaxInstancesReached') {
        this.focusExistingInstance(app.appId);
        // Dispatch file-open to existing instance if fileArgs provided
        if (fileArgs) {
          this.dispatchFileOpenToApp(app.appId, fileArgs);
        }
      } else if (launch.error === 'PermissionDenied') {
        bios.log('PROC', 'ERROR', `Failed to launch ${app.name}: ${launch.error}`);
        this.systemAlert.show({ code: 'PERMISSION_DENIED', detail: `無法啟動「${app.name}」` });
      } else {
        bios.log('PROC', 'ERROR', `Failed to launch ${app.name}: ${launch.error ?? 'UnknownError'}`);
        this.systemAlert.show({ code: 'APP_LAUNCH_FAILED', detail: `${app.name}: ${launch.error ?? 'UnknownError'}` });
      }
      return;
    }

    const pid = launch.data;
    const proc = this.processManager.get(pid);
    if (!proc) {
      bios.log('PROC', 'ERROR', `Process not found after launch: PID ${pid}`);
      return;
    }

    // Resolve the runtime engine for this application
    const engine = app.engine ?? DEFAULT_ENGINE;
    const runtime = this.runtimeRegistry.get(engine) ?? this.runtimeRegistry.getDefault();
    this.runtimeRegistry.bindProcess(pid, proc.processAppId, engine);

    this.systemMonitor.recordProcessLaunch(proc.pid, proc.appDefId, proc.processAppId, proc.type);

    let source: Response;
    try {
      source = await fetch(app.mainPath);
    } catch (err) {
      bios.log('PROC', 'ERROR', `Failed to fetch main script: ${app.mainPath}`);
      this.systemAlert.show({ code: 'APP_FETCH_FAILED', detail: app.name });
      this.terminateApplication(proc.processAppId, `Fetch error: ${app.mainPath}`);
      return;
    }

    if (!source.ok) {
      bios.log('PROC', 'ERROR', `HTTP ${source.status} fetching ${app.mainPath}`);
      this.systemAlert.show({ code: 'APP_FETCH_FAILED', detail: `${app.name} (HTTP ${source.status})` });
      this.terminateApplication(proc.processAppId, `HTTP ${source.status}: ${app.mainPath}`);
      return;
    }

    const code = await source.text();

    // Library type: cache source code, execute init, then clean up process
    if (type === 'Library') {
      const libraryId = app.packageName + '/' + app.name;
      this.environmentManager.registerLibrary(libraryId, code);
      bios.log('BOOT', 'INFO', `Library registered: ${libraryId}`);

      const initResult = runtime.execute(pid, code);
      if (!initResult.success) {
        bios.log('BOOT', 'WARN', `Library init failed: ${libraryId} — ${String(initResult.data ?? initResult.error)}`);
      }

      // Library process served its purpose — release runtime resources
      runtime.destroyProcessRuntime(pid);
      this.runtimeRegistry.unbindProcess(pid, proc.processAppId);
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
            this.runtimeRegistry.getForPid(pid).dispatchConsoleInput(proc.processAppId, line);
          } catch {
            // Runtime destroyed — ignore
          }
        }
      );
      this.consoleControllers.set(proc.processAppId, controller);
    }

    const executed = runtime.execute(pid, code, undefined, app.entryPath);
    if (!executed.success) {
      const errorDetail = this.formatError(executed.data ?? executed.error);
      this.terminateApplication(proc.processAppId, `Runtime error: ${errorDetail}`);
      return;
    }

    // Dispatch file-open callback if launched with file arguments
    if (fileArgs) {
      runtime.dispatchFileOpen(proc.processAppId, fileArgs);
    }

    // Emit lifecycle event
    this.eventBus.emit(this.systemAppId, Events.PROCESS_STARTED, {
      pid: proc.pid,
      appDefId: proc.appDefId,
      type: proc.type,
    });
  }

  onWindowUiEvent(event: WindowUiEvent): void {
    let result: RuntimeResult<unknown>;
    try {
      const payload: Record<string, unknown> = {
        eventId: event.eventId,
        windowId: event.windowId,
        processAppId: event.processAppId,
        type: event.type,
        controlId: event.controlId,
        value: event.value,
      };
      if (event.x !== undefined) payload.x = event.x;
      if (event.y !== undefined) payload.y = event.y;
      result = this.runtimeRegistry.getForProcessAppId(event.processAppId).dispatchUiEvent(event.processAppId, payload);
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

  // ── Kernel Console (native terminal) ────────────────────

  /**
   * 啟動內核原生終端機。
   * 不經過 QuickJS，命令直接在內核層以 userAppId 權限執行。
   */
  async launchKernelConsole(appDefId: string, appName: string, icon?: string): Promise<void> {
    const caller = this.userAppId;

    const launch = this.processManager.launch(caller, appDefId, { type: 'Console' });
    if (!launch.success || typeof launch.data !== 'number') {
      if (launch.error === 'MaxInstancesReached') {
        this.focusExistingInstance(appDefId);
      } else if (launch.error === 'PermissionDenied') {
        this.systemAlert.show({ code: 'PERMISSION_DENIED', detail: `無法啟動「${appName}」` });
      } else {
        this.systemAlert.show({ code: 'APP_LAUNCH_FAILED', detail: `${appName}: ${launch.error ?? 'UnknownError'}` });
      }
      return;
    }

    const pid = launch.data;
    const proc = this.processManager.get(pid);
    if (!proc) return;

    this.systemMonitor.recordProcessLaunch(proc.pid, proc.appDefId, proc.processAppId, proc.type);

    let sessionId: string;
    const controller = this.windowManager.createConsoleWindow(
      {
        processAppId: proc.processAppId,
        appDefId,
        appName,
        icon,
      },
      appName,
      (line: string) => {
        this.kernelConsole.handleInput(sessionId, line);
      }
    );
    this.consoleControllers.set(proc.processAppId, controller);

    sessionId = this.kernelConsole.openSession(proc.processAppId, pid, controller);

    this.eventBus.emit(this.systemAppId, Events.PROCESS_STARTED, {
      pid: proc.pid,
      appDefId: proc.appDefId,
      type: proc.type,
    });
  }
}
