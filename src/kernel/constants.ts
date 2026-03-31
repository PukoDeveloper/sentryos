// ── Window Defaults ─────────────────────────────────────────
export const DEFAULT_WINDOW_WIDTH = 520;
export const DEFAULT_WINDOW_HEIGHT = 360;
export const WINDOW_CASCADE_X_OFFSET = 48;
export const WINDOW_CASCADE_Y_OFFSET = 42;
export const WINDOW_CASCADE_INCREMENT = 18;
export const MAXIMIZED_WINDOW_MARGIN = 0;   // px (negative to counter window-layer padding)
export const MAXIMIZED_TASKBAR_HEIGHT = 96;   // px (taskbar 82px from viewport - 40px padding)

// ── Z-Index Layers ──────────────────────────────────────────
export const Z_INDEX_WINDOW_BASE = 50;
export const Z_INDEX_ALWAYS_ON_TOP_OFFSET = 500;
export const Z_INDEX_START_PANEL = 9000;
export const Z_INDEX_BOOT_TERMINAL = 9999;
export const Z_INDEX_ERROR_SCREEN = 10000;

// ── Timing ──────────────────────────────────────────────────
export const DEFAULT_EXECUTION_TIMEOUT_MS = 300;
export const CLOCK_UPDATE_INTERVAL_MS = 1000;

// ── Console Defaults ────────────────────────────────────────
export const DEFAULT_CONSOLE_WIDTH = 640;
export const DEFAULT_CONSOLE_HEIGHT = 440;

// ── Notification Defaults ───────────────────────────────────
export const NOTIFICATION_DEFAULT_DURATION_MS = 4000;
export const NOTIFICATION_MAX_VISIBLE = 5;

// ── Storage Capacities ──────────────────────────────────────
export const STORAGE_TOTAL_CAPACITY = 1024;
export const STORAGE_TIER_CAPACITIES = {
  sys: 256,
  app: 384,
  user: 256,
  cache: 128,
} as const;

// ── ID Prefixes ─────────────────────────────────────────────
export const ID_PREFIX_SYSTEM = 'sys_';
export const ID_PREFIX_USER = 'user_';
export const ID_PREFIX_APP_INSTANCE = 'app_';
export const ID_PREFIX_APP_DEF = 'appdef_';

// ── Application Types ───────────────────────────────────────
export type AppType = 'Service' | 'Window' | 'Console' | 'Library';

// ── Permission Strings ──────────────────────────────────────
export const Permissions = {
  // Permission management
  NEW_APP: 'permission.new-app',
  REMOVE_APP: 'permission.remove-app',
  MANAGE_PERMISSIONS: 'permission.manage-permissions',

  // Wildcard
  WILDCARD: '*',

  // Event
  eventSubscribe: (event: string) => `event.subscribe.${event}`,
  eventEmit: (event: string) => `event.emit.${event}`,

  // Process
  processLaunch: (appDefId: string) => `process.launch.${appDefId}`,
  PROCESS_TERMINATE: 'process.terminate',
  PROCESS_SUSPEND: 'process.suspend',
  PROCESS_RESUME: 'process.resume',

  // IPC
  IPC_SEND_PARENT: 'process.ipc.send-parent',
  IPC_SEND_CHILD: 'process.ipc.send-child',

  // File system
  fileAction: (action: 'read' | 'write' | 'delete' | 'list', tier: string) => `file.${action}.${tier}`,
  FILE_ADMIN_CONFIGURE: 'file.admin.configure-capacity',

  // Window
  WINDOW_CREATE: 'window.create',

  // Service
  SERVICE_PUBLISH_HEALTH: 'service.publish-health',

  // Console
  CONSOLE_WRITE: 'console.write',
  CONSOLE_READ: 'console.read',

  // Process query / management
  PROCESS_LIST: 'process.list',

  // Storage
  STORAGE_USAGE: 'storage.usage',

  // Environment
  ENV_READ: 'env.read',
  ENV_WRITE: 'env.write',
  ENV_AUTOSTART: 'env.autostart',
  ENV_LOAD_LIBRARY: 'env.library.load',

  // Shell (console system-level commands)
  SHELL_LIST_APPS: 'shell.apps',
  SHELL_LAUNCH: 'shell.launch',
  SHELL_WINDOWS: 'shell.windows',
  SHELL_SYSINFO: 'shell.sysinfo',

  // Notification
  NOTIFICATION_SEND: 'notification.send',

  // Monitor
  MONITOR_READ: 'monitor.read',

  // Settings
  SETTINGS_READ: 'settings.read',
  SETTINGS_WRITE: 'settings.write',
} as const;

// ── Event Names ─────────────────────────────────────────────
export const Events = {
  SERVICE_HEALTH: 'service.health',
  WINDOW_UI: 'window.ui',
  CONSOLE_OUTPUT: 'console.output',
  CONSOLE_INPUT: 'console.input',
  PROCESS_STARTED: 'process.started',
  PROCESS_STOPPED: 'process.stopped',
  NOTIFICATION: 'notification',
} as const;

// ── User Default Permissions ────────────────────────────────
// 使用者登入後取得的預設權限。可在此調整使用者能存取的功能範圍。
// 系統內部操作（程序清理、事件廣播等）仍使用 systemAppId (WILDCARD)。
export const USER_DEFAULT_PERMISSIONS: string[] = [
  // 程序啟動（萬用字元：可啟動所有已註冊 App）
  'process.launch.*',
  Permissions.PROCESS_TERMINATE,
  Permissions.PROCESS_LIST,

  // 視窗
  Permissions.WINDOW_CREATE,

  // 檔案系統 — 使用者與 App 區域
  'file.read.user',
  'file.write.user',
  'file.delete.user',
  'file.list.user',
  'file.read.app',
  'file.write.app',
  'file.list.app',

  // 主控台
  Permissions.CONSOLE_WRITE,
  Permissions.CONSOLE_READ,

  // 事件匯流排
  'event.subscribe.*',
  'event.emit.*',

  // Shell 指令
  Permissions.SHELL_LIST_APPS,
  Permissions.SHELL_LAUNCH,
  Permissions.SHELL_WINDOWS,
  Permissions.SHELL_SYSINFO,

  // 通知
  Permissions.NOTIFICATION_SEND,

  // 環境
  Permissions.ENV_READ,
  Permissions.ENV_LOAD_LIBRARY,

  // 儲存空間查詢
  Permissions.STORAGE_USAGE,

  // 設定
  Permissions.SETTINGS_READ,
  Permissions.SETTINGS_WRITE,

  // 監控（唯讀）
  Permissions.MONITOR_READ,

  // 權限：建立子應用權限槽（供 DesktopShell 啟動使用）
  Permissions.NEW_APP,
];
