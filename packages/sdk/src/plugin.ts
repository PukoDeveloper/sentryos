// ─────────────────────────────────────────────────────────────
// SentryOS SDK — Plugin Development Types
// ─────────────────────────────────────────────────────────────

import type { EventBusResult } from './types';
import type { ApiFactory, IRuntime, RuntimeAdapter, BaseRuntime } from './runtime';
import type { UiComponentRenderer, UiComponentApiBuilder } from './window';
import type { ServiceMap, ValueMap } from './services';

// ── Plugin Module ───────────────────────────────────────────

/**
 * 插件的 default export 必須符合此介面。
 *
 * @example
 * ```js
 * /** @type {import('sentryos-sdk/plugin').SentryPlugin} *\/
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
  on(event: string, listener: (...args: unknown[]) => void): EventBusResult;
  /** 取消訂閱事件 */
  off(event: string, listener: (...args: unknown[]) => void): EventBusResult;
  /** 發射事件 */
  emit(event: string, ...args: unknown[]): EventBusResult;

  // ── Runtime API Registration ────────────────────────────

  /**
   * 為應用程式 runtime 註冊新的 Host API。
   *
   * @param name    - API 命名空間（如 `'monaco'`）
   * @param factory - 工廠函式，為每個 process 建立 API 物件
   * @param gates   - 權限 gate，決定哪些 process 可存取此 API
   * @param group   - 可選的 API 分組名
   */
  registerApi(name: string, factory: ApiFactory, gates?: string[], group?: string): void;
  /** 反註冊 Host API */
  unregisterApi(name: string): boolean;

  // ── UI Component Registration ───────────────────────────

  /**
   * 註冊自訂 UI 元件。
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
   *
   * @param engine  - 引擎識別字串（如 `'lua'`、`'python'`）
   * @param runtime - 實作 IRuntime 介面的引擎實例
   */
  registerRuntime(engine: string, runtime: IRuntime): void;
  /**
   * 從 RuntimeRegistry 反註冊指定引擎。
   *
   * @param engine - 引擎識別字串
   * @returns 引擎是否存在並成功移除
   */
  unregisterRuntime(engine: string): boolean;

  // ── Runtime Factory ─────────────────────────────────────

  /**
   * 以 adapter 模式快速建立 Runtime 引擎（推薦）。
   *
   * @param adapter - 沙箱適配器
   * @returns 完整的 IRuntime 實例，可直接傳給 registerRuntime()
   */
  createRuntime(adapter: RuntimeAdapter): IRuntime;

  /**
   * BaseRuntime 類別參考，供進階插件直接繼承。
   */
  readonly BaseRuntime: typeof BaseRuntime;

  // ── Logging ─────────────────────────────────────────────

  /** 記錄日誌（自動帶 `[plugin:名稱]` 前綴） */
  log(level: 'INFO' | 'WARN' | 'ERROR', message: string): void;

  // ── Cleanup ─────────────────────────────────────────────

  /**
   * 清除所有透過此 context 進行的註冊。
   * PluginManager 在 teardown 後自動呼叫，通常無需手動執行。
   */
  cleanup(): void;
}
