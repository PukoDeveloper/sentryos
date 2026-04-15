import type { Kernel } from '../kernel/Kernel';
import type { ThemeSettings, TaskbarMode } from '../ui/DesktopShell';
import { Permissions } from '../kernel/constants';

const VALID_TASKBAR_MODES = ['docked', 'fullwidth', 'floating-compact'] as const;

const SETTINGS_KEY = 'system-theme';
const NOTIFICATION_SETTINGS_KEY = 'notification-settings';
const SETTINGS_TIER = 'sys' as const;

export function registerSettingsApi(kernel: Kernel): void {
  const runtime = kernel.resolve('runtime');
  const permissions = kernel.resolve('permissions');
  const desktopShell = kernel.resolve('desktopShell');
  const fileSystem = kernel.resolve('fileSystem');
  const processManager = kernel.resolve('processManager');
  const windowManager = kernel.resolve('windowManager');
  const environmentManager = kernel.resolve('environmentManager');
  const notificationManager = kernel.resolve('notificationManager');
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
      if (typeof theme.taskbarMode === 'string' && (VALID_TASKBAR_MODES as readonly string[]).includes(theme.taskbarMode)) safe.taskbarMode = theme.taskbarMode as TaskbarMode;
      if (typeof theme.startMenuWidth === 'number') safe.startMenuWidth = theme.startMenuWidth;
      if (typeof theme.startMenuHeight === 'number') safe.startMenuHeight = theme.startMenuHeight;
      if (typeof theme.startMenuGroupByPackage === 'boolean') safe.startMenuGroupByPackage = theme.startMenuGroupByPackage;
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
      if (typeof theme.taskbarMode === 'string' && (VALID_TASKBAR_MODES as readonly string[]).includes(theme.taskbarMode)) safe.taskbarMode = theme.taskbarMode as TaskbarMode;
      if (typeof theme.startMenuWidth === 'number') safe.startMenuWidth = theme.startMenuWidth;
      if (typeof theme.startMenuHeight === 'number') safe.startMenuHeight = theme.startMenuHeight;
      if (typeof theme.startMenuGroupByPackage === 'boolean') safe.startMenuGroupByPackage = theme.startMenuGroupByPackage;
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

    // ── Notification Settings ────────────────────────────────
    getNotificationSettings: () => {
      if (!permissions.has(process.processAppId, Permissions.SETTINGS_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return {
        success: true,
        data: {
          doNotDisturb: notificationManager.doNotDisturb,
          defaultDuration: notificationManager.defaultDuration,
          maxVisible: notificationManager.maxVisible,
        },
      };
    },
    setNotificationSettings: (settings: Record<string, unknown>) => {
      if (!permissions.has(process.processAppId, Permissions.SETTINGS_WRITE)) {
        return { success: false, error: 'PermissionDenied' };
      }
      if (typeof settings.doNotDisturb === 'boolean') {
        notificationManager.doNotDisturb = settings.doNotDisturb;
      }
      if (typeof settings.defaultDuration === 'number') {
        notificationManager.defaultDuration = settings.defaultDuration;
      }
      if (typeof settings.maxVisible === 'number') {
        notificationManager.maxVisible = settings.maxVisible;
      }
      // persist
      const current = {
        doNotDisturb: notificationManager.doNotDisturb,
        defaultDuration: notificationManager.defaultDuration,
        maxVisible: notificationManager.maxVisible,
      };
      fileSystem.write(systemAppId, SETTINGS_TIER, NOTIFICATION_SETTINGS_KEY, current, { overwrite: true });
      return { success: true, data: current };
    },

    // ── Application Catalog ──────────────────────────────────
    getApps: () => {
      if (!permissions.has(process.processAppId, Permissions.SETTINGS_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return {
        success: true,
        data: catalogApps.map(app => ({
          appId: app.appId,
          name: app.name,
          packageName: app.packageName,
          version: app.version,
          description: app.description || '',
          author: app.author || '',
          runtimeType: app.runtimeType,
          permissions: app.permissions,
          maxInstances: app.maxInstances ?? 0,
          autoStart: app.autoStart,
        })),
      };
    },
    getAppProcesses: () => {
      if (!permissions.has(process.processAppId, Permissions.SETTINGS_READ)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const allProcs = processManager.getAllProcesses();
      return {
        success: true,
        data: allProcs.map(p => ({
          pid: p.pid,
          appDefId: p.appDefId,
          type: p.type,
          status: p.status,
        })),
      };
    },
  }), ['settings']);

  // Load saved theme on boot
  const saved = fileSystem.read(systemAppId, SETTINGS_TIER, SETTINGS_KEY);
  if (saved.success && saved.data && typeof saved.data.data === 'object') {
    desktopShell.applyTheme(saved.data.data as ThemeSettings);
  }

  // Load saved notification settings on boot
  const notifSaved = fileSystem.read(systemAppId, SETTINGS_TIER, NOTIFICATION_SETTINGS_KEY);
  if (notifSaved.success && notifSaved.data && typeof notifSaved.data.data === 'object') {
    const ns = notifSaved.data.data as Record<string, unknown>;
    if (typeof ns.doNotDisturb === 'boolean') notificationManager.doNotDisturb = ns.doNotDisturb;
    if (typeof ns.defaultDuration === 'number') notificationManager.defaultDuration = ns.defaultDuration;
    if (typeof ns.maxVisible === 'number') notificationManager.maxVisible = ns.maxVisible;
  }
}
