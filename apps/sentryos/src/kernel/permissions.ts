// ── SentryOS Permission Definitions ─────────────────────────
// 所有權限字串集中管理。修改權限名稱或值時只需改此檔案。

// ── Permission Constants ────────────────────────────────────
export const Permissions = {
  // Permission management (system internal)
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
  PROCESS_LIST: 'process.list',

  // IPC
  IPC_SEND_PARENT: 'process.ipc.send-parent',
  IPC_SEND_CHILD: 'process.ipc.send-child',

  // File system
  fileAction: (action: 'read' | 'write' | 'delete' | 'list', tier: string) => `file.${action}.${tier}`,
  FILE_ADMIN_CONFIGURE: 'file.admin.configure-capacity',
  FILE_CROSS_APP: 'file.cross-app',
  FILE_LIST_ALL: 'file.list-all',

  // Window
  WINDOW_CREATE: 'window.create',

  // Service
  SERVICE_PUBLISH_HEALTH: 'service.publish-health',

  // Console
  CONSOLE_WRITE: 'console.write',
  CONSOLE_READ: 'console.read',

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

  // Network
  NETWORK_REQUEST: 'network.request',
  NETWORK_STATUS: 'network.status',
  NETWORK_MANAGE: 'network.manage',

  // Registry
  REGISTRY_READ: 'registry.read',
  REGISTRY_WRITE: 'registry.write',

  // Dialog
  DIALOG_OPEN: 'dialog.open',
  DIALOG_RESOLVE: 'dialog.resolve',

  // Clipboard
  CLIPBOARD_READ: 'clipboard.read',
  CLIPBOARD_WRITE: 'clipboard.write',

  // Audio
  AUDIO_PLAY: 'audio.play',
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
  KEYBOARD: 'keyboard',
  LANGUAGE_CHANGED: 'language.changed',
  THEME_CHANGED: 'theme.changed',
  CLIPBOARD_CHANGED: 'clipboard.changed',
  SHELL_MODE_CHANGED: 'shell.mode-changed',
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

  // 註冊表（唯讀）
  Permissions.REGISTRY_READ,

  // 對話框
  Permissions.DIALOG_OPEN,

  // 剪貼簿
  Permissions.CLIPBOARD_READ,
  Permissions.CLIPBOARD_WRITE,

  // 音訊
  Permissions.AUDIO_PLAY,

  // 權限：建立子應用權限槽（供 DesktopShell 啟動使用）
  Permissions.NEW_APP,
];
