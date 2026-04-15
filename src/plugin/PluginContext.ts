import type { Kernel } from '../kernel/Kernel';
import type { EventBusResult } from '../kernel/types';
import type { UiComponentRenderer, UiComponentApiBuilder } from '../window/UiComponentRegistry';
import { uiComponentRegistry } from '../window/UiComponentRegistry';
import type { ApiFactory } from '../runtime/types';

/**
 * 每個插件在 setup/teardown 時取得的上下文。
 * 所有透過 context 進行的註冊皆自動追蹤，卸載時反註冊。
 */
export class PluginContext {
  readonly pluginName: string;
  readonly pluginAppId: string;
  private readonly kernel: Kernel;

  // ── cleanup tracking ──
  private readonly registeredApis: string[] = [];
  private readonly registeredUiComponents: string[] = [];
  private readonly eventListeners: { event: string; listener: (...args: any[]) => void }[] = [];

  constructor(pluginName: string, pluginAppId: string, kernel: Kernel) {
    this.pluginName = pluginName;
    this.pluginAppId = pluginAppId;
    this.kernel = kernel;
  }

  // ── Kernel access ─────────────────────────────────────────

  /** 取得 Kernel 中的服務 */
  resolve<K extends Parameters<Kernel['resolve']>[0]>(key: K): ReturnType<Kernel['resolve']> {
    return this.kernel.resolve(key);
  }

  /** 取得 Kernel 中的值 */
  get<K extends Parameters<Kernel['get']>[0]>(key: K): ReturnType<Kernel['get']> {
    return this.kernel.get(key);
  }

  // ── Event Bus (scoped to plugin appId) ────────────────────

  on(event: string, listener: (...args: any[]) => void): EventBusResult {
    const eventBus = this.kernel.resolve('eventBus');
    const result = eventBus.on(this.pluginAppId, event, listener);
    if (result.success) {
      this.eventListeners.push({ event, listener });
    }
    return result;
  }

  off(event: string, listener: (...args: any[]) => void): EventBusResult {
    const eventBus = this.kernel.resolve('eventBus');
    const result = eventBus.off(this.pluginAppId, event, listener);
    if (result.success) {
      const idx = this.eventListeners.findIndex(e => e.event === event && e.listener === listener);
      if (idx !== -1) this.eventListeners.splice(idx, 1);
    }
    return result;
  }

  emit(event: string, ...args: any[]): EventBusResult {
    const eventBus = this.kernel.resolve('eventBus');
    return eventBus.emit(this.pluginAppId, event, ...args);
  }

  // ── Runtime API registration ──────────────────────────────

  registerApi(name: string, factory: ApiFactory, gates: string[] = [], group?: string): void {
    const runtime = this.kernel.resolve('runtime');
    runtime.registerApi(name, factory, gates, group);
    this.registeredApis.push(name);
  }

  unregisterApi(name: string): boolean {
    const runtime = this.kernel.resolve('runtime');
    const result = runtime.unregisterApi(name);
    if (result) {
      const idx = this.registeredApis.indexOf(name);
      if (idx !== -1) this.registeredApis.splice(idx, 1);
    }
    return result;
  }

  // ── UI Component registration ─────────────────────────────

  registerUiComponent(type: string, renderer: UiComponentRenderer, apiBuilder: UiComponentApiBuilder): void {
    uiComponentRegistry.register(type, renderer, apiBuilder);
    this.registeredUiComponents.push(type);
  }

  unregisterUiComponent(type: string): boolean {
    const result = uiComponentRegistry.unregister(type);
    if (result) {
      const idx = this.registeredUiComponents.indexOf(type);
      if (idx !== -1) this.registeredUiComponents.splice(idx, 1);
    }
    return result;
  }

  // ── Logging ───────────────────────────────────────────────

  log(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
    if (this.kernel.has('kernelConsole')) {
      const kernelConsole = this.kernel.resolve('kernelConsole');
      (kernelConsole as any).log?.(`plugin:${this.pluginName}`, level, message);
    }
    const prefix = `[plugin:${this.pluginName}]`;
    switch (level) {
      case 'WARN': console.warn(prefix, message); break;
      case 'ERROR': console.error(prefix, message); break;
      default: console.log(prefix, message); break;
    }
  }

  // ── Cleanup (called by PluginManager on teardown) ─────────

  /** 清除所有透過此 context 進行的註冊 */
  cleanup(): void {
    // Remove event listeners
    const eventBus = this.kernel.resolve('eventBus');
    for (const { event, listener } of this.eventListeners) {
      eventBus.off(this.pluginAppId, event, listener);
    }
    this.eventListeners.length = 0;

    // Remove registered APIs
    const runtime = this.kernel.resolve('runtime');
    for (const name of this.registeredApis) {
      runtime.unregisterApi(name);
    }
    this.registeredApis.length = 0;

    // Remove registered UI components
    for (const type of this.registeredUiComponents) {
      uiComponentRegistry.unregister(type);
    }
    this.registeredUiComponents.length = 0;
  }
}
