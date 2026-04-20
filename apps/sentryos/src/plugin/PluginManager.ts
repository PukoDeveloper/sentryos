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

/**
 * Controls the behaviour of `unloadPlugin` when other loaded plugins depend
 * on the plugin being unloaded:
 *
 * - `'soft'` *(default)* – abort and throw if any loaded plugin declares a
 *   dependency on the target plugin.
 * - `'root'` – recursively unload all plugins that transitively depend on the
 *   target (dependents first), then unload the target itself. Returns the full
 *   list of unloaded plugin names.
 * - `'force'` – unload the target plugin unconditionally, ignoring dependents.
 */
export type UnloadMode = 'soft' | 'root' | 'force';

export interface UnloadResult {
  /** Names of all plugins that were actually unloaded. */
  unloaded: string[];
}

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
    const sortedNames = new Set<string>();
    let head = 0; // avoid O(n) shift() on every iteration
    while (head < queue.length) {
      const name = queue[head++];
      sorted.push(byName.get(name)!);
      sortedNames.add(name);
      for (const dependent of dependentsOf.get(name) ?? []) {
        if (!byName.has(dependent)) continue;
        const newDeg = (inDegree.get(dependent) ?? 1) - 1;
        inDegree.set(dependent, newDeg);
        if (newDeg === 0) queue.push(dependent);
      }
    }

    // Any remaining entry in byName that wasn't sorted is part of a cycle
    for (const [name, entry] of byName) {
      if (!sortedNames.has(name)) {
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

  async unloadPlugin(name: string, mode: UnloadMode = 'soft'): Promise<UnloadResult> {
    if (!this.plugins.has(name)) {
      throw new Error(`Plugin "${name}" is not loaded`);
    }

    const directDependents = this.getDirectDependents(name);

    if (mode === 'soft') {
      if (directDependents.length > 0) {
        throw new Error(
          `Plugin "${name}" cannot be unloaded: [${directDependents.join(', ')}] depend on it. ` +
          `Use 'root' mode to unload all dependents, or 'force' to unload unconditionally.`,
        );
      }
      await this.teardownOne(name);
      return { unloaded: [name] };
    }

    if (mode === 'force') {
      await this.teardownOne(name);
      return { unloaded: [name] };
    }

    // 'root' mode: unload all transitive dependents first, then the target
    const ordered = this.getTransitiveDependentsOrdered(name);
    const unloaded: string[] = [];
    for (const n of ordered) {
      await this.teardownOne(n);
      unloaded.push(n);
    }
    return { unloaded };
  }

  async unloadAll(): Promise<void> {
    // Unload in reverse insertion order, force mode to skip dependency checks
    const names = [...this.plugins.keys()].reverse();
    for (const name of names) {
      await this.teardownOne(name);
    }
  }

  // ── Unload helpers ────────────────────────────────────────────

  /** Call teardown(), cleanup(), and remove a single plugin from the map. */
  private async teardownOne(name: string): Promise<void> {
    const entry = this.plugins.get(name);
    if (!entry) return;
    await entry.module.teardown(entry.context);
    entry.context.cleanup();
    this.plugins.delete(name);
  }

  /** Returns names of loaded plugins that directly list `name` as a dependency. */
  private getDirectDependents(name: string): string[] {
    const result: string[] = [];
    for (const [pName, entry] of this.plugins) {
      if (pName !== name && (entry.module.dependencies ?? []).includes(name)) {
        result.push(pName);
      }
    }
    return result;
  }

  /**
   * Returns all plugins to be unloaded for a 'root' unload of `name`,
   * ordered so that dependents come before their dependencies
   * (i.e. safe teardown order). The target `name` is always last.
   */
  private getTransitiveDependentsOrdered(name: string): string[] {
    // BFS: collect full set of transitive dependents
    const visited = new Set<string>();
    const queue: string[] = [name];
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      if (visited.has(current)) continue;
      visited.add(current);
      for (const dependent of this.getDirectDependents(current)) {
        if (!visited.has(dependent)) queue.push(dependent);
      }
    }

    // Topological sort within `visited` so dependents appear before dependencies.
    // Build inDegree counting edges *within* the visited subgraph only.
    const inDegree = new Map<string, number>();
    const edgesFrom = new Map<string, string[]>(); // dep → [dependents]
    for (const n of visited) {
      if (!inDegree.has(n)) inDegree.set(n, 0);
      for (const dep of this.plugins.get(n)?.module.dependencies ?? []) {
        if (!visited.has(dep)) continue; // cross-subgraph edge, ignore
        if (!edgesFrom.has(dep)) edgesFrom.set(dep, []);
        edgesFrom.get(dep)!.push(n);
        inDegree.set(n, (inDegree.get(n) ?? 0) + 1);
      }
    }

    // Kahn's: plugins with no unsatisfied deps (within subgraph) first.
    // inDegree[n] counts how many of n's dependencies are inside the subgraph.
    // Nodes with inDegree 0 have no in-subgraph deps → they are the providers /
    // roots (e.g. the unload target) and are processed first by Kahn's,
    // producing dependency-installation order: providers first, consumers last.
    const sortQ: string[] = [];
    for (const [n, deg] of inDegree) {
      if (deg === 0) sortQ.push(n);
    }
    const ordered: string[] = [];
    let sortHead = 0;
    while (sortHead < sortQ.length) {
      const n = sortQ[sortHead++];
      ordered.push(n);
      for (const dependent of edgesFrom.get(n) ?? []) {
        const newDeg = (inDegree.get(dependent) ?? 1) - 1;
        inDegree.set(dependent, newDeg);
        if (newDeg === 0) sortQ.push(dependent);
      }
    }

    // `ordered` is in dependency-installation order (providers first, consumers last).
    // Reversing gives safe teardown order: consumers (dependents) unloaded first,
    // the target plugin (provider) unloaded last.
    // Safety fallback: include any nodes excluded due to an unexpected cycle.
    const orderedSet = new Set(ordered);
    for (const n of visited) {
      if (!orderedSet.has(n)) ordered.push(n);
    }
    return ordered.reverse();
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
