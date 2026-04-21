// ── UI Component Registry ──────────────────────────────────
// 註冊模式：每個 UI 元件以 renderer + api builder 形式註冊，
// WindowManager 與 uiApi 透過 registry 查詢，無需硬編碼 if/else。

import type {
    WindowUiNode,
    WindowUiNodePatch,
    WindowUiStyle,
    WindowUiEvent,
} from './types';

// ── Renderer 介面 ─────────────────────────────────────────

/** WindowManager 傳給每個 renderer 的上下文 */
export interface RenderContext {
    windowId: string;
    processAppId: string;
    /** 遞迴渲染子節點 */
    renderChild(node: WindowUiNode): HTMLElement;
    /**
     * 為元素建立事件綁定並回傳 dispatch 函式。
     * 呼叫 dispatch(extraFields?) 即可觸發 UI event。
     */
    bindEvent(controlId: string | undefined, type: string): (extra?: Partial<WindowUiEvent>) => void;
    /** 將從 html-view 的 <script> 提取到的程式碼派送至沙箱 Runtime 執行 */
    dispatchScript(code: string): void;
    /** 註冊 node 到 nodeMap */
    registerNode(nodeId: string | undefined, element: HTMLElement): void;
    /** 套用 style 物件到 HTMLElement */
    applyStyle(element: HTMLElement, style?: WindowUiStyle): void;
}

/** 每個 UI 元件的 renderer 定義 */
export interface UiComponentRenderer {
    /** 建立 DOM 元素 */
    render(node: WindowUiNode, ctx: RenderContext): HTMLElement;
    /** 處理 patch 更新（回傳 true 表示已處理，false 表示未處理） */
    patch?(element: HTMLElement, patch: WindowUiNodePatch, ctx: RenderContext): boolean;
}

// ── API Builder 介面 ──────────────────────────────────────

/** 每個 UI 元件的 API builder — 建構 node descriptor 給 QuickJS 端 */
export type UiComponentApiBuilder = (...args: any[]) => Record<string, unknown>;

// ── Registry ──────────────────────────────────────────────

class UiComponentRegistry {
    private renderers = new Map<string, UiComponentRenderer>();
    private apiBuilders = new Map<string, UiComponentApiBuilder>();

    /** 註冊一個 UI 元件 */
    register(type: string, renderer: UiComponentRenderer, apiBuilder: UiComponentApiBuilder): void {
        this.renderers.set(type, renderer);
        this.apiBuilders.set(type, apiBuilder);
    }

    /** 取得 renderer */
    getRenderer(type: string): UiComponentRenderer | undefined {
        return this.renderers.get(type);
    }

    /** 取得所有已註冊的 API builders，以 Record<type, builder> 形式 */
    getApiBuilders(): Map<string, UiComponentApiBuilder> {
        return this.apiBuilders;
    }

    /** 取得所有已註冊的元件類型 */
    getRegisteredTypes(): string[] {
        return Array.from(this.renderers.keys());
    }

    hasRenderer(type: string): boolean {
        return this.renderers.has(type);
    }

    /** 反註冊一個 UI 元件 */
    unregister(type: string): boolean {
        const existed = this.renderers.has(type);
        this.renderers.delete(type);
        this.apiBuilders.delete(type);
        return existed;
    }
}

export const uiComponentRegistry = new UiComponentRegistry();
