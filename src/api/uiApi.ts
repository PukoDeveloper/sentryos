import type { Kernel } from '../core/Kernel';
import { Permissions, DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT } from '../core/constants';

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
      initialize: (windowId: string, tree: unknown[]) =>
        windowManager.initializeUi(process.processAppId, windowId, (tree ?? []) as any),
      label: (text: string, style?: Record<string, string>, id?: string) => ({ type: 'label', text, style, id }),
      button: (text: string, style?: Record<string, string>, id?: string) => ({ type: 'button', text, style, id }),
      stack: (children: unknown[], style?: Record<string, string>, id?: string) => ({ type: 'stack', children, style, id }),
      panel: (children: unknown[], style?: Record<string, string>, id?: string) => ({ type: 'panel', children, style, id }),
    };
  }, 'window');
}
