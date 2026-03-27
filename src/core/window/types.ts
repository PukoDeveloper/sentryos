// ── WindowSystem 型別定義 ───────────────────────────────────

type WindowCommand = 'close' | 'maximize' | 'minimize' | 'focus' | 'restore';

type WindowState = 'normal' | 'minimized' | 'maximized' | 'closed';

type WindowControlType = 'label' | 'button' | 'stack' | 'panel';

type WindowUiEventType = 'click';

type WindowSystemError =
    | 'PermissionDenied'
    | 'WindowNotFound'
    | 'Closed'
    | 'InvalidOperation';

type WindowSystemResult<TData = unknown> = {
    success: boolean;
    data?: TData;
    error?: WindowSystemError;
};

interface WindowBounds {
    width: number;
    height: number;
    x: number;
    y: number;
}

interface WindowStyle {
    background?: string;
    color?: string;
    borderRadius?: string;
    border?: string;
    boxShadow?: string;
}

interface WindowInitOptions {
    title: string;
    width: number;
    height: number;
    x?: number;
    y?: number;
    useDefaultFrame?: boolean;
    alwaysOnTop?: boolean;
    resizable?: boolean;
    style?: WindowStyle;
}

interface WindowUiStyle {
    className?: string;
    background?: string;
    color?: string;
    padding?: string;
    gap?: string;
    borderRadius?: string;
    border?: string;
    fontSize?: string;
    justifyContent?: string;
    alignItems?: string;
    flexDirection?: 'row' | 'column';
}

interface WindowUiNodeBase {
    id?: string;
    type: WindowControlType;
    style?: WindowUiStyle;
}

interface WindowLabelNode extends WindowUiNodeBase {
    type: 'label';
    text: string;
}

interface WindowButtonNode extends WindowUiNodeBase {
    type: 'button';
    text: string;
    eventType?: WindowUiEventType;
}

interface WindowPanelNode extends WindowUiNodeBase {
    type: 'panel';
    children?: WindowUiNode[];
}

interface WindowStackNode extends WindowUiNodeBase {
    type: 'stack';
    children?: WindowUiNode[];
}

type WindowUiNode = WindowLabelNode | WindowButtonNode | WindowPanelNode | WindowStackNode;

interface WindowUiEvent {
    eventId: string;
    windowId: string;
    processAppId: string;
    type: WindowUiEventType;
    controlId?: string;
}

interface WindowLifecycleEvent {
    type: 'created' | 'closed' | 'minimized' | 'maximized' | 'restored' | 'focused' | 'resized';
    windowId: string;
    processAppId: string;
    title: string;
    state: WindowState;
    bounds?: WindowBounds;
}

interface WindowDescriptor {
    id: string;
    processAppId: string;
    appDefId: string;
    title: string;
    state: WindowState;
    bounds: WindowBounds;
    useDefaultFrame: boolean;
    alwaysOnTop: boolean;
    resizable: boolean;
    zIndex: number;
    root: HTMLDivElement;
    frame: HTMLDivElement;
    content: HTMLDivElement;
    titleLabel: HTMLDivElement;
    style?: WindowStyle;
    icon?: string;
    stateBeforeMinimize?: WindowState;
}

interface WindowProcessContext {
    processAppId: string;
    appDefId: string;
    appName: string;
    icon?: string;
}

interface ConsoleWindowController {
    windowId: string;
    appendLine(text: string): void;
    appendText(text: string): void;
    clear(): void;
}

export type {
    WindowBounds,
    WindowButtonNode,
    WindowCommand,
    WindowControlType,
    WindowDescriptor,
    WindowInitOptions,
    WindowLabelNode,
    WindowLifecycleEvent,
    WindowPanelNode,
    WindowProcessContext,
    WindowStackNode,
    WindowState,
    WindowStyle,
    WindowSystemError,
    WindowSystemResult,
    WindowUiEvent,
    WindowUiEventType,
    WindowUiNode,
    WindowUiNodeBase,
    WindowUiStyle,
    ConsoleWindowController,
};
