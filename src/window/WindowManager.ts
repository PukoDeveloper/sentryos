import {
    Z_INDEX_WINDOW_BASE, Z_INDEX_ALWAYS_ON_TOP_OFFSET,
    WINDOW_CASCADE_X_OFFSET, WINDOW_CASCADE_Y_OFFSET, WINDOW_CASCADE_INCREMENT,
    MAXIMIZED_WINDOW_MARGIN, MAXIMIZED_TASKBAR_HEIGHT,
    DEFAULT_CONSOLE_WIDTH, DEFAULT_CONSOLE_HEIGHT,
    WINDOW_SNAP_THRESHOLD,
} from '../kernel/constants';
import type {
    WindowBounds,
    ContextMenuEntry,
    InitializeUiOptions,
    WindowDescriptor,
    WindowInitOptions,
    WindowLifecycleEvent,
    WindowProcessContext,
    WindowState,
    WindowStyle,
    WindowSystemResult,
    WindowUiEvent,
    WindowUiNode,
    WindowUiNodePatch,
    WindowUiStyle,
    ConsoleWindowController,
} from './types';
import { uiComponentRegistry } from './UiComponentRegistry';
import type { RenderContext } from './UiComponentRegistry';
import { renderAnsiLine } from '../console/AnsiParser';
import { toIterable } from './toIterable';
import './builtinComponents';

const ANIM_CLOSE_MS    = 220;
const ANIM_MINIMIZE_MS = 280;
const ANIM_RESTORE_MS  = 300;
const ANIM_LAYOUT_MS   = 300;
const ANIM_OPEN_MS     = 280;

class WindowManager {
    private readonly host: HTMLElement;
    private readonly windows = new Map<string, WindowDescriptor>();
    private readonly processWindows = new Map<string, Set<string>>();
    private readonly eventBindings = new Map<string, WindowUiEvent>();
    private readonly windowNodeMaps = new Map<string, Map<string, HTMLElement>>();
    private readonly uiEventHandler: (event: WindowUiEvent) => void;
    private zCounter = Z_INDEX_WINDOW_BASE;
    private windowCounter = 0;
    private eventCounter = 0;
    private focusedWindowId: string | null = null;
    private windowChangeListener?: (event: WindowLifecycleEvent) => void;
    private contextMenuEl: HTMLElement | null = null;
    private contextMenuCloseHandler: ((e: MouseEvent) => void) | null = null;
    private maximizedTaskbarHeight = MAXIMIZED_TASKBAR_HEIGHT;
    /** 被 modal 鎖定的視窗 → 遮罩元素 */
    private readonly blockedOverlays = new Map<string, HTMLElement>();
    /** 每個程序的視窗建立時間戳（用於速率限制） */
    private readonly windowCreationTimes = new Map<string, number[]>();
    private static readonly WINDOW_RATE_LIMIT = 10;
    private static readonly WINDOW_RATE_WINDOW_MS = 1000;
    /** 貼靠預覽遮罩 */
    private snapPreviewEl: HTMLElement | null = null;

    constructor(host: HTMLElement, uiEventHandler: (event: WindowUiEvent) => void) {
        this.host = host;
        this.uiEventHandler = uiEventHandler;
    }

    setWindowChangeListener(listener: (event: WindowLifecycleEvent) => void): void {
        this.windowChangeListener = listener;
    }

    /** 清理所有視窗、DOM 元素及內部狀態。應在系統關閉時呼叫。 */
    destroy(): void {
        this.closeContextMenu();
        this.hideSnapPreview();
        for (const descriptor of this.windows.values()) {
            descriptor.root.remove();
        }
        for (const overlay of this.blockedOverlays.values()) {
            overlay.remove();
        }
        this.windows.clear();
        this.processWindows.clear();
        this.eventBindings.clear();
        this.windowNodeMaps.clear();
        this.blockedOverlays.clear();
        this.focusedWindowId = null;
        this.windowChangeListener = undefined;
    }

    /**
     * 設定最大化視窗底部預留的 taskbar 高度。
     * 漂浮模式下傳 0 讓視窗完全填充螢幕。
     * 若 reflow 為 true，會立刻重新佈局所有已最大化的視窗。
     */
    setMaximizedTaskbarHeight(height: number, reflow = true): void {
        this.maximizedTaskbarHeight = height;
        if (reflow) {
            for (const descriptor of this.windows.values()) {
                if (descriptor.state === 'maximized') {
                    this.applyWindowLayout(descriptor);
                }
            }
        }
    }

    createWindow(context: WindowProcessContext, options: WindowInitOptions): WindowSystemResult<string> {
        // 速率限制：每個程序每秒最多建立 N 個視窗
        const now = Date.now();
        if (!this.windowCreationTimes.has(context.processAppId)) {
            this.windowCreationTimes.set(context.processAppId, []);
        }
        const times = this.windowCreationTimes.get(context.processAppId)!;
        while (times.length > 0 && times[0] < now - WindowManager.WINDOW_RATE_WINDOW_MS) {
            times.shift();
        }
        if (times.length >= WindowManager.WINDOW_RATE_LIMIT) {
            return { success: false, error: 'RateLimitExceeded' };
        }
        times.push(now);

        const windowId = `window_${Date.now()}_${this.windowCounter++}`;
        const root = document.createElement('div');
        root.className = 'window-shell';
        root.dataset.windowId = windowId;

        const frame = document.createElement('div');
        frame.className = options.useDefaultFrame === false ? 'window-frame window-frame-unstyled' : 'window-frame';
        if (options.style) frame.classList.add('window-frame-custom');

        const titleBar = document.createElement('div');
        titleBar.className = options.style ? 'window-titlebar-custom' : 'window-titlebar';

        const titleLabel = document.createElement('div');
        titleLabel.className = 'window-title';
        titleLabel.textContent = options.title;

        const actions = document.createElement('div');
        actions.className = 'window-actions';

        const minimizeButton = this.createTitlebarButton('−', () => {
            this.minimizeWindow(context.processAppId, windowId);
        });
        const maximizeButton = this.createTitlebarButton('□', () => {
            const descriptor = this.windows.get(windowId);
            if (!descriptor) {
                return;
            }
            if (descriptor.state === 'maximized') {
                this.restoreWindow(context.processAppId, windowId);
                return;
            }
            this.maximizeWindow(context.processAppId, windowId);
        });
        const closeButton = this.createTitlebarButton('×', () => {
            this.closeWindow(context.processAppId, windowId);
        });

        actions.appendChild(minimizeButton);
        actions.appendChild(maximizeButton);
        actions.appendChild(closeButton);

        titleBar.appendChild(titleLabel);
        titleBar.appendChild(actions);

        const content = document.createElement('div');
        content.className = 'window-content';

        frame.appendChild(titleBar);
        frame.appendChild(content);
        root.appendChild(frame);

        const descriptor: WindowDescriptor = {
            id: windowId,
            processAppId: context.processAppId,
            appDefId: context.appDefId,
            title: options.title,
            state: 'normal',
            bounds: {
                width: options.width,
                height: options.height,
                x: options.x ?? WINDOW_CASCADE_X_OFFSET + this.windowCounter * WINDOW_CASCADE_INCREMENT,
                y: options.y ?? WINDOW_CASCADE_Y_OFFSET + this.windowCounter * WINDOW_CASCADE_INCREMENT,
            },
            useDefaultFrame: options.useDefaultFrame !== false,
            alwaysOnTop: options.alwaysOnTop === true,
            resizable: options.resizable !== false,
            zIndex: this.nextZIndex(options.alwaysOnTop === true),
            root,
            frame,
            content,
            titleLabel,
            style: options.style,
            icon: context.icon,
        };

        this.enableDrag(titleBar, descriptor);

        if (descriptor.resizable) {
            this.enableResize(root, descriptor);
        }

        root.addEventListener('pointerdown', () => {
            this.focusWindow(context.processAppId, windowId);
        });

        this.applyWindowLayout(descriptor);
        this.windows.set(windowId, descriptor);
        root.classList.add('is-opening');
        this.host.appendChild(root);
        setTimeout(() => root.classList.remove('is-opening'), ANIM_OPEN_MS);

        if (!this.processWindows.has(context.processAppId)) {
            this.processWindows.set(context.processAppId, new Set());
        }
        this.processWindows.get(context.processAppId)!.add(windowId);
        this.focusWindow(context.processAppId, windowId);
        this.emitWindowChange('created', descriptor);

        return { success: true, data: windowId };
    }

    initializeUi(processAppId: string, windowId: string, tree: WindowUiNode[], options?: InitializeUiOptions): WindowSystemResult<string> {
        const descriptor = this.getOwnedWindow(processAppId, windowId);
        if (!descriptor.success) {
            return { success: false, error: descriptor.error };
        }

        const windowDescriptor = descriptor.data!;

        // Save focus state before re-render
        const activeEl = document.activeElement;
        let focusControlId: string | null = null;
        let focusCursorStart: number | null = null;
        let focusCursorEnd: number | null = null;
        if (activeEl && windowDescriptor.content.contains(activeEl)) {
            const htmlActive = activeEl as HTMLElement;
            focusControlId = htmlActive.dataset.controlId
                ?? (htmlActive.closest('[data-control-id]') as HTMLElement | null)?.dataset.controlId
                ?? null;
            if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) {
                focusCursorStart = activeEl.selectionStart;
                focusCursorEnd = activeEl.selectionEnd;
            }
        }

        // Save scroll positions before re-render
        const scrollMap = new Map<string, { top: number; left: number }>();
        let contentScroll: { top: number; left: number } | null = null;
        if (options?.preserveScroll) {
            contentScroll = { top: windowDescriptor.content.scrollTop, left: windowDescriptor.content.scrollLeft };
            const scrollable = windowDescriptor.content.querySelectorAll<HTMLElement>('[data-control-id]');
            for (const el of scrollable) {
                if (el.scrollTop !== 0 || el.scrollLeft !== 0) {
                    scrollMap.set(el.dataset.controlId!, { top: el.scrollTop, left: el.scrollLeft });
                }
            }
        }

        windowDescriptor.content.replaceChildren();
        this.pruneBindings(windowId);

        const nodeMap = new Map<string, HTMLElement>();
        this.windowNodeMaps.set(windowId, nodeMap);

        for (const node of toIterable(tree)) {
            const rendered = this.renderNode(windowDescriptor, processAppId, node);
            windowDescriptor.content.appendChild(rendered);
        }

        // Restore focus
        if (focusControlId) {
            const target = nodeMap.get(focusControlId);
            if (target) {
                if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) {
                    target.focus();
                    if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && focusCursorStart !== null) {
                        target.setSelectionRange(focusCursorStart, focusCursorEnd);
                    }
                } else {
                    const inner = target.querySelector('input') as HTMLElement | null;
                    (inner ?? target).focus();
                }
            }
        }

        // Restore scroll positions
        if (options?.preserveScroll) {
            if (contentScroll) {
                windowDescriptor.content.scrollTop = contentScroll.top;
                windowDescriptor.content.scrollLeft = contentScroll.left;
            }
            for (const [controlId, scroll] of scrollMap) {
                const el = nodeMap.get(controlId);
                if (el) {
                    el.scrollTop = scroll.top;
                    el.scrollLeft = scroll.left;
                }
            }
        }

        return { success: true, data: windowId };
    }

    updateUi(processAppId: string, windowId: string, nodeId: string, patch: WindowUiNodePatch): WindowSystemResult<string> {
        const descriptor = this.getOwnedWindow(processAppId, windowId);
        if (!descriptor.success) {
            return { success: false, error: descriptor.error };
        }

        const nodeMap = this.windowNodeMaps.get(windowId);
        if (!nodeMap) {
            return { success: false, error: 'WindowNotFound' };
        }

        const element = nodeMap.get(nodeId);
        if (!element) {
            return { success: false, error: 'NodeNotFound' };
        }

        const controlType = element.dataset.controlType;

        // Delegate to registered component's patch handler
        if (controlType) {
            const renderer = uiComponentRegistry.getRenderer(controlType);
            if (renderer?.patch) {
                const ctx = this.buildRenderContext(descriptor.data!, processAppId);
                // For container patches, clean up child bindings first
                if (patch.children !== undefined && ['panel', 'stack', 'list'].includes(controlType)) {
                    this.removeChildrenFromNodeMap(windowId, element);
                    this.pruneChildBindings(windowId, element);
                }
                renderer.patch(element, patch, ctx);
            }
        }

        if (patch.style) {
            this.applyNodeStyle(element, patch.style);
        }

        return { success: true, data: nodeId };
    }

    removeUiNode(processAppId: string, windowId: string, nodeId: string): WindowSystemResult<string> {
        const descriptor = this.getOwnedWindow(processAppId, windowId);
        if (!descriptor.success) {
            return { success: false, error: descriptor.error };
        }

        const nodeMap = this.windowNodeMaps.get(windowId);
        if (!nodeMap) {
            return { success: false, error: 'WindowNotFound' };
        }

        const element = nodeMap.get(nodeId);
        if (!element) {
            return { success: false, error: 'NodeNotFound' };
        }

        this.removeChildrenFromNodeMap(windowId, element);
        nodeMap.delete(nodeId);
        element.remove();

        return { success: true, data: nodeId };
    }

    appendUiNode(processAppId: string, windowId: string, parentId: string, nodes: WindowUiNode[]): WindowSystemResult<string> {
        const descriptor = this.getOwnedWindow(processAppId, windowId);
        if (!descriptor.success) {
            return { success: false, error: descriptor.error };
        }

        const nodeMap = this.windowNodeMaps.get(windowId);
        if (!nodeMap) {
            return { success: false, error: 'WindowNotFound' };
        }

        const parent = nodeMap.get(parentId);
        if (!parent) {
            return { success: false, error: 'NodeNotFound' };
        }

        for (const node of toIterable(nodes)) {
            const rendered = this.renderNode(descriptor.data!, processAppId, node);
            parent.appendChild(rendered);
        }

        return { success: true, data: parentId };
    }

    closeWindow(processAppId: string, windowId: string): WindowSystemResult<string> {
        const descriptor = this.getOwnedWindow(processAppId, windowId);
        if (!descriptor.success) {
            return { success: false, error: descriptor.error };
        }

        const current = descriptor.data!;
        current.state = 'closed';
        current.root.classList.add('is-closing');

        // If the open context menu belongs to this window, close it
        if (this.contextMenuEl && current.root.contains(this.contextMenuEl)) {
            this.closeContextMenu();
        }

        this.windows.delete(windowId);
        this.processWindows.get(processAppId)?.delete(windowId);
        this.pruneBindings(windowId);
        this.windowNodeMaps.delete(windowId);
        if (this.focusedWindowId === windowId) {
            this.focusedWindowId = null;
        }
        this.emitWindowChange('closed', current);

        setTimeout(() => current.root.remove(), ANIM_CLOSE_MS);

        return { success: true, data: windowId };
    }

    /** 清除指定程序的速率限制紀錄。應在程序終止時呼叫。 */
    cleanupProcess(processAppId: string): void {
        this.windowCreationTimes.delete(processAppId);
    }

    setWindowStyle(processAppId: string, windowId: string, style: WindowStyle): WindowSystemResult<string> {
        const descriptor = this.getOwnedWindow(processAppId, windowId);
        if (!descriptor.success) {
            return { success: false, error: descriptor.error };
        }

        const current = descriptor.data!;
        current.style = { ...current.style, ...style };
        current.frame.classList.add('window-frame-custom');
        const tb = current.frame.querySelector('.window-titlebar') as HTMLElement | null;
        if (tb) {
            tb.classList.remove('window-titlebar');
            tb.classList.add('window-titlebar-custom');
        }
        this.applyWindowLayout(current);
        return { success: true, data: windowId };
    }

    minimizeWindow(processAppId: string, windowId: string): WindowSystemResult<string> {
        const descriptor = this.getOwnedWindow(processAppId, windowId);
        if (!descriptor.success) {
            return { success: false, error: descriptor.error };
        }

        const current = descriptor.data!;
        current.stateBeforeMinimize = current.state;
        current.state = 'minimized';
        current.root.classList.add('is-minimizing');
        if (this.focusedWindowId === windowId) {
            this.focusedWindowId = null;
        }
        this.emitWindowChange('minimized', current);

        setTimeout(() => {
            current.root.classList.remove('is-minimizing');
            current.root.style.display = 'none';
        }, ANIM_MINIMIZE_MS);

        return { success: true, data: windowId };
    }

    maximizeWindow(processAppId: string, windowId: string): WindowSystemResult<string> {
        const descriptor = this.getOwnedWindow(processAppId, windowId);
        if (!descriptor.success) {
            return { success: false, error: descriptor.error };
        }

        const current = descriptor.data!;
        current.boundsBeforeMaximize = { ...current.bounds };
        current.state = 'maximized';
        current.root.classList.add('is-layout-animating');
        this.applyWindowLayout(current);
        this.focusWindow(processAppId, windowId);
        this.emitWindowChange('maximized', current);
        this.emitWindowChange('resized', current);
        setTimeout(() => current.root.classList.remove('is-layout-animating'), ANIM_LAYOUT_MS);
        return { success: true, data: windowId };
    }

    restoreWindow(processAppId: string, windowId: string): WindowSystemResult<string> {
        const descriptor = this.getOwnedWindow(processAppId, windowId);
        if (!descriptor.success) {
            return { success: false, error: descriptor.error };
        }

        const current = descriptor.data!;
        const wasMinimized = current.state === 'minimized';
        const wasMaximized = current.state === 'maximized';
        if (wasMinimized) {
            current.state = current.stateBeforeMinimize ?? 'normal';
            current.stateBeforeMinimize = undefined;
        } else {
            current.state = 'normal';
        }
        if (wasMaximized && current.boundsBeforeMaximize) {
            current.bounds = { ...current.boundsBeforeMaximize };
            current.boundsBeforeMaximize = undefined;
        }
        current.root.style.display = 'block';
        if (wasMinimized) {
            current.root.classList.add('is-restoring');
            setTimeout(() => current.root.classList.remove('is-restoring'), ANIM_RESTORE_MS);
        } else {
            current.root.classList.add('is-layout-animating');
            setTimeout(() => current.root.classList.remove('is-layout-animating'), ANIM_LAYOUT_MS);
        }
        this.applyWindowLayout(current);
        this.focusWindow(processAppId, windowId);
        this.emitWindowChange('restored', current);
        this.emitWindowChange('resized', current);
        return { success: true, data: windowId };
    }

    focusWindow(processAppId: string, windowId: string): WindowSystemResult<string> {
        const descriptor = this.getOwnedWindow(processAppId, windowId);
        if (!descriptor.success) {
            return { success: false, error: descriptor.error };
        }

        const current = descriptor.data!;
        if (current.state === 'closed') {
            return { success: false, error: 'Closed' };
        }

        if (current.state === 'minimized') {
          const restoreTo = current.stateBeforeMinimize ?? 'normal';
          current.state = restoreTo;
          current.stateBeforeMinimize = undefined;
          current.root.style.display = 'block';
          current.root.classList.add('is-restoring');
          setTimeout(() => current.root.classList.remove('is-restoring'), ANIM_RESTORE_MS);
          this.applyWindowLayout(current);
        }

        current.zIndex = this.nextZIndex(current.alwaysOnTop);
        current.root.style.zIndex = String(current.zIndex);
        current.root.classList.add('is-focused');

        if (this.focusedWindowId && this.focusedWindowId !== windowId) {
            this.windows.get(this.focusedWindowId)?.root.classList.remove('is-focused');
        }

        this.focusedWindowId = windowId;
        this.emitWindowChange('focused', current);
        return { success: true, data: windowId };
    }

    getOpenWindowSummaries(): Array<{ windowId: string; processAppId: string; appDefId: string; title: string; state: WindowState; icon?: string }> {
        return Array.from(this.windows.values()).map(descriptor => ({
            windowId: descriptor.id,
            processAppId: descriptor.processAppId,
            appDefId: descriptor.appDefId,
            title: descriptor.title,
            state: descriptor.state,
            icon: descriptor.icon,
        }));
    }

    getWindowsByProcess(processAppId: string): string[] {
        return Array.from(this.processWindows.get(processAppId) ?? []);
    }

    getWindowBounds(processAppId: string, windowId: string): WindowSystemResult<WindowBounds> {
        const descriptor = this.getOwnedWindow(processAppId, windowId);
        if (!descriptor.success) {
            return { success: false, error: descriptor.error };
        }

        const current = descriptor.data!;
        if (current.state === 'maximized') {
            const hostRect = this.host.getBoundingClientRect();
            return {
                success: true,
                data: {
                    x: MAXIMIZED_WINDOW_MARGIN,
                    y: MAXIMIZED_WINDOW_MARGIN,
                    width: hostRect.width - MAXIMIZED_WINDOW_MARGIN * 2,
                    height: hostRect.height - this.maximizedTaskbarHeight,
                },
            };
        }

        return { success: true, data: { ...current.bounds } };
    }

    /**
     * 鎖定/解鎖視窗互動（用於 modal dialog）。
     * 鎖定時在視窗上疊加半透明遮罩，阻止所有滑鼠事件。
     */
    setWindowBlocked(windowId: string, blocked: boolean): void {
        const descriptor = this.windows.get(windowId);
        if (!descriptor) return;

        if (blocked) {
            if (this.blockedOverlays.has(windowId)) return;
            const overlay = document.createElement('div');
            overlay.className = 'window-modal-overlay';
            overlay.style.cssText = 'position:absolute;inset:0;z-index:9999;background:rgba(0,0,0,0.25);cursor:not-allowed;';
            descriptor.root.appendChild(overlay);
            descriptor.root.classList.add('is-blocked');
            this.blockedOverlays.set(windowId, overlay);
        } else {
            const overlay = this.blockedOverlays.get(windowId);
            if (overlay) {
                overlay.remove();
                this.blockedOverlays.delete(windowId);
            }
            descriptor.root.classList.remove('is-blocked');
        }
    }

    /** 取得目前擁有焦點的視窗所屬 processAppId，若無焦點視窗回傳 null */
    getFocusedProcessAppId(): string | null {
        if (!this.focusedWindowId) return null;
        const descriptor = this.windows.get(this.focusedWindowId);
        if (!descriptor || descriptor.state === 'closed' || descriptor.state === 'minimized') return null;
        return descriptor.processAppId;
    }

    showContextMenu(processAppId: string, windowId: string, controlId: string, x: number, y: number, items: ContextMenuEntry[]): WindowSystemResult<string> {
        const descriptor = this.getOwnedWindow(processAppId, windowId);
        if (!descriptor.success) {
            return { success: false, error: descriptor.error };
        }

        this.closeContextMenu();

        const menu = document.createElement('div');
        menu.className = 'desktop-context-menu';

        for (const entry of toIterable(items)) {
            if ('separator' in entry && entry.separator) {
                const sep = document.createElement('div');
                sep.className = 'desktop-context-menu-separator';
                menu.appendChild(sep);
                continue;
            }

            const item = entry as { id: string; label: string; danger?: boolean };
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = item.danger
                ? 'desktop-context-menu-item desktop-context-menu-item--danger'
                : 'desktop-context-menu-item';
            btn.textContent = item.label;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeContextMenu();
                this.uiEventHandler({
                    eventId: this.allocateEventId(),
                    windowId,
                    processAppId,
                    type: 'contextmenu-select',
                    controlId,
                    value: item.id,
                });
            });
            menu.appendChild(btn);
        }

        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        document.body.appendChild(menu);
        this.contextMenuEl = menu;

        // Adjust position if menu overflows viewport
        requestAnimationFrame(() => {
            const rect = menu.getBoundingClientRect();
            if (rect.right > window.innerWidth - 8) {
                menu.style.left = `${x - rect.width}px`;
            }
            if (rect.bottom > window.innerHeight - 8) {
                menu.style.top = `${y - rect.height}px`;
            }
        });

        this.contextMenuCloseHandler = (e: MouseEvent) => {
            if (!menu.contains(e.target as Node)) {
                this.closeContextMenu();
            }
        };
        document.addEventListener('mousedown', this.contextMenuCloseHandler, true);

        return { success: true, data: windowId };
    }

    closeContextMenu(): void {
        if (this.contextMenuEl) {
            this.contextMenuEl.remove();
            this.contextMenuEl = null;
        }
        if (this.contextMenuCloseHandler) {
            document.removeEventListener('mousedown', this.contextMenuCloseHandler, true);
            this.contextMenuCloseHandler = null;
        }
    }

    createConsoleWindow(
        context: WindowProcessContext,
        title: string,
        inputHandler: (line: string) => void,
    ): ConsoleWindowController {
        const result = this.createWindow(context, {
            title,
            width: DEFAULT_CONSOLE_WIDTH,
            height: DEFAULT_CONSOLE_HEIGHT,
            useDefaultFrame: true,
        });

        if (!result.success || !result.data) {
            return {
                windowId: '',
                appendLine() {},
                appendText() {},
                clear() {},
            };
        }

        const windowId = result.data;
        const descriptor = this.windows.get(windowId)!;

        const content = descriptor.content;
        content.classList.add('console-body');

        const output = document.createElement('div');
        output.className = 'console-output';

        const inputLine = document.createElement('div');
        inputLine.className = 'console-input-line';

        const prompt = document.createElement('span');
        prompt.className = 'console-prompt';
        prompt.textContent = '> ';

        const input = document.createElement('input');
        input.className = 'console-input';
        input.type = 'text';
        input.spellcheck = false;
        input.autocomplete = 'off';

        inputLine.appendChild(prompt);
        inputLine.appendChild(input);
        content.appendChild(output);
        content.appendChild(inputLine);

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const text = input.value;
                input.value = '';
                appendLine('> ' + text);
                inputHandler(text);
            }
        });

        const appendLine = (text: string) => {
            const line = document.createElement('div');
            line.className = 'console-line';
            const rendered = renderAnsiLine(text);
            if (rendered) {
                line.appendChild(rendered);
            } else {
                line.textContent = text;
            }
            output.appendChild(line);
            output.scrollTop = output.scrollHeight;
        };

        const appendText = (text: string) => {
            const last = output.lastElementChild;
            if (last && last.classList.contains('console-line')) {
                const rendered = renderAnsiLine(text);
                if (rendered) {
                    last.appendChild(rendered);
                } else {
                    last.appendChild(document.createTextNode(text));
                }
            } else {
                appendLine(text);
            }
            output.scrollTop = output.scrollHeight;
        };

        const clear = () => {
            output.replaceChildren();
        };

        return { windowId, appendLine, appendText, clear };
    }

    // ── Private: UI 渲染 ─────────────────────────────────────

    private buildRenderContext(descriptor: WindowDescriptor, processAppId: string): RenderContext {
        return {
            windowId: descriptor.id,
            processAppId,
            renderChild: (child: WindowUiNode) => this.renderNode(descriptor, processAppId, child),
            bindEvent: (controlId, type) => {
                const eid = this.allocateEventId();
                this.eventBindings.set(eid, {
                    eventId: eid,
                    windowId: descriptor.id,
                    processAppId,
                    type: type as WindowUiEvent['type'],
                    controlId,
                });
                return (extra?: Partial<WindowUiEvent>) => {
                    const binding = this.eventBindings.get(eid);
                    if (binding) this.uiEventHandler({ ...binding, ...extra });
                };
            },
            registerNode: (nodeId, element) => this.registerNode(descriptor.id, nodeId, element),
            applyStyle: (element, style) => this.applyNodeStyle(element, style),
        };
    }

    private renderNode(descriptor: WindowDescriptor, processAppId: string, node: WindowUiNode): HTMLElement {
        const ctx = this.buildRenderContext(descriptor, processAppId);
        const renderer = uiComponentRegistry.getRenderer(node.type);

        if (renderer) {
            const element = renderer.render(node, ctx);
            this.attachNodeEvents(element, descriptor, processAppId, node);
            return element;
        }

        // Fallback for unknown types
        const fallback = document.createElement('div');
        fallback.dataset.controlType = node.type;
        if (node.id) fallback.dataset.controlId = node.id;
        this.applyNodeStyle(fallback, node.style);
        this.registerNode(descriptor.id, node.id, fallback);
        return fallback;
    }

    private applyNodeStyle(element: HTMLElement, style?: WindowUiStyle): void {
        if (!style) return;
        for (const [key, value] of Object.entries(style)) {
            if (value === undefined) continue;
            if (key === 'className') { element.classList.add(value); continue; }
            if (key === 'flexDirection') element.style.display = 'flex';
            (element.style as any)[key] = value;
        }
    }

    private attachNodeEvents(element: HTMLElement, descriptor: WindowDescriptor, processAppId: string, node: WindowUiNode): void {
        const events = (node as any).events as WindowUiEvent['type'][] | undefined;
        if (!events || !node.id) return;

        for (const evt of toIterable(events)) {
            // Skip events already handled natively by the component renderer
            if (evt === 'click' && node.type === 'button') continue;
            if ((evt === 'change' || evt === 'submit') && ['input', 'textarea', 'checkbox', 'select'].includes(node.type)) continue;

            const eid = this.allocateEventId();
            this.eventBindings.set(eid, {
                eventId: eid,
                windowId: descriptor.id,
                processAppId,
                type: evt,
                controlId: node.id,
            });

            element.addEventListener(evt, (e: Event) => {
                if (evt === 'contextmenu') e.preventDefault();
                const binding = this.eventBindings.get(eid);
                if (!binding) return;
                const uiEvent: WindowUiEvent = { ...binding };
                if (evt === 'contextmenu' && e instanceof MouseEvent) {
                    uiEvent.x = e.clientX;
                    uiEvent.y = e.clientY;
                }
                this.uiEventHandler(uiEvent);
            });
        }
    }

    // ── Private: Node Map 管理 ─────────────────────────────────

    private registerNode(windowId: string, nodeId: string | undefined, element: HTMLElement): void {
        if (!nodeId) {
            return;
        }
        const nodeMap = this.windowNodeMaps.get(windowId);
        if (nodeMap) {
            nodeMap.set(nodeId, element);
        }
    }

    private removeChildrenFromNodeMap(windowId: string, parent: HTMLElement): void {
        const nodeMap = this.windowNodeMaps.get(windowId);
        if (!nodeMap) {
            return;
        }
        for (const child of parent.children) {
            if (child instanceof HTMLElement) {
                const controlId = child.dataset.controlId;
                if (controlId) {
                    nodeMap.delete(controlId);
                }
                this.removeChildrenFromNodeMap(windowId, child);
            }
        }
    }

    private pruneChildBindings(windowId: string, parent: HTMLElement): void {
        const controlIds = new Set<string>();
        const collectIds = (el: HTMLElement) => {
            const id = el.dataset.controlId;
            if (id) {
                controlIds.add(id);
            }
            for (const child of el.children) {
                if (child instanceof HTMLElement) {
                    collectIds(child);
                }
            }
        };
        collectIds(parent);
        for (const [eventId, binding] of this.eventBindings.entries()) {
            if (binding.windowId === windowId && binding.controlId && controlIds.has(binding.controlId)) {
                this.eventBindings.delete(eventId);
            }
        }
    }

    // ── Private: 視窗查詢 ────────────────────────────────────

    private getOwnedWindow(processAppId: string, windowId: string): WindowSystemResult<WindowDescriptor> {
        const descriptor = this.windows.get(windowId);
        if (!descriptor) {
            return { success: false, error: 'WindowNotFound' };
        }

        if (descriptor.processAppId !== processAppId) {
            return { success: false, error: 'PermissionDenied' };
        }

        return { success: true, data: descriptor };
    }

    // ── Private: Z-Index / 佈局 ─────────────────────────────

    private nextZIndex(alwaysOnTop: boolean): number {
        this.zCounter += 1;
        return alwaysOnTop ? this.zCounter + Z_INDEX_ALWAYS_ON_TOP_OFFSET : this.zCounter;
    }

    private applyWindowLayout(descriptor: WindowDescriptor): void {
        descriptor.root.style.left = `${descriptor.bounds.x}px`;
        descriptor.root.style.top = `${descriptor.bounds.y}px`;
        descriptor.root.style.zIndex = String(descriptor.zIndex);

        if (descriptor.state === 'maximized') {
            descriptor.root.style.left = `${MAXIMIZED_WINDOW_MARGIN}px`;
            descriptor.root.style.top = `${MAXIMIZED_WINDOW_MARGIN}px`;
            descriptor.root.style.width = `calc(100% - ${MAXIMIZED_WINDOW_MARGIN * 2}px)`;
            descriptor.root.style.height = `calc(100% - ${this.maximizedTaskbarHeight}px)`;
            descriptor.frame.style.borderRadius = '0';
        } else {
            descriptor.frame.style.borderRadius = '';
            descriptor.root.style.width = `${descriptor.bounds.width}px`;
            descriptor.root.style.height = `${descriptor.bounds.height}px`;
        }

        if (descriptor.style?.background) {
            descriptor.frame.style.background = descriptor.style.background;
        }
        if (descriptor.style?.color) {
            descriptor.frame.style.color = descriptor.style.color;
        }
        if (descriptor.style?.borderRadius) {
            descriptor.frame.style.borderRadius = descriptor.style.borderRadius;
        }
        if (descriptor.style?.border) {
            descriptor.frame.style.border = descriptor.style.border;
        }
        if (descriptor.style?.boxShadow) {
            descriptor.frame.style.boxShadow = descriptor.style.boxShadow;
        }
        // Apply titlebar custom styles
        const tb = descriptor.frame.querySelector('.window-titlebar, .window-titlebar-custom') as HTMLElement | null;
        if (tb && descriptor.style?.titlebar) {
            if (descriptor.style.titlebar.background) tb.style.background = descriptor.style.titlebar.background;
            if (descriptor.style.titlebar.color) tb.style.color = descriptor.style.titlebar.color;
            if (descriptor.style.titlebar.borderBottom) tb.style.borderBottom = descriptor.style.titlebar.borderBottom;
        }
    }

    private pruneBindings(windowId: string): void {
        for (const [eventId, binding] of this.eventBindings.entries()) {
            if (binding.windowId === windowId) {
                this.eventBindings.delete(eventId);
            }
        }
    }

    private allocateEventId(): string {
        return `uievt_${Date.now()}_${this.eventCounter++}`;
    }

    // ── Private: 標題列 / 拖曳 / 縮放 ──────────────────────

    private createTitlebarButton(label: string, onClick: () => void): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'window-action-button';
        button.textContent = label;
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            onClick();
        });
        return button;
    }

    private enableDrag(titleBar: HTMLDivElement, descriptor: WindowDescriptor): void {
        let startX = 0;
        let startY = 0;
        let startBoundsX = 0;
        let startBoundsY = 0;
        let dragStartedFromMaximized = false;
        let isDragging = false;

        const onPointerMove = (e: PointerEvent) => {
            if (dragStartedFromMaximized) {
                // Un-maximize on first actual move and position window under cursor
                dragStartedFromMaximized = false;
                const hostRect = this.host.getBoundingClientRect();
                const cursorHostX = e.clientX - hostRect.left;
                const prevW = descriptor.bounds.width;
                // Place restored title bar so cursor stays proportional to its width
                const maxWidth = hostRect.width;
                const relX = (startX - hostRect.left) / maxWidth;
                let newX = cursorHostX - prevW * relX;
                newX = Math.max(0, Math.min(hostRect.width - prevW, newX));
                const newY = Math.max(0, e.clientY - hostRect.top - 20);

                descriptor.state = 'normal';
                if (descriptor.boundsBeforeMaximize) {
                    descriptor.bounds = { ...descriptor.boundsBeforeMaximize };
                    descriptor.boundsBeforeMaximize = undefined;
                }
                descriptor.bounds.x = newX;
                descriptor.bounds.y = newY;
                descriptor.frame.style.borderRadius = '';
                this.applyWindowLayout(descriptor);

                startX = e.clientX;
                startY = e.clientY;
                startBoundsX = newX;
                startBoundsY = newY;
                isDragging = true;
                descriptor.root.classList.add('is-dragging');
                this.emitWindowChange('restored', descriptor);
                this.emitWindowChange('resized', descriptor);
            }

            if (!isDragging) return;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            descriptor.bounds.x = startBoundsX + dx;
            descriptor.bounds.y = startBoundsY + dy;
            descriptor.root.style.left = `${descriptor.bounds.x}px`;
            descriptor.root.style.top = `${descriptor.bounds.y}px`;

            // Show snap preview near edges/corners
            const zone = this.computeSnapZone(e.clientX, e.clientY);
            if (zone) {
                const snapBounds = this.getSnapBounds(zone);
                this.showSnapPreview(snapBounds);
            } else {
                this.hideSnapPreview();
            }
        };

        const onPointerUp = (e: PointerEvent) => {
            titleBar.releasePointerCapture(e.pointerId);
            descriptor.root.classList.remove('is-dragging');
            titleBar.removeEventListener('pointermove', onPointerMove);
            titleBar.removeEventListener('pointerup', onPointerUp);
            this.hideSnapPreview();

            if (!isDragging) {
                dragStartedFromMaximized = false;
                return;
            }
            isDragging = false;

            const zone = this.computeSnapZone(e.clientX, e.clientY);
            if (zone === 'top') {
                // Snap to maximized
                this.maximizeWindow(descriptor.processAppId, descriptor.id);
            } else if (zone) {
                // Snap to half / quarter
                descriptor.root.classList.add('is-layout-animating');
                const snapBounds = this.getSnapBounds(zone);
                descriptor.bounds = { ...snapBounds };
                descriptor.state = 'normal';
                this.applyWindowLayout(descriptor);
                this.emitWindowChange('resized', descriptor);
                setTimeout(() => descriptor.root.classList.remove('is-layout-animating'), 300);
            }
        };

        // Double-click title bar to maximize / restore
        titleBar.addEventListener('dblclick', (e: MouseEvent) => {
            if ((e.target as HTMLElement).closest('.window-actions')) return;
            if (descriptor.state === 'maximized') {
                this.restoreWindow(descriptor.processAppId, descriptor.id);
            } else if (descriptor.state === 'normal') {
                this.maximizeWindow(descriptor.processAppId, descriptor.id);
            }
        });

        titleBar.addEventListener('pointerdown', (e: PointerEvent) => {
            if ((e.target as HTMLElement).closest('.window-actions')) return;
            startX = e.clientX;
            startY = e.clientY;

            if (descriptor.state === 'maximized') {
                // Begin drag from maximized — will un-maximize on first move
                dragStartedFromMaximized = true;
                isDragging = false;
                titleBar.setPointerCapture(e.pointerId);
                titleBar.addEventListener('pointermove', onPointerMove);
                titleBar.addEventListener('pointerup', onPointerUp);
                return;
            }

            startBoundsX = descriptor.bounds.x;
            startBoundsY = descriptor.bounds.y;
            isDragging = true;
            dragStartedFromMaximized = false;
            descriptor.root.classList.add('is-dragging');
            titleBar.setPointerCapture(e.pointerId);
            titleBar.addEventListener('pointermove', onPointerMove);
            titleBar.addEventListener('pointerup', onPointerUp);
        });
    }

    /** 計算游標落在哪個貼靠區域（根據與 host 邊緣的距離），角落優先。 */
    private computeSnapZone(clientX: number, clientY: number): string | null {
        const hostRect = this.host.getBoundingClientRect();
        const T = WINDOW_SNAP_THRESHOLD;

        const nearLeft = clientX - hostRect.left < T;
        const nearRight = hostRect.right - clientX < T;
        const nearTop = clientY - hostRect.top < T;
        // Reserve bottom area for taskbar — no snapping into it
        const nearBottom = hostRect.bottom - clientY < T + this.maximizedTaskbarHeight;

        if (nearTop && nearLeft) return 'top-left';
        if (nearTop && nearRight) return 'top-right';
        if (nearBottom && nearLeft) return 'bottom-left';
        if (nearBottom && nearRight) return 'bottom-right';
        if (nearTop) return 'top';
        if (nearLeft) return 'left';
        if (nearRight) return 'right';
        return null;
    }

    /** 根據貼靠區域計算視窗的像素 bounds。 */
    private getSnapBounds(zone: string): WindowBounds {
        const hostRect = this.host.getBoundingClientRect();
        const w = hostRect.width;
        const h = hostRect.height - this.maximizedTaskbarHeight;
        const halfW = Math.floor(w / 2);
        const halfH = Math.floor(h / 2);

        switch (zone) {
            case 'top':    return { x: 0, y: 0, width: w, height: h };
            case 'left':   return { x: 0, y: 0, width: halfW, height: h };
            case 'right':  return { x: halfW, y: 0, width: w - halfW, height: h };
            case 'top-left':     return { x: 0,     y: 0,     width: halfW,      height: halfH };
            case 'top-right':    return { x: halfW, y: 0,     width: w - halfW,  height: halfH };
            case 'bottom-left':  return { x: 0,     y: halfH, width: halfW,      height: h - halfH };
            case 'bottom-right': return { x: halfW, y: halfH, width: w - halfW,  height: h - halfH };
            default:       return { x: 0, y: 0, width: w, height: h };
        }
    }

    /** 顯示（或更新）貼靠預覽遮罩。 */
    private showSnapPreview(bounds: WindowBounds): void {
        if (!this.snapPreviewEl) {
            this.snapPreviewEl = document.createElement('div');
            this.snapPreviewEl.className = 'window-snap-preview';
            this.host.appendChild(this.snapPreviewEl);
        }
        const el = this.snapPreviewEl;
        el.style.left   = `${bounds.x}px`;
        el.style.top    = `${bounds.y}px`;
        el.style.width  = `${bounds.width}px`;
        el.style.height = `${bounds.height}px`;
        el.classList.add('is-visible');
    }

    /** 隱藏並移除貼靠預覽遮罩。 */
    private hideSnapPreview(): void {
        if (this.snapPreviewEl) {
            this.snapPreviewEl.remove();
            this.snapPreviewEl = null;
        }
    }

    private enableResize(root: HTMLDivElement, descriptor: WindowDescriptor): void {
        const edges: Array<{ className: string; dx: -1|0|1; dy: -1|0|1 }> = [
            { className: 'window-resize-n',  dx: 0,  dy: -1 },
            { className: 'window-resize-s',  dx: 0,  dy: 1 },
            { className: 'window-resize-w',  dx: -1, dy: 0 },
            { className: 'window-resize-e',  dx: 1,  dy: 0 },
            { className: 'window-resize-nw', dx: -1, dy: -1 },
            { className: 'window-resize-ne', dx: 1,  dy: -1 },
            { className: 'window-resize-sw', dx: -1, dy: 1 },
            { className: 'window-resize-se', dx: 1,  dy: 1 },
        ];

        const minW = 280;
        const minH = 180;

        for (const edge of edges) {
            const handle = document.createElement('div');
            handle.className = `window-resize-handle ${edge.className}`;

            let startX = 0;
            let startY = 0;
            let startBounds: WindowBounds = { x: 0, y: 0, width: 0, height: 0 };

            const onPointerMove = (e: PointerEvent) => {
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;

                let newX = startBounds.x;
                let newY = startBounds.y;
                let newW = startBounds.width;
                let newH = startBounds.height;

                if (edge.dx === 1) {
                    newW = Math.max(minW, startBounds.width + deltaX);
                } else if (edge.dx === -1) {
                    const proposed = startBounds.width - deltaX;
                    if (proposed >= minW) {
                        newW = proposed;
                        newX = startBounds.x + deltaX;
                    } else {
                        newW = minW;
                        newX = startBounds.x + (startBounds.width - minW);
                    }
                }

                if (edge.dy === 1) {
                    newH = Math.max(minH, startBounds.height + deltaY);
                } else if (edge.dy === -1) {
                    const proposed = startBounds.height - deltaY;
                    if (proposed >= minH) {
                        newH = proposed;
                        newY = startBounds.y + deltaY;
                    } else {
                        newH = minH;
                        newY = startBounds.y + (startBounds.height - minH);
                    }
                }

                descriptor.bounds.x = newX;
                descriptor.bounds.y = newY;
                descriptor.bounds.width = newW;
                descriptor.bounds.height = newH;

                root.style.left = `${newX}px`;
                root.style.top = `${newY}px`;
                root.style.width = `${newW}px`;
                root.style.height = `${newH}px`;
            };

            const onPointerUp = (e: PointerEvent) => {
                handle.releasePointerCapture(e.pointerId);
                descriptor.root.classList.remove('is-resizing');
                handle.removeEventListener('pointermove', onPointerMove);
                handle.removeEventListener('pointerup', onPointerUp);
                this.emitWindowChange('resized', descriptor);
            };

            handle.addEventListener('pointerdown', (e: PointerEvent) => {
                if (descriptor.state === 'maximized') return;
                e.stopPropagation();
                startX = e.clientX;
                startY = e.clientY;
                startBounds = { ...descriptor.bounds };
                descriptor.root.classList.add('is-resizing');
                handle.setPointerCapture(e.pointerId);
                handle.addEventListener('pointermove', onPointerMove);
                handle.addEventListener('pointerup', onPointerUp);
            });

            root.appendChild(handle);
        }
    }

    private emitWindowChange(type: WindowLifecycleEvent['type'], descriptor: WindowDescriptor): void {
        if (!this.windowChangeListener) {
            return;
        }

        const bounds = type === 'resized'
            ? (descriptor.state === 'maximized'
                ? {
                    x: MAXIMIZED_WINDOW_MARGIN,
                    y: MAXIMIZED_WINDOW_MARGIN,
                    width: this.host.getBoundingClientRect().width - MAXIMIZED_WINDOW_MARGIN * 2,
                    height: this.host.getBoundingClientRect().height - this.maximizedTaskbarHeight,
                }
                : { ...descriptor.bounds })
            : undefined;

        this.windowChangeListener({
            type,
            windowId: descriptor.id,
            processAppId: descriptor.processAppId,
            title: descriptor.title,
            state: descriptor.state,
            bounds,
        });
    }
}

export { WindowManager };
