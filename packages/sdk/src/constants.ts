// ─────────────────────────────────────────────────────────────
// SentryOS SDK — Permission & Event Constants
// ─────────────────────────────────────────────────────────────

export const Permissions = {
  NEW_APP: 'permission.new-app',
  REMOVE_APP: 'permission.remove-app',
  MANAGE_PERMISSIONS: 'permission.manage-permissions',
  WILDCARD: '*',

  eventSubscribe: (event: string) => `event.subscribe.${event}`,
  eventEmit: (event: string) => `event.emit.${event}`,

  processLaunch: (appDefId: string) => `process.launch.${appDefId}`,
  PROCESS_TERMINATE: 'process.terminate',
  PROCESS_SUSPEND: 'process.suspend',
  PROCESS_RESUME: 'process.resume',
  PROCESS_LIST: 'process.list',

  IPC_SEND_PARENT: 'process.ipc.send-parent',
  IPC_SEND_CHILD: 'process.ipc.send-child',

  fileAction: (action: 'read' | 'write' | 'delete' | 'list', tier: string) => `file.${action}.${tier}`,
  FILE_ADMIN_CONFIGURE: 'file.admin.configure-capacity',
  FILE_CROSS_APP: 'file.cross-app',
  FILE_LIST_ALL: 'file.list-all',

  WINDOW_CREATE: 'window.create',

  SERVICE_PUBLISH_HEALTH: 'service.publish-health',

  CONSOLE_WRITE: 'console.write',
  CONSOLE_READ: 'console.read',

  STORAGE_USAGE: 'storage.usage',

  ENV_READ: 'env.read',
  ENV_WRITE: 'env.write',
  ENV_AUTOSTART: 'env.autostart',
  ENV_LOAD_LIBRARY: 'env.library.load',

  SHELL_LIST_APPS: 'shell.apps',
  SHELL_LAUNCH: 'shell.launch',
  SHELL_WINDOWS: 'shell.windows',
  SHELL_SYSINFO: 'shell.sysinfo',

  NOTIFICATION_SEND: 'notification.send',
  MONITOR_READ: 'monitor.read',

  SETTINGS_READ: 'settings.read',
  SETTINGS_WRITE: 'settings.write',

  NETWORK_REQUEST: 'network.request',
  NETWORK_STATUS: 'network.status',
  NETWORK_MANAGE: 'network.manage',

  REGISTRY_READ: 'registry.read',
  REGISTRY_WRITE: 'registry.write',

  DIALOG_OPEN: 'dialog.open',
  DIALOG_RESOLVE: 'dialog.resolve',

  CLIPBOARD_READ: 'clipboard.read',
  CLIPBOARD_WRITE: 'clipboard.write',

  AUDIO_PLAY: 'audio.play',

  RUNTIME_EXTENDED_TIMEOUT: 'runtime.extended-timeout',
} as const;

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
} as const;
