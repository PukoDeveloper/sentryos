import type { Kernel } from '../kernel/Kernel';
import { Permissions, DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT } from '../kernel/constants';

export function registerUiApi(kernel: Kernel): void {
  const runtime = kernel.resolve('runtime');
  const permissions = kernel.resolve('permissions');
  const appManager = kernel.resolve('appManager');
  const windowManager = kernel.resolve('windowManager');
  const iconMap = kernel.get('iconMap');

  runtime.registerApi('ui', ({ process }) => {
    const app = appManager.get(process.appDefId);
    if (!app) {
      return {};
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
      initialize: (windowId: string, tree: unknown[]) =>
        windowManager.initializeUi(process.processAppId, windowId, (tree ?? []) as any),
      update: (windowId: string, nodeId: string, patch: Record<string, unknown>) =>
        windowManager.updateUi(process.processAppId, windowId, nodeId, patch as any),
      remove: (windowId: string, nodeId: string) =>
        windowManager.removeUiNode(process.processAppId, windowId, nodeId),
      append: (windowId: string, parentId: string, nodes: unknown[]) =>
        windowManager.appendUiNode(process.processAppId, windowId, parentId, (nodes ?? []) as any),

      // ── Node 建構器 ────────────────────────────────────────
      label: (text: string, style?: Record<string, string>, id?: string) =>
        ({ type: 'label', text, style, id }),
      button: (text: string, style?: Record<string, string>, id?: string) =>
        ({ type: 'button', text, style, id }),
      stack: (children: unknown[], style?: Record<string, string>, id?: string) =>
        ({ type: 'stack', children, style, id }),
      panel: (children: unknown[], style?: Record<string, string>, id?: string) =>
        ({ type: 'panel', children, style, id }),
      input: (value?: string, placeholder?: string, style?: Record<string, string>, id?: string) =>
        ({ type: 'input', value, placeholder, style, id }),
      checkbox: (checked?: boolean, label?: string, style?: Record<string, string>, id?: string) =>
        ({ type: 'checkbox', checked, label, style, id }),
      select: (options: unknown[], value?: string, style?: Record<string, string>, id?: string) =>
        ({ type: 'select', options, value, style, id }),
      image: (src: string, alt?: string, style?: Record<string, string>, id?: string) =>
        ({ type: 'image', src, alt, style, id }),
      separator: (style?: Record<string, string>, id?: string) =>
        ({ type: 'separator', style, id }),
      progress: (value: number, color?: string, style?: Record<string, string>, id?: string) =>
        ({ type: 'progress', value, color, style, id }),
      list: (children: unknown[], style?: Record<string, string>, id?: string) =>
        ({ type: 'list', children, style, id }),
    };
  }, 'window');
}
