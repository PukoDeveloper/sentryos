// ── WindowSystem 型別定義 ───────────────────────────────────

type WindowCommand = 'close' | 'maximize' | 'minimize' | 'focus' | 'restore';

type WindowState = 'normal' | 'minimized' | 'maximized' | 'closed';

type WindowControlType =
    | 'label' | 'button' | 'stack' | 'panel'
    | 'input' | 'textarea' | 'checkbox' | 'select'
    | 'image' | 'separator' | 'progress' | 'list';

type WindowUiEventType = 'click' | 'change' | 'submit' | 'dblclick' | 'contextmenu' | 'contextmenu-select';

interface ContextMenuItem {
    id: string;
    label: string;
    danger?: boolean;
}

interface ContextMenuSeparator {
    separator: true;
}

type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

type WindowSystemError =
    | 'PermissionDenied'
    | 'WindowNotFound'
    | 'NodeNotFound'
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
    fontWeight?: string;
    justifyContent?: string;
    alignItems?: string;
    flexDirection?: 'row' | 'column';
    width?: string;
    height?: string;
    overflow?: string;
    textAlign?: string;
    flex?: string;
    margin?: string;
    opacity?: string;
    cursor?: string;
    [key: string]: string | undefined;
}

interface WindowUiNodeBase {
    id?: string;
    type: WindowControlType;
    style?: WindowUiStyle;
    events?: WindowUiEventType[];
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

interface WindowInputNode extends WindowUiNodeBase {
    type: 'input';
    value?: string;
    placeholder?: string;
}

interface WindowTextareaNode extends WindowUiNodeBase {
    type: 'textarea';
    value?: string;
    placeholder?: string;
    rows?: number;
}

interface WindowCheckboxNode extends WindowUiNodeBase {
    type: 'checkbox';
    checked?: boolean;
    label?: string;
}

interface WindowSelectNode extends WindowUiNodeBase {
    type: 'select';
    options: Array<{ value: string; label: string }>;
    value?: string;
}

interface WindowImageNode extends WindowUiNodeBase {
    type: 'image';
    src: string;
    alt?: string;
}

interface WindowSeparatorNode extends WindowUiNodeBase {
    type: 'separator';
}

interface WindowProgressNode extends WindowUiNodeBase {
    type: 'progress';
    value: number;
    color?: string;
}

interface WindowListNode extends WindowUiNodeBase {
    type: 'list';
    children?: WindowUiNode[];
}

type WindowUiNode =
    | WindowLabelNode | WindowButtonNode | WindowPanelNode | WindowStackNode
    | WindowInputNode | WindowTextareaNode | WindowCheckboxNode | WindowSelectNode
    | WindowImageNode | WindowSeparatorNode | WindowProgressNode | WindowListNode;

interface WindowUiNodePatch {
    text?: string;
    value?: string | number | boolean;
    checked?: boolean;
    style?: WindowUiStyle;
    options?: Array<{ value: string; label: string }>;
    children?: WindowUiNode[];
    src?: string;
    placeholder?: string;
    label?: string;
    color?: string;
    rows?: number;
}

interface WindowUiEvent {
    eventId: string;
    windowId: string;
    processAppId: string;
    type: WindowUiEventType;
    controlId?: string;
    value?: unknown;
    x?: number;
    y?: number;
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
    ContextMenuEntry,
    ContextMenuItem,
    ContextMenuSeparator,
    WindowBounds,
    WindowButtonNode,
    WindowCheckboxNode,
    WindowCommand,
    WindowControlType,
    WindowDescriptor,
    WindowImageNode,
    WindowInitOptions,
    WindowInputNode,
    WindowLabelNode,
    WindowLifecycleEvent,
    WindowListNode,
    WindowPanelNode,
    WindowProcessContext,
    WindowProgressNode,
    WindowSelectNode,
    WindowSeparatorNode,
    WindowStackNode,
    WindowState,
    WindowStyle,
    WindowSystemError,
    WindowSystemResult,
    WindowUiEvent,
    WindowUiEventType,
    WindowUiNode,
    WindowUiNodeBase,
    WindowUiNodePatch,
    WindowUiStyle,
    ConsoleWindowController,
};
