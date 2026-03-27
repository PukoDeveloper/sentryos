// ── Barrel re-export ────────────────────────────────────────
// 原始內容已拆分至 window/ 目錄
export {
    WindowManager,
    ApplicationWindowApi,
    WindowUiApi,
    createWindowApis,
} from './window';

export type {
    WindowBounds,
    WindowCommand,
    WindowDescriptor,
    WindowInitOptions,
    WindowPanelNode,
    WindowProcessContext,
    WindowState,
    WindowStyle,
    WindowSystemError,
    WindowSystemResult,
    WindowUiEvent,
    WindowLifecycleEvent,
    WindowUiEventType,
    WindowUiNode,
    WindowUiStyle,
    ConsoleWindowController,
} from './window';