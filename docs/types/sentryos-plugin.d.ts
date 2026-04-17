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
   * 插件初始化。系統啟動時呼叫，接收 PluginContext。
   * 所有透過 context 進行的註冊（API、UI 元件、事件監聽）
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

  // ── Logging ─────────────────────────────────────────────

  /** 記錄日誌（自動帶 `[plugin:名稱]` 前綴） */
  log(level: 'INFO' | 'WARN' | 'ERROR', message: string): void;
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

// ── Kernel Service Map ──────────────────────────────────────
// 以下為 Kernel 中可透過 context.resolve() 取得的服務鍵值。
// 各服務的完整 API 請參考 SentryOS 原始碼。

export interface ServiceMap {
  permissions: any;
  eventBus: any;
  appManager: any;
  processManager: any;
  runtime: any;
  fileSystem: any;
  windowManager: any;
  environmentManager: any;
  notificationManager: any;
  systemMonitor: any;
  desktopShell: any;
  applicationLauncher: any;
  systemAlert: any;
  kernelConsole: any;
  networkManager: any;
  systemRegistry: any;
  dialogManager: any;
  pluginManager: any;
}

export interface ValueMap {
  systemAppId: string;
  userAppId: string;
  bootStartTime: number;
  catalogApps: any[];
  iconMap: Map<string, string>;
  consoleControllers: Map<string, any>;
}
