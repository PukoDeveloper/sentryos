import type { Kernel } from '../kernel/Kernel';
import { Permissions, DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT } from '../kernel/constants';
import { uiComponentRegistry } from '../window/UiComponentRegistry';

export function registerUiApi(kernel: Kernel): void {
  const runtimeRegistry = kernel.resolve('runtimeRegistry');
  const permissions = kernel.resolve('permissions');
  const appManager = kernel.resolve('appManager');
  const windowManager = kernel.resolve('windowManager');
  const iconMap = kernel.get('iconMap');

  runtimeRegistry.registerApi('ui', ({ process }) => {
    const app = appManager.get(process.appDefId);
    if (!app) {
      return {};
    }

    // Build node constructors dynamically from the registry
    const nodeBuilders: Record<string, (...args: any[]) => Record<string, unknown>> = {};
    for (const [type, builder] of uiComponentRegistry.getApiBuilders()) {
      nodeBuilders[type] = builder;
    }

    return {
      createWindow: (options: Record<string, unknown>) => {
        if (!permissions.has(process.processAppId, Permissions.WINDOW_CREATE)) {
          return { success: false, error: 'PermissionDenied' };
        }
        const result = windowManager.createWindow(
          {
            processAppId: process.processAppId,
            appDefId: process.appDefId,
            appName: app.name,
            icon: iconMap.get(process.appDefId),
          },
          {
            title: String(options.title ?? app.name),
            width: Number(options.width ?? DEFAULT_WINDOW_WIDTH),
            height: Number(options.height ?? DEFAULT_WINDOW_HEIGHT),
            x: typeof options.x === 'number' ? options.x : undefined,
            y: typeof options.y === 'number' ? options.y : undefined,
            useDefaultFrame: options.useDefaultFrame !== false,
            alwaysOnTop: options.alwaysOnTop === true,
            resizable: options.resizable !== false,
            style: typeof options.style === 'object' ? (options.style as any) : undefined,
          }
        );
        return result;
      },

      // ── Tree 操作 ──────────────────────────────────────────
      initialize: (windowId: string, tree: unknown[], options?: Record<string, unknown>) =>
        windowManager.initializeUi(process.processAppId, windowId, (tree ?? []) as any,
          options ? { preserveScroll: options.preserveScroll === true } : undefined),
      update: (windowId: string, nodeId: string, patch: Record<string, unknown>) =>
        windowManager.updateUi(process.processAppId, windowId, nodeId, patch as any),
      remove: (windowId: string, nodeId: string) =>
        windowManager.removeUiNode(process.processAppId, windowId, nodeId),
      append: (windowId: string, parentId: string, nodes: unknown[]) =>
        windowManager.appendUiNode(process.processAppId, windowId, parentId, (nodes ?? []) as any),

      // ── Window Style ───────────────────────────────────────
      setWindowStyle: (windowId: string, style: Record<string, unknown>) => {
        if (!permissions.has(process.processAppId, Permissions.WINDOW_CREATE)) {
          return { success: false, error: 'PermissionDenied' };
        }
        return windowManager.setWindowStyle(process.processAppId, windowId, style as any);
      },

      // ── Context Menu ───────────────────────────────────────
      showContextMenu: (windowId: string, controlId: string, x: number, y: number, items: unknown[]) =>
        windowManager.showContextMenu(process.processAppId, windowId, controlId, Number(x), Number(y), (items ?? []) as any),
      closeContextMenu: () => windowManager.closeContextMenu(),

      // ── Node 建構器（來自 registry）─────────────────────────
      ...nodeBuilders,
    };
  }, ['window'], 'ui');
}
