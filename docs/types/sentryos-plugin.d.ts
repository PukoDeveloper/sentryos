// ─────────────────────────────────────────────────────────────
// SentryOS Plugin SDK — Type Declarations
// 供插件開發者使用的型別聲明檔案
// ─────────────────────────────────────────────────────────────

// ── Plugin Module (default export) ──────────────────────────

/**
 * 插件的 default export 必須符合此介面。
 *
 * @example
 * ```js
 * /** @type {import('./sentryos-plugin').SentryPlugin} *\/
 * export default {
 *   pluginName: 'my-plugin',
 *   pluginVersion: '1.0.0',
 *   pluginDescription: 'My awesome plugin',
 *   author: 'Author Name',
 *   permissions: ['event.*', 'ui.*'],
 *   dependencies: ['other-plugin'],
 *   setup(context) { ... },
 *   teardown(context) { ... },
 * };
 * ```
 */
export interface SentryPlugin {
  /** 插件唯一名稱（用作內部識別 ID） */
  pluginName: string;
  /** 插件版本 */
  pluginVersion: string;
  /** 插件描述 */
  pluginDescription?: string;
  /** 作者 */
  author?: string;
  /**
   * 插件請求的權限列表。
   * 預設為 `['*']`（完整權限）。
   * 使用更具體的權限（如 `['event.*', 'ui.*']`）可限縮存取範圍。
   */
  permissions?: string[];
  /**
   * 依賴的其他插件名稱列表。
   * 系統會確保依賴的插件先於此插件初始化。
   * 若依賴的插件不存在或出現循環依賴，此插件將無法載入。
   */
  dependencies?: string[];
  /**
   * 插件初始化。系統啟動時呼叫，接收 PluginContext。
   * 所有透過 context 進行的註冊（API、UI 元件、事件監聽、Runtime 引擎）
   * 在卸載時皆自動清理。
   */
  setup(context: PluginContext): void | Promise<void>;
  /**
   * 插件卸載。系統會在呼叫此方法後自動執行 context.cleanup()，
   * 只需處理插件自身的內部狀態清理。
   */
  teardown(context: PluginContext): void | Promise<void>;
}

// ── Plugin Context ──────────────────────────────────────────

/**
 * 插件在 setup/teardown 中取得的上下文物件。
 * 提供事件、API 註冊、UI 元件註冊、日誌、以及 Kernel 存取。
 */
export interface PluginContext {
  /** 插件名稱 */
  readonly pluginName: string;
  /** 插件專屬的 appId（用於 EventBus 等需要身份識別的操作） */
  readonly pluginAppId: string;

  // ── Kernel Access ───────────────────────────────────────

  /** 取得 Kernel 中的服務實例 */
  resolve<K extends keyof ServiceMap>(key: K): ServiceMap[K];
  /** 取得 Kernel 中的系統值 */
  get<K extends keyof ValueMap>(key: K): ValueMap[K];

  // ── Event Bus ───────────────────────────────────────────

  /** 訂閱事件（自動使用插件 appId，卸載時自動取消） */
  on(event: string, listener: (...args: any[]) => void): EventBusResult;
  /** 取消訂閱事件 */
  off(event: string, listener: (...args: any[]) => void): EventBusResult;
  /** 發射事件 */
  emit(event: string, ...args: any[]): EventBusResult;

  // ── Runtime API Registration ────────────────────────────

  /**
   * 為應用程式 runtime 註冊新的 Host API。
   * 註冊後，在 QuickJS 沙箱中的應用程式可透過此 API 存取插件功能。
   *
   * @param name  - API 命名空間（如 `'monaco'`）
   * @param factory - 工廠函式，為每個 process 建立 API 物件
   * @param gates - 權限 gate，決定哪些 process 可存取此 API
   * @param group - 可選的 API 分組名
   */
  registerApi(name: string, factory: ApiFactory, gates?: string[], group?: string): void;
  /** 反註冊 Host API */
  unregisterApi(name: string): boolean;

  // ── UI Component Registration ───────────────────────────

  /**
   * 註冊自訂 UI 元件。
   * 註冊後可在 WindowManager 中使用此元件類型。
   *
   * @param type       - 元件類型名稱（如 `'code-editor'`）
   * @param renderer   - DOM 渲染器
   * @param apiBuilder - QuickJS 端 node descriptor 建構器
   */
  registerUiComponent(type: string, renderer: UiComponentRenderer, apiBuilder: UiComponentApiBuilder): void;
  /** 反註冊 UI 元件 */
  unregisterUiComponent(type: string): boolean;

  // ── Runtime Engine Registration ─────────────────────────

  /**
   * 向 RuntimeRegistry 註冊自訂 Runtime 引擎。
   * 插件卸載時會自動反註冊。
   *
   * @param engine  - 引擎識別字串（如 `'lua'`、`'python'`）
   * @param runtime - 實作 IRuntime 介面的引擎實例
   */
  registerRuntime(engine: string, runtime: IRuntime): void;
  /**
   * 從 RuntimeRegistry 反註冊指定引擎。
   * cleanup() 時會自動呼叫，通常無需手動執行。
   *
   * @param engine - 引擎識別字串
   * @returns 引擎是否存在並成功移除
   */
  unregisterRuntime(engine: string): boolean;

  // ── Logging ─────────────────────────────────────────────

  /** 記錄日誌（自動帶 `[plugin:名稱]` 前綴） */
  log(level: 'INFO' | 'WARN' | 'ERROR', message: string): void;

  // ── Cleanup ─────────────────────────────────────────────

  /**
   * 清除所有透過此 context 進行的註冊（事件監聽、API、UI 元件、Runtime 引擎）。
   * PluginManager 在 teardown 後自動呼叫，通常無需手動執行。
   */
  cleanup(): void;
}

// ── Event Bus ───────────────────────────────────────────────

export interface EventBusResult {
  success: boolean;
  error?: 'PermissionDenied' | 'EventNotFound' | 'UnknownError';
}

// ── Runtime API Types ───────────────────────────────────────

/** Process 資訊，傳入 ApiFactory 供建構 API 時使用 */
export interface ProcessView {
  pid: number;
  appDefId: string;
  processAppId: string;
  type: 'Service' | 'Window' | 'Console' | 'Library';
  parentPid: number | null;
  status: 'running' | 'stopped' | 'suspended';
  children: Set<number>;
}

export interface ApiFactoryContext {
  pid: number;
  process: ProcessView;
}

/** Host API 值的遞迴型別 */
export type HostApiValue =
  | string | number | boolean | null | undefined
  | HostApiValue[]
  | { [k: string]: HostApiValue }
  | ((...args: any[]) => unknown);

/**
 * API 工廠函式。每個 process 啟動時呼叫，回傳該命名空間下可用的函式/值。
 *
 * @example
 * ```js
 * context.registerApi('myApi', ({ pid, process }) => ({
 *   hello: () => `Hello from process ${pid}`,
 *   getData: (key) => storage.get(process.appDefId, key),
 * }));
 * ```
 */
export type ApiFactory = (ctx: ApiFactoryContext) => Record<string, HostApiValue>;

// ── UI Component Types ──────────────────────────────────────

export type WindowUiEventType = 'click' | 'change' | 'submit' | 'dblclick' | 'contextmenu' | 'contextmenu-select';

export interface WindowUiStyle {
  className?: string;
  background?: string;
  color?: string;
  padding?: string;
  gap?: string;
  borderRadius?: string;
  border?: string;
  fontSize?: string;
  fontWeight?: string;
  justifyContent?: string;
  alignItems?: string;
  flexDirection?: 'row' | 'column';
  width?: string;
  height?: string;
  overflow?: string;
  textAlign?: string;
  flex?: string;
  margin?: string;
  opacity?: string;
  cursor?: string;
  [key: string]: string | undefined;
}

export interface WindowUiNodeBase {
  id?: string;
  type: string;
  style?: WindowUiStyle;
  events?: WindowUiEventType[];
}

export type WindowUiNode = WindowUiNodeBase & Record<string, unknown>;

export interface WindowUiNodePatch {
  text?: string;
  value?: string | number | boolean;
  checked?: boolean;
  style?: WindowUiStyle;
  options?: Array<{ value: string; label: string }>;
  children?: WindowUiNode[];
  src?: string;
  placeholder?: string;
  label?: string;
  color?: string;
  rows?: number;
}

export interface WindowUiEvent {
  eventId: string;
  windowId: string;
  processAppId: string;
  type: WindowUiEventType;
  controlId?: string;
  value?: unknown;
  x?: number;
  y?: number;
}

/** WindowManager 傳給 renderer 的渲染上下文 */
export interface RenderContext {
  windowId: string;
  processAppId: string;
  /** 遞迴渲染子節點 */
  renderChild(node: WindowUiNode): HTMLElement;
  /**
   * 為元素建立事件綁定並回傳 dispatch 函式。
   * 呼叫 dispatch(extraFields?) 即可觸發 UI event。
   */
  bindEvent(controlId: string | undefined, type: string): (extra?: Partial<WindowUiEvent>) => void;
  /** 註冊 node 到 nodeMap */
  registerNode(nodeId: string | undefined, element: HTMLElement): void;
  /** 套用 style 物件到 HTMLElement */
  applyStyle(element: HTMLElement, style?: WindowUiStyle): void;
}

/** UI 元件渲染器 */
export interface UiComponentRenderer {
  /** 建立 DOM 元素 */
  render(node: WindowUiNode, ctx: RenderContext): HTMLElement;
  /** 處理 patch 更新（回傳 true 表示已處理） */
  patch?(element: HTMLElement, patch: WindowUiNodePatch, ctx: RenderContext): boolean;
}

/** QuickJS 端 node descriptor 建構器 */
export type UiComponentApiBuilder = (...args: any[]) => Record<string, unknown>;

// ── IRuntime Interface ──────────────────────────────────────
// 自訂 Runtime 引擎需實作此介面。

/** Runtime 執行結果 */
export interface RuntimeResult<T> {
  success: boolean;
  data?: T;
  error?: 'ProcessNotFound' | 'ProcessNotRunning' | 'RuntimeError' | 'PermissionDenied' | 'InvalidTarget';
}

/**
 * 所有 Script Runtime 引擎必須實作的公開介面。
 * 新增 Runtime 引擎（例如 Lua、Python）只需實作此介面，
 * 即可透過 RuntimeRegistry 接入現有的應用程式生命週期管理。
 */
export interface IRuntime {
  /** 註冊 Host API 到此引擎 */
  registerApi(name: string, factory: ApiFactory, gates?: string[], group?: string): void;
  /** 反註冊 Host API */
  unregisterApi(name: string): boolean;
  /** 在指定 PID 的沙箱中執行程式碼 */
  execute(pid: number, code: string, timeoutMs?: number, entryPath?: string): RuntimeResult<unknown>;
  /** 在已存在的程序上下文中評估程式碼（不重新注入 API） */
  evaluateInContext(pid: number, code: string): RuntimeResult<unknown>;
  /** 銷毀指定程序的 Runtime 資源 */
  destroyProcessRuntime(pid: number): void;
  /** 銷毀所有程序的 Runtime 資源 */
  destroyAll(): void;
  /** 派發 UI 事件到指定程序 */
  dispatchUiEvent(processAppId: string, event: Record<string, unknown>): RuntimeResult<unknown>;
  /** 派發 Console 輸入到指定程序 */
  dispatchConsoleInput(processAppId: string, line: string): RuntimeResult<unknown>;
  /** 派發鍵盤事件到指定程序 */
  dispatchKeyboardEvent(processAppId: string, event: Record<string, unknown>): RuntimeResult<unknown>;
  /** 派發檔案開啟事件到指定程序 */
  dispatchFileOpen(processAppId: string, fileInfo: Record<string, unknown>): RuntimeResult<unknown>;
  /** 派發對話框結果到指定程序 */
  dispatchDialogResult(processAppId: string, result: Record<string, unknown>): RuntimeResult<unknown>;
}

// ── Kernel Service Types ────────────────────────────────────
// 以下為各服務的公開介面摘要。供插件開發者透過 context.resolve() 使用。

// ── Result Types ────────────────────────────────────────────

export interface Result<DataT, ErrorT> {
  success: boolean;
  data?: DataT;
  error?: ErrorT;
}

export type PermissionError = 'PermissionDenied' | 'InvalidPermission' | 'NotInitialized' | 'UnknownError';
export type PermissionResult = Result<any, PermissionError>;

export type ProcessError =
  | 'PermissionDenied' | 'AppNotFound' | 'MaxInstancesReached'
  | 'ParentNotFound' | 'NotFound' | 'UnknownError';
export type ProcessResult = Result<any, ProcessError>;

export type StorageTier = 'sys' | 'app' | 'user' | 'cache';
export type StorageError = 'PermissionDenied' | 'NotFound' | 'AlreadyExists' | 'CapacityExceeded' | 'InvalidTier' | 'InvalidKey' | 'UnknownError';
export type StorageResult<TData = unknown> = Result<TData, StorageError>;
export type StorageData = string | number | boolean | null | StorageData[] | { [key: string]: StorageData };

export interface StorageEntry<TData extends StorageData = StorageData> {
  key: string;
  tier: StorageTier;
  data: TData;
  createdAt: number;
  updatedAt: number;
}

export type WindowState = 'normal' | 'minimized' | 'maximized' | 'closed';
export type WindowSystemError = 'PermissionDenied' | 'WindowNotFound' | 'NodeNotFound' | 'Closed' | 'InvalidOperation' | 'RateLimitExceeded';
export type WindowSystemResult<TData = unknown> = Result<TData, WindowSystemError>;

export type NetworkError = 'PermissionDenied' | 'NotAllowed' | 'ConnectionFailed' | 'Timeout' | 'InvalidUrl' | 'Disabled' | 'UnknownError';
export type NetworkResult<T = unknown> = Result<T, NetworkError>;
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export type DialogMode = 'file' | 'folder' | 'save';
export type NotificationType = 'info' | 'success' | 'warning' | 'error';

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
  runtimeType: 'Service' | 'Window' | 'Console' | 'Library';
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
  type: 'Service' | 'Window' | 'Console' | 'Library';
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

export interface WindowBounds {
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface WindowStyle {
  background?: string;
  color?: string;
  borderRadius?: string;
  border?: string;
  boxShadow?: string;
}

export interface WindowInitOptions {
  title: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  useDefaultFrame?: boolean;
  alwaysOnTop?: boolean;
  resizable?: boolean;
  style?: WindowStyle;
}

export interface WindowLifecycleEvent {
  type: 'created' | 'closed' | 'minimized' | 'maximized' | 'restored' | 'focused' | 'resized';
  windowId: string;
  processAppId: string;
  title: string;
  state: WindowState;
  bounds?: WindowBounds;
}

export interface WindowProcessContext {
  processAppId: string;
  appDefId: string;
  appName: string;
  icon?: string;
}

export interface ContextMenuItem {
  id: string;
  label: string;
  danger?: boolean;
}

export interface ContextMenuSeparator {
  separator: true;
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

export interface ConsoleWindowController {
  windowId: string;
  appendLine(text: string): void;
  appendText(text: string): void;
  clear(): void;
}

export interface WindowManager {
  setWindowChangeListener(listener: (event: WindowLifecycleEvent) => void): void;
  createWindow(context: WindowProcessContext, options: WindowInitOptions): WindowSystemResult<string>;
  initializeUi(processAppId: string, windowId: string, tree: WindowUiNode[]): WindowSystemResult<string>;
  updateUi(processAppId: string, windowId: string, nodeId: string, patch: WindowUiNodePatch): WindowSystemResult<string>;
  removeUiNode(processAppId: string, windowId: string, nodeId: string): WindowSystemResult<string>;
  appendUiNode(processAppId: string, windowId: string, parentId: string, nodes: WindowUiNode[]): WindowSystemResult<string>;
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
}

// ── EnvironmentManager ──────────────────────────────────────

export interface CommandEntry {
  name: string;
  libraryId: string;
  description: string;
  usage?: string;
}

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
  title: string;
  body?: string;
  type?: NotificationType;
  duration?: number;
  source?: string;
}

export interface NotificationManager {
  doNotDisturb: boolean;
  defaultDuration: number;
  maxVisible: number;
  notify(options: NotificationOptions): string;
  dismiss(id: string): void;
}

// ── SystemMonitor ───────────────────────────────────────────

export interface SystemMonitor {
  recordEventEmit(appId: string, event: string): void;
  recordEventSubscribe(event: string): void;
  recordApiCall(apiName: string, method: string, processAppId: string, pid: number, duration: number, success: boolean): void;
  recordPermissionCheck(appId: string, permission: string, granted: boolean): void;
  getSnapshot(activeProcessCount: number): any;
  getEventStats(): any;
  getApiStats(): any;
  getPermissionStats(): any;
  getRecentEvents(limit?: number): any[];
  getRecentApiCalls(limit?: number): any[];
  getProcessHistory(): any[];
}

// ── DesktopShell ────────────────────────────────────────────

export interface DesktopShell {
  getTheme(): any;
  applyTheme(theme: any): void;
  setLocale(locale: string, t: (key: string) => string): void;
}

// ── ApplicationLauncher ─────────────────────────────────────

export interface LaunchContext {
  app: RegisteredApplication;
  type: 'Service' | 'Window' | 'Console' | 'Library';
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

export interface SystemAlert {
  show(title: string, message: string): void;
}

// ── KernelConsole ───────────────────────────────────────────

export interface KernelConsole {
  log(source: string, level: string, message: string): void;
}

// ── NetworkAdapter ──────────────────────────────────────────

export interface NetworkRequest {
  url: string;
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

export interface NetworkResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

export interface AllowlistEntry {
  pattern: string;
  description?: string;
  createdAt: number;
}

export interface NetworkStatus {
  enabled: boolean;
  allowlistCount: number;
  totalRequests: number;
  blockedRequests: number;
}

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

export interface FileTypeAssociation {
  extension: string;
  appDefId: string;
  mimeType?: string;
}

export interface RegistrySnapshot {
  roles: Record<string, string>;
  fileTypes: FileTypeAssociation[];
}

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

export interface DialogOptions {
  mode: DialogMode;
  title?: string;
  extensions?: string[];
  defaultPath?: string;
}

export interface DialogResult {
  cancelled: boolean;
  path?: string;
  tier?: string;
  filename?: string;
}

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
  register(engine: string, runtime: IRuntime): void;
  get(engine: string): IRuntime | undefined;
  getDefault(): IRuntime;
  setDefault(engine: string): void;
  has(engine: string): boolean;
  unregister(engine: string): boolean;
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

// ── Permission Constants ────────────────────────────────────
// 所有權限字串常數，供插件設定 permissions 時參考。

export declare const Permissions: {
  readonly WILDCARD: '*';

  // 程序管理
  readonly PROCESS_TERMINATE: 'process.terminate';
  readonly PROCESS_SUSPEND: 'process.suspend';
  readonly PROCESS_RESUME: 'process.resume';
  readonly PROCESS_LIST: 'process.list';

  // IPC
  readonly IPC_SEND_PARENT: 'process.ipc.send-parent';
  readonly IPC_SEND_CHILD: 'process.ipc.send-child';

  // 檔案系統
  readonly FILE_CROSS_APP: 'file.cross-app';
  readonly FILE_LIST_ALL: 'file.list-all';

  // 視窗
  readonly WINDOW_CREATE: 'window.create';

  // 主控台
  readonly CONSOLE_WRITE: 'console.write';
  readonly CONSOLE_READ: 'console.read';

  // 儲存空間
  readonly STORAGE_USAGE: 'storage.usage';

  // 環境
  readonly ENV_READ: 'env.read';
  readonly ENV_WRITE: 'env.write';
  readonly ENV_AUTOSTART: 'env.autostart';
  readonly ENV_LOAD_LIBRARY: 'env.library.load';

  // Shell
  readonly SHELL_LIST_APPS: 'shell.apps';
  readonly SHELL_LAUNCH: 'shell.launch';
  readonly SHELL_WINDOWS: 'shell.windows';
  readonly SHELL_SYSINFO: 'shell.sysinfo';

  // 通知
  readonly NOTIFICATION_SEND: 'notification.send';

  // 監控
  readonly MONITOR_READ: 'monitor.read';

  // 設定
  readonly SETTINGS_READ: 'settings.read';
  readonly SETTINGS_WRITE: 'settings.write';

  // 網路
  readonly NETWORK_REQUEST: 'network.request';
  readonly NETWORK_STATUS: 'network.status';
  readonly NETWORK_MANAGE: 'network.manage';

  // 註冊表
  readonly REGISTRY_READ: 'registry.read';
  readonly REGISTRY_WRITE: 'registry.write';

  // 對話框
  readonly DIALOG_OPEN: 'dialog.open';
  readonly DIALOG_RESOLVE: 'dialog.resolve';

  // 動態權限（函式）
  eventSubscribe(event: string): string;
  eventEmit(event: string): string;
  processLaunch(appDefId: string): string;
  fileAction(action: 'read' | 'write' | 'delete' | 'list', tier: string): string;
};

// ── Event Name Constants ────────────────────────────────────
// 系統內建的事件名稱常數。

export declare const Events: {
  readonly SERVICE_HEALTH: 'service.health';
  readonly WINDOW_UI: 'window.ui';
  readonly CONSOLE_OUTPUT: 'console.output';
  readonly CONSOLE_INPUT: 'console.input';
  readonly PROCESS_STARTED: 'process.started';
  readonly PROCESS_STOPPED: 'process.stopped';
  readonly NOTIFICATION: 'notification';
  readonly KEYBOARD: 'keyboard';
  readonly LANGUAGE_CHANGED: 'language.changed';
  readonly THEME_CHANGED: 'theme.changed';
};
