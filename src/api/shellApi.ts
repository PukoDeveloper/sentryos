import type { Kernel } from '../kernel/Kernel';
import { Permissions, BUILTIN_KERNEL_CONSOLE } from '../kernel/constants';

export function registerShellApi(kernel: Kernel): void {
  const runtime = kernel.resolve('runtime');
  const permissions = kernel.resolve('permissions');
  const processManager = kernel.resolve('processManager');
  const windowManager = kernel.resolve('windowManager');
  const environmentManager = kernel.resolve('environmentManager');
  const appManager = kernel.resolve('appManager');
  const launcher = kernel.resolve('applicationLauncher');
  const catalogApps = kernel.get('catalogApps');
  const bootStartTime = kernel.get('bootStartTime');

  runtime.registerApi('shellApi', ({ pid, process }) => ({
    listProcesses: () => {
      if (!permissions.has(process.processAppId, Permissions.PROCESS_LIST)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const all = processManager.getAllProcesses();
      return {
        success: true,
        data: all.map(p => {
          const appDef = appManager.get(p.appDefId);
          return {
            pid: p.pid,
            appDefId: p.appDefId,
            appName: appDef?.name ?? p.appDefId,
            processAppId: p.processAppId,
            type: p.type,
            status: p.status,
            parentPid: p.parentPid,
          };
        }),
      };
    },
    killProcess: (targetPid: unknown) => {
      if (!permissions.has(process.processAppId, Permissions.PROCESS_TERMINATE)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const tPid = Number(targetPid);
      if (!Number.isFinite(tPid)) return { success: false, error: 'InvalidPid' };
      const target = processManager.get(tPid);
      if (!target) return { success: false, error: 'NotFound' };
      const reason = target.pid === pid ? 'Self-terminated via shell' : `Killed by PID ${pid} via shell`;
      setTimeout(() => launcher.terminateApplication(target.processAppId, reason), 0);
      return { success: true, data: tPid };
    },
    listApps: () => {
      if (!permissions.has(process.processAppId, Permissions.SHELL_LIST_APPS)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return {
        success: true,
        data: catalogApps.map(a => ({
          appId: a.appId,
          name: a.name,
          version: a.version,
          type: a.runtimeType,
          package: a.packageName,
          autoStart: a.autoStart,
        })),
      };
    },
    launch: (appDefId: unknown, fileArgs?: unknown) => {
      if (!permissions.has(process.processAppId, Permissions.SHELL_LAUNCH)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const id = String(appDefId);
      const app = catalogApps.find(a => a.appId === id || a.name === id);
      if (!app) return { success: false, error: 'AppNotFound' };
      if (app.runtimeType === 'Library') return { success: false, error: 'CannotLaunchLibrary' };
      // Fire-and-forget launch (async)
      const fArgs = (fileArgs && typeof fileArgs === 'object' && !Array.isArray(fileArgs))
        ? fileArgs as Record<string, unknown>
        : undefined;
      if (app.appId === BUILTIN_KERNEL_CONSOLE) {
        launcher.launchKernelConsole(BUILTIN_KERNEL_CONSOLE, app.name, app.icon);
      } else {
        launcher.launchApplication({ app, type: app.runtimeType, fileArgs: fArgs });
      }
      return { success: true, data: app.name };
    },
    listWindows: () => {
      if (!permissions.has(process.processAppId, Permissions.SHELL_WINDOWS)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return {
        success: true,
        data: windowManager.getOpenWindowSummaries().map(w => ({
          windowId: w.windowId,
          processAppId: w.processAppId,
          title: w.title,
          state: w.state,
        })),
      };
    },
    sysinfo: () => {
      if (!permissions.has(process.processAppId, Permissions.SHELL_SYSINFO)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const allProcs = processManager.getAllProcesses();
      const running = allProcs.filter(p => p.status === 'running').length;
      const windows = windowManager.getOpenWindowSummaries().length;
      const libs = environmentManager.getLibraryIds();
      const cmds = environmentManager.getAllCommands();
      const uptimeMs = Date.now() - bootStartTime;
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
          apps: catalogApps.length,
        },
      };
    },
    listCommands: () => {
      const cmds = environmentManager.getAllCommands();
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
      const cmd = environmentManager.getCommand(String(name));
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
  }), ['shell']);
}
