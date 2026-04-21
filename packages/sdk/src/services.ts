// ─────────────────────────────────────────────────────────────
// SentryOS SDK — Kernel Service Interfaces
// ─────────────────────────────────────────────────────────────

import type {
  PermissionResult, StorageTier, StorageResult, StorageData, StorageEntry,
  WindowState, WindowSystemResult, NetworkResult,
  HttpMethod, DialogMode, NotificationType, EventBusResult, AppType,
} from './types';
import type {
  ApiFactory, IRuntime,
} from './runtime';
import type {
  WindowUiNode, WindowUiNodePatch, WindowStyle, WindowInitOptions,
  InitializeUiOptions, WindowLifecycleEvent, WindowProcessContext,
  ContextMenuEntry, ConsoleWindowController,
} from './window';

// ── PermissionsManager ──────────────────────────────────────

export interface PermissionsManager {
  has(appId: string, permission: string): boolean;
  hasAnyUnder(appId: string, namespace: string): boolean;
  registerAppId(fromAppId: string, appId: string, permissions: string[]): PermissionResult;
  grant(fromAppId: string, toAppId: string, permission: string): PermissionResult;
  revoke(fromAppId: string, toAppId: string, permission: string): PermissionResult;
  removeApp(fromAppId: string, targetAppId: string): PermissionResult;
  getPermissions(fromAppId: string, targetAppId: string): PermissionResult;
}

// ── EventBus ────────────────────────────────────────────────

export interface EventBus {
  on(appId: string, event: string, listener: (...args: unknown[]) => void): EventBusResult;
  off(appId: string, event: string, listener: (...args: unknown[]) => void): EventBusResult;
  emit(appId: string, event: string, ...args: unknown[]): EventBusResult;
  removeApp(appId: string): void;
}

// ── ApplicationManager ──────────────────────────────────────

export interface Application {
  appId: string;
  name: string;
  version: string;
  permissions: string[];
  maxInstances: number;
}

export interface RegisteredApplication extends Application {
  packageName: string;
  manifestId?: string;
  entryPath: string;
  mainPath: string;
  description?: string;
  author?: string;
  icon?: string;
  runtimeType: AppType;
  autoStart: boolean;
  hidden: boolean;
  engine?: string;
}

export interface ApplicationManager {
  get(appId: string): Application | undefined;
  getAll(): Application[];
}

// ── ProcessManager ──────────────────────────────────────────

export interface Process {
  pid: number;
  appDefId: string;
  processAppId: string;
  type: AppType;
  parentPid: number | null;
  status: 'running' | 'stopped' | 'suspended';
  children: Set<number>;
}

export interface ProcessManager {
  get(pid: number): Process | undefined;
  getByProcessAppId(processAppId: string): Process | undefined;
  getByApp(appDefId: string): Process[];
  getAllProcesses(): Process[];
}

// ── FileSystemAdapter ───────────────────────────────────────

export interface WriteOptions {
  overwrite?: boolean;
  ownerLabel?: string;
}

export interface StorageUsage {
  total: number;
  used: number;
  tiers: Record<StorageTier, { capacity: number; used: number }>;
}

export interface FileSystemAdapter {
  read<TData extends StorageData>(appId: string, tier: StorageTier, key: string): StorageResult<StorageEntry<TData>>;
  write<TData extends StorageData>(appId: string, tier: StorageTier, key: string, data: TData, options?: WriteOptions): StorageResult<StorageEntry<TData>>;
  delete(appId: string, tier: StorageTier, key: string): StorageResult<string>;
  list(appId: string, tier?: StorageTier): StorageResult<StorageEntry[]>;
  listByPrefix(appId: string, tier: StorageTier, prefix: string): StorageResult<StorageEntry[]>;
  exists(appId: string, tier: StorageTier, key: string): StorageResult<boolean>;
  usage(appId: string): StorageResult<StorageUsage>;
}

// ── WindowManager ───────────────────────────────────────────

export interface WindowManager {
  setWindowChangeListener(listener: (event: WindowLifecycleEvent) => void): void;
  createWindow(context: WindowProcessContext, options: WindowInitOptions): WindowSystemResult<string>;
  initializeUi(processAppId: string, windowId: string, tree: WindowUiNode[], options?: InitializeUiOptions): WindowSystemResult<string>;
  updateUi(processAppId: string, windowId: string, nodeId: string, patch: WindowUiNodePatch): WindowSystemResult<string>;
  removeUiNode(processAppId: string, windowId: string, nodeId: string): WindowSystemResult<string>;
  appendUiNode(processAppId: string, windowId: string, parentId: string, nodes: WindowUiNode[]): WindowSystemResult<string>;
  setWindowStyle(processAppId: string, windowId: string, style: WindowStyle): WindowSystemResult<string>;
  closeWindow(processAppId: string, windowId: string): WindowSystemResult<string>;
  minimizeWindow(processAppId: string, windowId: string): WindowSystemResult<string>;
  maximizeWindow(processAppId: string, windowId: string): WindowSystemResult<string>;
  restoreWindow(processAppId: string, windowId: string): WindowSystemResult<string>;
  focusWindow(processAppId: string, windowId: string): WindowSystemResult<string>;
  getOpenWindowSummaries(): Array<{ windowId: string; processAppId: string; appDefId: string; title: string; state: WindowState; icon?: string }>;
  getWindowsByProcess(processAppId: string): string[];
  setWindowBlocked(windowId: string, blocked: boolean): void;
  getFocusedProcessAppId(): string | null;
  showContextMenu(processAppId: string, windowId: string, controlId: string, x: number, y: number, items: ContextMenuEntry[]): WindowSystemResult<string>;
  closeContextMenu(): void;
  createConsoleWindow(context: WindowProcessContext, title: string, inputHandler: (line: string) => void): ConsoleWindowController;
  /** Retrieve the raw DOM element for a UI node inside a window. */
  getNodeElement(processAppId: string, windowId: string, nodeId: string): HTMLElement | null;
  /** Build a RenderContext for the given process / window pair. */
  buildRenderContextFor(processAppId: string, windowId: string): import('./window').RenderContext | null;
}

// ── EnvironmentManager ──────────────────────────────────────

export interface CommandEntry { name: string; libraryId: string; description: string; usage?: string; }

export interface EnvironmentManager {
  registerAutoStart(appDefId: string): void;
  unregisterAutoStart(appDefId: string): void;
  isAutoStart(appDefId: string): boolean;
  getAutoStartApps(): string[];
  setVariable(key: string, value: string): void;
  getVariable(key: string): string | undefined;
  removeVariable(key: string): boolean;
  getAllVariables(): Record<string, string>;
  registerLibrary(libraryId: string, code: string): void;
  getLibraryCode(libraryId: string): string | undefined;
  hasLibrary(libraryId: string): boolean;
  getLibraryIds(): string[];
  registerCommand(name: string, entry: Omit<CommandEntry, 'name'>): void;
  getCommand(name: string): CommandEntry | undefined;
  hasCommand(name: string): boolean;
  getAllCommands(): CommandEntry[];
}

// ── NotificationManager ─────────────────────────────────────

export interface NotificationOptions {
  title: string; body?: string; type?: NotificationType; duration?: number; source?: string;
}

export interface NotificationManager {
  doNotDisturb: boolean; defaultDuration: number; maxVisible: number;
  notify(options: NotificationOptions): string;
  dismiss(id: string): void;
}

// ── SystemMonitor ───────────────────────────────────────────

export interface SystemMonitor {
  recordEventEmit(appId: string, event: string): void;
  recordEventSubscribe(event: string): void;
  recordApiCall(apiName: string, method: string, processAppId: string, pid: number, duration: number, success: boolean): void;
  recordPermissionCheck(appId: string, permission: string, granted: boolean): void;
  getSnapshot(activeProcessCount: number): unknown;
  getEventStats(): unknown;
  getApiStats(): unknown;
  getPermissionStats(): unknown;
  getRecentEvents(limit?: number): unknown[];
  getRecentApiCalls(limit?: number): unknown[];
  getProcessHistory(): unknown[];
}

// ── DesktopShell ────────────────────────────────────────────

export interface DesktopShell { getTheme(): unknown; applyTheme(theme: unknown): void; setLocale(locale: string, t: (key: string) => string): void; }

// ── ApplicationLauncher ─────────────────────────────────────

export interface LaunchContext {
  app: RegisteredApplication;
  type: AppType;
  callerAppId?: string;
  fileArgs?: Record<string, unknown>;
}

export interface ApplicationLauncher {
  getConsoleControllers(): Map<string, ConsoleWindowController>;
  terminateApplication(processAppId: string, reason: string): void;
  focusExistingInstance(appDefId: string): void;
  launchApplication(context: LaunchContext): Promise<void>;
  launchKernelConsole(appDefId: string, appName: string, icon?: string): Promise<void>;
}

// ── SystemAlert ─────────────────────────────────────────────

export interface SystemAlert { show(title: string, message: string): void; }

// ── KernelConsole ───────────────────────────────────────────

export interface KernelConsole { log(source: string, level: string, message: string): void; }

// ── NetworkAdapter ──────────────────────────────────────────

export interface NetworkRequest {
  url: string; method?: HttpMethod; headers?: Record<string, string>; body?: string; timeout?: number;
}

export interface NetworkResponse { status: number; statusText: string; headers: Record<string, string>; body: string; }

export interface AllowlistEntry { pattern: string; description?: string; createdAt: number; }

export interface NetworkStatus { enabled: boolean; allowlistCount: number; totalRequests: number; blockedRequests: number; }

export interface NetworkAdapter {
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
  request(appId: string, req: NetworkRequest): Promise<NetworkResult<NetworkResponse>>;
  isAllowed(url: string): boolean;
  getAllowlist(): AllowlistEntry[];
  addAllowlistEntry(pattern: string, description?: string): NetworkResult<AllowlistEntry>;
  removeAllowlistEntry(pattern: string): NetworkResult<string>;
  getStatus(): NetworkStatus;
}

// ── SystemRegistry ──────────────────────────────────────────

export interface FileTypeAssociation { extension: string; appDefId: string; mimeType?: string; }

export interface RegistrySnapshot { roles: Record<string, string>; fileTypes: FileTypeAssociation[]; }

export interface SystemRegistry {
  setDefaultApp(role: string, appDefId: string): void;
  getDefaultApp(role: string): string | undefined;
  removeDefaultApp(role: string): boolean;
  getAllRoles(): Record<string, string>;
  setFileTypeHandler(extension: string, appDefId: string, mimeType?: string): void;
  getFileTypeHandler(extension: string): FileTypeAssociation | undefined;
  removeFileTypeHandler(extension: string): boolean;
  getAllFileTypeHandlers(): FileTypeAssociation[];
  persist(): void;
  getSnapshot(): RegistrySnapshot;
}

// ── DialogManager ───────────────────────────────────────────

export interface DialogOptions { mode: DialogMode; title?: string; extensions?: string[]; defaultPath?: string; }

export interface DialogResult { cancelled: boolean; path?: string; tier?: string; filename?: string; }

export interface DialogManager {
  openDialog(callerProcessAppId: string, callerWindowId: string, options: DialogOptions): string;
  bindPicker(dialogId: string, pickerProcessAppId: string): void;
  resolve(dialogId: string, result: DialogResult): void;
  cancel(dialogId: string): void;
  hasPending(dialogId: string): boolean;
}

// ── PluginManager ───────────────────────────────────────────

export interface PluginManager {
  loadPlugin(path: string): Promise<void>;
  loadPlugins(pluginPaths: string[]): Promise<{ loaded: string[]; failed: { path: string; error: string }[] }>;
  unloadPlugin(name: string, mode?: 'soft' | 'root' | 'force'): Promise<{ unloaded: string[] }>;
  unloadAll(): Promise<void>;
  getLoadedPlugins(): Array<{ name: string; version: string; description?: string; author?: string; path: string; loadedAt: number }>;
  isLoaded(name: string): boolean;
}

// ── RuntimeRegistry ─────────────────────────────────────────

export interface RuntimeRegistry {
  registerApi(name: string, factory: ApiFactory, gates?: string[], group?: string): void;
  unregisterApi(name: string): boolean;
  getHostApiEntries(): ReadonlyMap<string, { factory: ApiFactory; gates: string[]; group?: string }>;
  register(engine: string, runtime: IRuntime): void;
  get(engine: string): IRuntime | undefined;
  getDefault(): IRuntime;
  setDefault(engine: string): void;
  has(engine: string): boolean;
  unregister(engine: string): boolean;
  bindProcess(pid: number, processAppId: string, engine: string): void;
  unbindProcess(pid: number, processAppId: string): void;
  getForPid(pid: number): IRuntime;
  getForProcessAppId(processAppId: string): IRuntime;
}

// ── LanguageManager ─────────────────────────────────────────

export interface LanguageManager {
  getCurrentLocale(): string;
  getSupportedLocales(): string[];
  setLocale(locale: string): boolean;
  t(namespace: string, key: string): string;
  exportSettings(): { locale?: string };
  importSettings(settings: { locale?: string }): void;
}

// ── ServiceMap & ValueMap (context.resolve / context.get) ───

export interface ServiceMap {
  permissionsManager: PermissionsManager;
  eventBus: EventBus;
  appManager: ApplicationManager;
  processManager: ProcessManager;
  fileSystem: FileSystemAdapter;
  windowManager: WindowManager;
  environmentManager: EnvironmentManager;
  notificationManager: NotificationManager;
  systemMonitor: SystemMonitor;
  desktopShell: DesktopShell;
  applicationLauncher: ApplicationLauncher;
  systemAlert: SystemAlert;
  kernelConsole: KernelConsole;
  networkManager: NetworkAdapter;
  systemRegistry: SystemRegistry;
  dialogManager: DialogManager;
  pluginManager: PluginManager;
  runtimeRegistry: RuntimeRegistry;
  languageManager: LanguageManager;
}

export interface ValueMap {
  loginUser: string;
  userKey: string;
  [key: string]: unknown;
}
