import type { Kernel } from '../kernel/Kernel';
import { Permissions } from '../kernel/constants';
import { uiComponentRegistry } from '../window/UiComponentRegistry';

export function registerIntrospectApi(kernel: Kernel): void {
  const runtimeRegistry = kernel.resolve('runtimeRegistry');
  const permissions = kernel.resolve('permissions');
  const pluginManager = kernel.resolve('pluginManager');

  runtimeRegistry.registerApi('introspectApi', ({ process }) => ({
    /**
     * 取得所有已載入插件的資訊。
     * 回傳陣列，每筆包含 name / version / description / author / loadedAt。
     */
    getPlugins: () => {
      if (!permissions.has(process.processAppId, Permissions.INTROSPECT)) {
        return { success: false, error: 'PermissionDenied' };
      }
      const plugins = pluginManager.getLoadedPlugins().map(p => ({
        name: p.name,
        version: p.version,
        description: p.description ?? null,
        author: p.author ?? null,
        loadedAt: p.loadedAt,
      }));
      return { success: true, data: plugins };
    },

    /**
     * 取得單一插件的詳細資訊。
     * @param name 插件識別名稱（pluginName）
     */
    getPlugin: (name: unknown) => {
      if (!permissions.has(process.processAppId, Permissions.INTROSPECT)) {
        return { success: false, error: 'PermissionDenied' };
      }
      if (typeof name !== 'string') return { success: false, error: 'InvalidArgument' };
      const all = pluginManager.getLoadedPlugins();
      const found = all.find(p => p.name === name);
      if (!found) return { success: false, error: 'NotFound' };
      return {
        success: true,
        data: {
          name: found.name,
          version: found.version,
          description: found.description ?? null,
          author: found.author ?? null,
          loadedAt: found.loadedAt,
        },
      };
    },

    /**
     * 檢查某個插件是否已載入。
     * @param name 插件識別名稱（pluginName）
     */
    isPluginLoaded: (name: unknown) => {
      if (!permissions.has(process.processAppId, Permissions.INTROSPECT)) {
        return { success: false, error: 'PermissionDenied' };
      }
      if (typeof name !== 'string') return { success: false, error: 'InvalidArgument' };
      return { success: true, data: pluginManager.isLoaded(name) };
    },

    /**
     * 取得所有已註冊的 UI 元件類型清單。
     */
    getUiComponents: () => {
      if (!permissions.has(process.processAppId, Permissions.INTROSPECT)) {
        return { success: false, error: 'PermissionDenied' };
      }
      return { success: true, data: uiComponentRegistry.getRegisteredTypes() };
    },

    /**
     * 檢查某個 UI 元件類型是否已被註冊。
     * @param type 元件類型字串（例如 'code-editor'、'video'）
     */
    hasUiComponent: (type: unknown) => {
      if (!permissions.has(process.processAppId, Permissions.INTROSPECT)) {
        return { success: false, error: 'PermissionDenied' };
      }
      if (typeof type !== 'string') return { success: false, error: 'InvalidArgument' };
      return { success: true, data: uiComponentRegistry.hasRenderer(type) };
    },
  }), [], 'introspect');
}
