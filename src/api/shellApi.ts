import type { ScriptRuntime } from '../core/ScriptRuntime';
import type { ApiDependencies } from './types';
import { Permissions } from '../core/constants';

export function registerShellApi(runtime: ScriptRuntime, deps: ApiDependencies): void {
  runtime.registerApi('shellApi', ({ pid, process }) => ({
    listProcesses: () => {
      if (!deps.permissions.has(process.processAppId, Permissions.PROCESS_LIST)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const all = deps.processManager.getAllProcesses();
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
      if (!deps.permissions.has(process.processAppId, Permissions.PROCESS_TERMINATE)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const tPid = Number(targetPid);
      if (!Number.isFinite(tPid)) return { success: false, error: 'InvalidPid' };
      const target = deps.processManager.get(tPid);
      if (!target) return { success: false, error: 'NotFound' };
      const reason = target.pid === pid ? 'Self-terminated via shell' : `Killed by PID ${pid} via shell`;
      setTimeout(() => deps.terminateApplication(target.processAppId, reason), 0);
      return { success: true, data: tPid };
    },
    listApps: () => {
      if (!deps.permissions.has(process.processAppId, Permissions.SHELL_LIST_APPS)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return {
        success: true,
        data: deps.catalogApps.map(a => ({
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
      if (!deps.permissions.has(process.processAppId, Permissions.SHELL_LAUNCH)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const id = String(appDefId);
      const app = deps.catalogApps.find(a => a.appId === id || a.name === id);
      if (!app) return { success: false, error: 'AppNotFound' };
      if (app.runtimeType === 'Library') return { success: false, error: 'CannotLaunchLibrary' };
      // Fire-and-forget launch (async)
      deps.launchApplication({ app, type: app.runtimeType });
      return { success: true, data: app.name };
    },
    listWindows: () => {
      if (!deps.permissions.has(process.processAppId, Permissions.SHELL_WINDOWS)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return {
        success: true,
        data: deps.windowManager.getOpenWindowSummaries().map(w => ({
          windowId: w.windowId,
          processAppId: w.processAppId,
          title: w.title,
          state: w.state,
        })),
      };
    },
    sysinfo: () => {
      if (!deps.permissions.has(process.processAppId, Permissions.SHELL_SYSINFO)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const allProcs = deps.processManager.getAllProcesses();
      const running = allProcs.filter(p => p.status === 'running').length;
      const windows = deps.windowManager.getOpenWindowSummaries().length;
      const libs = deps.environmentManager.getLibraryIds();
      const cmds = deps.environmentManager.getAllCommands();
      const uptimeMs = Date.now() - deps.bootStartTime;
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
          apps: deps.catalogApps.length,
        },
      };
    },
    listCommands: () => {
      const cmds = deps.environmentManager.getAllCommands();
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
      const cmd = deps.environmentManager.getCommand(String(name));
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
}
