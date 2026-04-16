import type { Kernel } from '../kernel/Kernel';
import { PluginContext } from './PluginContext';
import { ID_PREFIX_PLUGIN, Permissions } from '../kernel/constants';

export interface PluginModule {
  pluginName: string;
  pluginVersion: string;
  pluginDescription?: string;
  author?: string;
  permissions?: string[];
  /** Names of other plugins that must be set up before this one. */
  dependencies?: string[];
  setup: (context: PluginContext) => void | Promise<void>;
  teardown: (context: PluginContext) => void | Promise<void>;
}

export interface LoadedPlugin {
  module: PluginModule;
  context: PluginContext;
  path: string;
  loadedAt: number;
}

type PluginEntry = { path: string; module: PluginModule };

export class PluginManager {
  private readonly kernel: Kernel;
  private readonly plugins = new Map<string, LoadedPlugin>();

  constructor(kernel: Kernel) {
    this.kernel = kernel;
  }

  /**
   * Phase 1 – fetch & import all plugins in parallel.
   * Phase 2 – topologically sort by `dependencies`.
   * Phase 3 – call `setup()` in dependency order.
   */
  async loadPlugins(pluginPaths: string[]): Promise<{ loaded: string[]; failed: { path: string; error: string }[] }> {
    const loaded: string[] = [];
    const failed: { path: string; error: string }[] = [];

    // Phase 1: import all modules in parallel (no setup yet)
    const fetchResults = await Promise.allSettled(
      pluginPaths.map(async (path): Promise<PluginEntry> => ({ path, module: await this.fetchPluginModule(path) })),
    );

    const entries: PluginEntry[] = [];
    for (let i = 0; i < fetchResults.length; i++) {
      const result = fetchResults[i];
      const path = pluginPaths[i];
      if (result.status === 'rejected') {
        failed.push({ path, error: result.reason instanceof Error ? result.reason.message : String(result.reason) });
      } else {
        const entry = result.value;
        if (this.plugins.has(entry.module.pluginName)) {
          failed.push({ path, error: `Plugin "${entry.module.pluginName}" is already loaded` });
        } else {
          entries.push(entry);
        }
      }
    }

    // Phase 2: sort by dependencies
    const { sorted, failed: sortFailed } = this.sortByDependencies(entries);
    failed.push(...sortFailed);

    // Phase 3: setup in dependency order
    for (const { path, module } of sorted) {
      try {
        await this.setupPlugin(path, module);
        loaded.push(path);
      } catch (err) {
        failed.push({ path, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return { loaded, failed };
  }

  async loadPlugin(path: string): Promise<void> {
    const plugin = await this.fetchPluginModule(path);
    await this.setupPlugin(path, plugin);
  }

  // ── Private helpers ───────────────────────────────────────────

  /** Fetch, import, and validate a plugin module without calling setup(). */
  private async fetchPluginModule(path: string): Promise<PluginModule> {
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

    return plugin;
  }

  /**
   * Topological sort (Kahn's algorithm) on a batch of plugin entries.
   * Dependencies already present in `this.plugins` are treated as satisfied.
   * Returns `{ sorted, failed }` where `failed` contains entries whose
   * dependencies are missing or whose graph has a cycle.
   */
  private sortByDependencies(entries: PluginEntry[]): { sorted: PluginEntry[]; failed: { path: string; error: string }[] } {
    const byName = new Map<string, PluginEntry>();
    for (const entry of entries) {
      byName.set(entry.module.pluginName, entry);
    }

    const alreadyLoaded = new Set(this.plugins.keys());
    const failed: { path: string; error: string }[] = [];

    // inDegree: number of unsatisfied deps within this batch
    const inDegree = new Map<string, number>();
    // dependentsOf[dep] = list of plugin names in this batch that depend on dep
    const dependentsOf = new Map<string, string[]>();

    for (const entry of entries) {
      const name = entry.module.pluginName;
      if (!inDegree.has(name)) inDegree.set(name, 0);

      for (const dep of entry.module.dependencies ?? []) {
        if (alreadyLoaded.has(dep)) continue; // already satisfied

        if (!byName.has(dep)) {
          failed.push({ path: entry.path, error: `Plugin "${name}" depends on "${dep}" which is not available` });
          byName.delete(name); // exclude from sort
          inDegree.delete(name);
          break;
        }

        if (!dependentsOf.has(dep)) dependentsOf.set(dep, []);
        dependentsOf.get(dep)!.push(name);
        inDegree.set(name, (inDegree.get(name) ?? 0) + 1);
      }
    }

    // Start with nodes that have no pending deps
    const queue: string[] = [];
    for (const [name, deg] of inDegree) {
      if (byName.has(name) && deg === 0) queue.push(name);
    }

    const sorted: PluginEntry[] = [];
    while (queue.length > 0) {
      const name = queue.shift()!;
      sorted.push(byName.get(name)!);
      for (const dependent of dependentsOf.get(name) ?? []) {
        if (!byName.has(dependent)) continue;
        const newDeg = (inDegree.get(dependent) ?? 1) - 1;
        inDegree.set(dependent, newDeg);
        if (newDeg === 0) queue.push(dependent);
      }
    }

    // Any remaining entry in byName that wasn't sorted is part of a cycle
    for (const [name, entry] of byName) {
      if (!sorted.find(s => s.module.pluginName === name)) {
        failed.push({ path: entry.path, error: `Plugin "${name}" has a circular dependency and cannot be loaded` });
      }
    }

    return { sorted, failed };
  }

  /** Register permissions for a plugin and call its setup() function. */
  private async setupPlugin(path: string, plugin: PluginModule): Promise<void> {
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
