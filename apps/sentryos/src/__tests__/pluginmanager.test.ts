import { describe, it, expect, vi } from 'vitest';
import { PluginManager } from '../plugin/PluginManager';
import type { PluginModule } from '../plugin/PluginManager';
import { buildKernelWithPermissions } from './helpers/kernel';
import { RuntimeRegistry } from '../runtime/RuntimeRegistry';

// ── Helpers ───────────────────────────────────────────────────

function makePluginManager() {
  const { kernel, systemAppId } = buildKernelWithPermissions();

  // RuntimeRegistry is required by PluginContext.registerApi / registerRuntime
  const runtimeRegistry = new RuntimeRegistry();
  kernel.register('runtimeRegistry', runtimeRegistry);
  kernel.set('systemAppId', systemAppId);

  // EventBus is required by PluginContext.cleanup (called during plugin unload).
  // Use a no-op stub — cleanup only calls eventBus.off() which needs no real logic.
  const eventBusStub = {
    on: () => ({ success: true }),
    off: () => ({ success: true }),
    emit: () => ({ success: true }),
    removeApp: () => undefined,
  };
  kernel.register('eventBus', eventBusStub as unknown as Parameters<typeof kernel.register<'eventBus'>>[1]);

  const pluginManager = new PluginManager(kernel);
  kernel.register('pluginManager', pluginManager);

  return { kernel, systemAppId, pluginManager };
}

function makePlugin(overrides: Partial<PluginModule> = {}): PluginModule {
  return {
    pluginName: 'test-plugin',
    pluginVersion: '1.0.0',
    setup: vi.fn(),
    teardown: vi.fn(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────

describe('PluginManager', () => {
  describe('loadPluginModules()', () => {
    it('loads a valid plugin and calls setup()', async () => {
      const { pluginManager } = makePluginManager();
      const plugin = makePlugin();
      const result = await pluginManager.loadPluginModules([plugin]);
      expect(result.loaded).toContain('test-plugin');
      expect(result.failed).toHaveLength(0);
      expect(plugin.setup).toHaveBeenCalledOnce();
    });

    it('fails if pluginName is missing', async () => {
      const { pluginManager } = makePluginManager();
      const plugin = makePlugin({ pluginName: '' });
      const result = await pluginManager.loadPluginModules([plugin]);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]?.error).toMatch(/pluginName/i);
    });

    it('fails if setup is not a function', async () => {
      const { pluginManager } = makePluginManager();
      const plugin = makePlugin({ setup: 'not-a-function' as unknown as PluginModule['setup'] });
      const result = await pluginManager.loadPluginModules([plugin]);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]?.error).toMatch(/setup/i);
    });

    it('fails if teardown is not a function', async () => {
      const { pluginManager } = makePluginManager();
      const plugin = makePlugin({ teardown: undefined as unknown as PluginModule['teardown'] });
      const result = await pluginManager.loadPluginModules([plugin]);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]?.error).toMatch(/teardown/i);
    });

    it('fails if the same plugin is loaded twice', async () => {
      const { pluginManager } = makePluginManager();
      const plugin = makePlugin();
      await pluginManager.loadPluginModules([plugin]);
      const result = await pluginManager.loadPluginModules([plugin]);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]?.error).toMatch(/already loaded/i);
    });

    it('loads multiple plugins in one call', async () => {
      const { pluginManager } = makePluginManager();
      const plugins = [
        makePlugin({ pluginName: 'plugin-a' }),
        makePlugin({ pluginName: 'plugin-b' }),
      ];
      const result = await pluginManager.loadPluginModules(plugins);
      expect(result.loaded).toContain('plugin-a');
      expect(result.loaded).toContain('plugin-b');
      expect(result.failed).toHaveLength(0);
    });

    it('handles setup() that throws — marks plugin as failed', async () => {
      const { pluginManager } = makePluginManager();
      const plugin = makePlugin({
        setup: vi.fn().mockRejectedValue(new Error('boot error')),
      });
      const result = await pluginManager.loadPluginModules([plugin]);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]?.error).toContain('boot error');
    });
  });

  describe('dependency ordering', () => {
    it('calls setup() of the dependency before the dependent', async () => {
      const { pluginManager } = makePluginManager();
      const order: string[] = [];
      const base = makePlugin({
        pluginName: 'base',
        setup: vi.fn(() => { order.push('base'); }),
      });
      const ext = makePlugin({
        pluginName: 'ext',
        dependencies: ['base'],
        setup: vi.fn(() => { order.push('ext'); }),
      });
      await pluginManager.loadPluginModules([ext, base]);
      expect(order).toEqual(['base', 'ext']);
    });

    it('fails a plugin whose dependency is missing', async () => {
      const { pluginManager } = makePluginManager();
      const plugin = makePlugin({
        pluginName: 'needs-base',
        dependencies: ['nonexistent-dep'],
      });
      const result = await pluginManager.loadPluginModules([plugin]);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]?.error).toMatch(/not available/i);
    });

    it('fails plugins that form a circular dependency', async () => {
      const { pluginManager } = makePluginManager();
      const a = makePlugin({ pluginName: 'a', dependencies: ['b'] });
      const b = makePlugin({ pluginName: 'b', dependencies: ['a'] });
      const result = await pluginManager.loadPluginModules([a, b]);
      expect(result.failed.length).toBeGreaterThan(0);
      const errors = result.failed.map(f => f.error);
      expect(errors.some(e => /circular/i.test(e))).toBe(true);
    });

    it('satisfies dependencies already loaded in a prior call', async () => {
      const { pluginManager } = makePluginManager();
      const base = makePlugin({ pluginName: 'base' });
      await pluginManager.loadPluginModules([base]);

      const ext = makePlugin({
        pluginName: 'ext',
        dependencies: ['base'],
      });
      const result = await pluginManager.loadPluginModules([ext]);
      expect(result.loaded).toContain('ext');
      expect(result.failed).toHaveLength(0);
    });
  });

  describe('unloadPlugin()', () => {
    it('calls teardown() and marks plugin as unloaded', async () => {
      const { pluginManager } = makePluginManager();
      const plugin = makePlugin();
      await pluginManager.loadPluginModules([plugin]);

      const result = await pluginManager.unloadPlugin('test-plugin');
      expect(result.unloaded).toContain('test-plugin');
      expect(plugin.teardown).toHaveBeenCalledOnce();
      expect(pluginManager.isLoaded('test-plugin')).toBe(false);
    });

    it('throws if the plugin is not loaded', async () => {
      const { pluginManager } = makePluginManager();
      await expect(pluginManager.unloadPlugin('nonexistent')).rejects.toThrow();
    });

    it("soft mode aborts if dependents are present", async () => {
      const { pluginManager } = makePluginManager();
      const base = makePlugin({ pluginName: 'base' });
      const ext = makePlugin({ pluginName: 'ext', dependencies: ['base'] });
      await pluginManager.loadPluginModules([base, ext]);

      await expect(pluginManager.unloadPlugin('base', 'soft')).rejects.toThrow(/depend/i);
    });

    it("root mode unloads dependents before the target", async () => {
      const { pluginManager } = makePluginManager();
      const teardownOrder: string[] = [];
      const base = makePlugin({
        pluginName: 'base',
        teardown: vi.fn(() => { teardownOrder.push('base'); }),
      });
      const ext = makePlugin({
        pluginName: 'ext',
        dependencies: ['base'],
        teardown: vi.fn(() => { teardownOrder.push('ext'); }),
      });
      await pluginManager.loadPluginModules([base, ext]);

      const result = await pluginManager.unloadPlugin('base', 'root');
      expect(result.unloaded).toContain('base');
      expect(result.unloaded).toContain('ext');
      // ext (dependent) should be torn down before base
      expect(teardownOrder.indexOf('ext')).toBeLessThan(teardownOrder.indexOf('base'));
    });

    it("force mode unloads the plugin even with dependents", async () => {
      const { pluginManager } = makePluginManager();
      const base = makePlugin({ pluginName: 'base' });
      const ext = makePlugin({ pluginName: 'ext', dependencies: ['base'] });
      await pluginManager.loadPluginModules([base, ext]);

      const result = await pluginManager.unloadPlugin('base', 'force');
      expect(result.unloaded).toContain('base');
    });
  });

  describe('unloadAll()', () => {
    it('unloads all plugins', async () => {
      const { pluginManager } = makePluginManager();
      await pluginManager.loadPluginModules([
        makePlugin({ pluginName: 'a' }),
        makePlugin({ pluginName: 'b' }),
      ]);

      await pluginManager.unloadAll();
      expect(pluginManager.isLoaded('a')).toBe(false);
      expect(pluginManager.isLoaded('b')).toBe(false);
    });
  });

  describe('getLoadedPlugins()', () => {
    it('returns metadata for all loaded plugins', async () => {
      const { pluginManager } = makePluginManager();
      const plugin = makePlugin({ pluginName: 'meta-test', pluginVersion: '2.0.0' });
      await pluginManager.loadPluginModules([plugin]);

      const list = pluginManager.getLoadedPlugins();
      expect(list).toHaveLength(1);
      expect(list[0]?.name).toBe('meta-test');
      expect(list[0]?.version).toBe('2.0.0');
    });

    it('returns an empty list when no plugins are loaded', () => {
      const { pluginManager } = makePluginManager();
      expect(pluginManager.getLoadedPlugins()).toHaveLength(0);
    });
  });
});
