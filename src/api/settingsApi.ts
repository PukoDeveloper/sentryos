import type { Kernel } from '../kernel/Kernel';
import type { ThemeSettings } from '../ui/DesktopShell';
import { Permissions } from '../kernel/constants';

const SETTINGS_KEY = 'system-theme';
const SETTINGS_TIER = 'sys' as const;

export function registerSettingsApi(kernel: Kernel): void {
  const runtime = kernel.resolve('runtime');
  const permissions = kernel.resolve('permissions');
  const desktopShell = kernel.resolve('desktopShell');
  const fileSystem = kernel.resolve('fileSystem');
  const processManager = kernel.resolve('processManager');
  const windowManager = kernel.resolve('windowManager');
  const environmentManager = kernel.resolve('environmentManager');
  const systemAppId = kernel.get('systemAppId');
  const catalogApps = kernel.get('catalogApps');
  const bootStartTime = kernel.get('bootStartTime');

  runtime.registerApi('settingsApi', ({ process }) => ({
    getTheme: () => {
      if (!permissions.has(process.processAppId, Permissions.SETTINGS_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return { success: true, data: desktopShell.getTheme() };
    },
    applyTheme: (theme: Record<string, unknown>) => {
      if (!permissions.has(process.processAppId, Permissions.SETTINGS_WRITE)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const safe: ThemeSettings = {};
      if (typeof theme.wallpaper === 'string') safe.wallpaper = theme.wallpaper;
      if (typeof theme.tint === 'string') safe.tint = theme.tint;
      if (typeof theme.accentPrimary === 'string') safe.accentPrimary = theme.accentPrimary;
      if (typeof theme.accentSecondary === 'string') safe.accentSecondary = theme.accentSecondary;
      if (typeof theme.taskbarOpacity === 'number') safe.taskbarOpacity = theme.taskbarOpacity;
      desktopShell.applyTheme(safe);
      return { success: true, data: null };
    },
    saveTheme: (theme: Record<string, unknown>) => {
      if (!permissions.has(process.processAppId, Permissions.SETTINGS_WRITE)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const safe: ThemeSettings = {};
      if (typeof theme.wallpaper === 'string') safe.wallpaper = theme.wallpaper;
      if (typeof theme.tint === 'string') safe.tint = theme.tint;
      if (typeof theme.accentPrimary === 'string') safe.accentPrimary = theme.accentPrimary;
      if (typeof theme.accentSecondary === 'string') safe.accentSecondary = theme.accentSecondary;
      if (typeof theme.taskbarOpacity === 'number') safe.taskbarOpacity = theme.taskbarOpacity;
      desktopShell.applyTheme(safe);
      return fileSystem.write(systemAppId, SETTINGS_TIER, SETTINGS_KEY, safe);
    },
    loadSavedTheme: () => {
      if (!permissions.has(process.processAppId, Permissions.SETTINGS_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const result = fileSystem.read(systemAppId, SETTINGS_TIER, SETTINGS_KEY);
      if (result.success && result.data) {
        return { success: true, data: result.data.data };
      }
      return { success: true, data: null };
    },
    sysinfo: () => {
      if (!permissions.has(process.processAppId, Permissions.SETTINGS_READ)) {
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
  }));

  // Load saved theme on boot
  const saved = fileSystem.read(systemAppId, SETTINGS_TIER, SETTINGS_KEY);
  if (saved.success && saved.data && typeof saved.data.data === 'object') {
    desktopShell.applyTheme(saved.data.data as ThemeSettings);
  }
}
