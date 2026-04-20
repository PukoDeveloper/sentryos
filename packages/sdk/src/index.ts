// ─────────────────────────────────────────────────────────────
// SentryOS SDK — Main Entry
// ─────────────────────────────────────────────────────────────

// Core types
export type {
  Result, PermissionError, PermissionResult, ProcessError, ProcessResult,
  StorageTier, StorageError, StorageResult, StorageData, StorageEntry,
  WindowState, WindowSystemError, WindowSystemResult,
  NetworkError, NetworkResult, HttpMethod,
  DialogMode, NotificationType, EventBusError, EventBusResult, AppType,
} from './types';

// Constants (runtime values)
export { Permissions, Events } from './constants';

// Runtime types
export type {
  ProcessView, ApiFactoryContext, HostApiValue, ApiFactory,
  RuntimeResult, IRuntime, RuntimeAdapter,
} from './runtime';
export { BaseRuntime } from './runtime';

// Window / UI types
export type {
  WindowUiEventType, WindowUiStyle, WindowUiNodeBase, WindowUiNode,
  WindowUiNodePatch, WindowUiEvent, RenderContext,
  UiComponentRenderer, UiComponentApiBuilder,
  WindowBounds, WindowStyle, InitializeUiOptions, WindowInitOptions,
  WindowLifecycleEvent, WindowProcessContext,
  ContextMenuItem, ContextMenuSeparator, ContextMenuEntry,
  ConsoleWindowController,
} from './window';

// Service interfaces
export type {
  PermissionsManager, EventBus,
  Application, RegisteredApplication, ApplicationManager,
  Process, ProcessManager,
  WriteOptions, StorageUsage, FileSystemAdapter,
  WindowManager,
  CommandEntry, EnvironmentManager,
  NotificationOptions, NotificationManager,
  SystemMonitor, DesktopShell,
  LaunchContext, ApplicationLauncher,
  SystemAlert, KernelConsole,
  NetworkRequest, NetworkResponse, AllowlistEntry, NetworkStatus, NetworkAdapter,
  FileTypeAssociation, RegistrySnapshot, SystemRegistry,
  DialogOptions, DialogResult, DialogManager,
  PluginManager, RuntimeRegistry, LanguageManager,
  ServiceMap, ValueMap,
} from './services';

// Plugin types
export type { SentryPlugin, PluginContext } from './plugin';

// App types
export type {
  AppManifest, PackageManifest,
  OsProcess, OsEvent, OsIpc, OsService, OsUi, OsSystem,
  OsStorage, OsEnv, OsConsole, OsShell, OsNotification,
  OsMonitor, OsSettings, OsNetwork, OsRegistry, OsDialog,
  OsApi, AppGlobals,
} from './app';
