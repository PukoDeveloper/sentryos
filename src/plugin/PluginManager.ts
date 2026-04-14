import type { Kernel } from '../kernel/Kernel';
import { PluginContext } from './PluginContext';
import { ID_PREFIX_PLUGIN, Permissions } from '../kernel/constants';

export interface PluginModule {
  pluginName: string;
  pluginVersion: string;
  pluginDescription?: string;
  author?: string;
  permissions?: string[];
  setup: (context: PluginContext) => void | Promise<void>;
  teardown: (context: PluginContext) => void | Promise<void>;
}

export interface LoadedPlugin {
  module: PluginModule;
  context: PluginContext;
  path: string;
  loadedAt: number;
}

export class PluginManager {
  private readonly kernel: Kernel;
  private readonly plugins = new Map<string, LoadedPlugin>();

  constructor(kernel: Kernel) {
    this.kernel = kernel;
  }

  async loadPlugins(pluginPaths: string[]): Promise<{ loaded: string[]; failed: { path: string; error: string }[] }> {
    const loaded: string[] = [];
    const failed: { path: string; error: string }[] = [];

    for (const path of pluginPaths) {
      try {
        await this.loadPlugin(path);
        loaded.push(path);
      } catch (err) {
        failed.push({ path, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return { loaded, failed };
  }

  async loadPlugin(path: string): Promise<void> {
    // Fetch as text and import via blob URL to bypass Vite's /public restriction
    const res = await fetch(path);
    if (!res.ok) {
      throw new Error(`Failed to fetch plugin "${path}": ${res.status} ${res.statusText}`);
    }
    const source = await res.text();
    const blob = new Blob([source], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    let mod: Record<string, unknown>;
    try {
      mod = await import(/* @vite-ignore */ blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
    const plugin: PluginModule = (mod.default ?? mod) as PluginModule;

    if (typeof plugin.setup !== 'function') {
      throw new Error(`Plugin at "${path}" does not export a setup function`);
    }
    if (typeof plugin.teardown !== 'function') {
      throw new Error(`Plugin at "${path}" does not export a teardown function`);
    }
    if (!plugin.pluginName || typeof plugin.pluginName !== 'string') {
      throw new Error(`Plugin at "${path}" does not have a valid pluginName`);
    }

    if (this.plugins.has(plugin.pluginName)) {
      throw new Error(`Plugin "${plugin.pluginName}" is already loaded`);
    }

    // Create a plugin-scoped appId with permissions
    const pluginAppId = `${ID_PREFIX_PLUGIN}${plugin.pluginName}`;
    const permissions = this.kernel.resolve('permissions');
    const systemAppId = this.kernel.get('systemAppId');
    const pluginPerms = plugin.permissions ?? [Permissions.WILDCARD];
    permissions.registerAppId(systemAppId, pluginAppId, pluginPerms);

    const context = new PluginContext(plugin.pluginName, pluginAppId, this.kernel);
    await plugin.setup(context);

    this.plugins.set(plugin.pluginName, {
      module: plugin,
      context,
      path,
      loadedAt: Date.now(),
    });
  }

  async unloadPlugin(name: string): Promise<void> {
    const entry = this.plugins.get(name);
    if (!entry) {
      throw new Error(`Plugin "${name}" is not loaded`);
    }

    await entry.module.teardown(entry.context);
    entry.context.cleanup();
    this.plugins.delete(name);
  }

  async unloadAll(): Promise<void> {
    // Unload in reverse insertion order
    const names = [...this.plugins.keys()].reverse();
    for (const name of names) {
      await this.unloadPlugin(name);
    }
  }

  getLoadedPlugins(): { name: string; version: string; description?: string; author?: string; path: string; loadedAt: number }[] {
    return [...this.plugins.values()].map(entry => ({
      name: entry.module.pluginName,
      version: entry.module.pluginVersion,
      description: entry.module.pluginDescription,
      author: entry.module.author,
      path: entry.path,
      loadedAt: entry.loadedAt,
    }));
  }

  isLoaded(name: string): boolean {
    return this.plugins.has(name);
  }
}
