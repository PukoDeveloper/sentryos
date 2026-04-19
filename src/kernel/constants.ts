// ── Window Defaults ─────────────────────────────────────────
export const DEFAULT_WINDOW_WIDTH = 520;
export const DEFAULT_WINDOW_HEIGHT = 360;
export const WINDOW_CASCADE_X_OFFSET = 48;
export const WINDOW_CASCADE_Y_OFFSET = 42;
export const WINDOW_CASCADE_INCREMENT = 18;
export const MAXIMIZED_WINDOW_MARGIN = 0;   // px (negative to counter window-layer padding)
export const MAXIMIZED_TASKBAR_HEIGHT = 96;   // px (taskbar 82px from viewport - 40px padding)
export const WINDOW_SNAP_THRESHOLD = 24;    // px from host edge to trigger snap zones

// ── Z-Index Layers ──────────────────────────────────────────
export const Z_INDEX_WINDOW_BASE = 50;
export const Z_INDEX_ALWAYS_ON_TOP_OFFSET = 500;
export const Z_INDEX_START_PANEL = 9000;
export const Z_INDEX_LOCK_SCREEN = 9998;
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

// ── Storage Capacities (bytes) ───────────────────────────────
export const STORAGE_TOTAL_CAPACITY = 16 * 1024 * 1024; // 16 MB
export const STORAGE_TIER_CAPACITIES = {
  sys: 4 * 1024 * 1024,   // 4 MB
  app: 6 * 1024 * 1024,   // 6 MB
  user: 4 * 1024 * 1024,  // 4 MB
  cache: 2 * 1024 * 1024, // 2 MB
} as const;

// ── ID Prefixes ─────────────────────────────────────────────
export const ID_PREFIX_SYSTEM = 'sys_';
export const ID_PREFIX_USER = 'user_';
export const ID_PREFIX_APP_INSTANCE = 'app_';
export const ID_PREFIX_APP_DEF = 'appdef_';
export const ID_PREFIX_PLUGIN = 'plugin_';

// ── Application Types ───────────────────────────────────────
export type AppType = 'Service' | 'Window' | 'Console' | 'Library';

// ── Built-in App IDs ────────────────────────────────────────
export const BUILTIN_KERNEL_CONSOLE = 'builtin_kernel_console';

// ── Permissions & Events ────────────────────────────────────
// 集中管理於 permissions.ts，此處重新匯出以維持向下相容。
export { Permissions, Events, USER_DEFAULT_PERMISSIONS } from './permissions';

