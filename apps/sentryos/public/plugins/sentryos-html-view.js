// ── sentryos-html-view plugin ─────────────────────────────
// 以純 DOM 渲染 HTML 字串，不使用 iframe 沙盒。
// 所有邏輯透過 data-event 屬性宣告，事件回傳至應用程式 Runtime 執行。
// <script> 標籤內容會被提取後送回沙箱 Runtime 執行，而非在主頁面執行。

/**
 * 對 HTML 字串進行靜態清理，並提取 <script> 標籤的內容：
 * - 提取所有 <script> 元素的內容（供後續丟回沙箱執行）
 * - 移除 <script>、<iframe>、<object>、<embed> 元素
 * - 移除所有行內 on* 事件處理器屬性
 *
 * @param {string} html
 * @returns {{ container: HTMLDivElement, scripts: string[] }}
 *   container - 已清理的容器元素（其子節點為安全 HTML）
 *   scripts   - 從 <script> 標籤中提取的程式碼陣列
 */
function sanitizeHtml(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;

    const scripts = [];
    for (const el of temp.querySelectorAll('script')) {
        if (el.textContent && el.textContent.trim()) {
            scripts.push(el.textContent);
        }
        el.remove();
    }

    for (const el of temp.querySelectorAll('iframe, object, embed')) {
        el.remove();
    }

    for (const el of temp.querySelectorAll('*')) {
        for (let i = el.attributes.length - 1; i >= 0; i--) {
            if (el.attributes[i].name.toLowerCase().startsWith('on')) {
                el.removeAttribute(el.attributes[i].name);
            }
        }
    }

    return { container: temp, scripts };
}

/**
 * 掃描容器內所有帶有 data-event 屬性的元素，
 * 透過 ctx.bindEvent() 將 DOM 事件橋接回應用程式 Runtime。
 *
 * 支援的 data-* 屬性：
 * - data-event   ：DOM 事件名稱（click、input、change 等）
 * - data-id      ：事件的 controlId（對應 onWindowEvent 中的 e.controlId）
 * - data-value   ：靜態值，適用於 click 等非輸入型事件
 *
 * @param {HTMLElement} container
 * @param {import('../../../src/window/UiComponentRegistry').RenderContext} ctx
 */
function bindDataEvents(container, ctx) {
    for (const el of container.querySelectorAll('[data-event]')) {
        const eventName = el.dataset.event;
        if (!eventName) continue;

        const controlId = el.dataset.id || undefined;
        const staticValue = el.dataset.value;
        const dispatch = ctx.bindEvent(controlId, eventName);

        if (eventName === 'input' || eventName === 'change') {
            el.addEventListener(eventName, () => {
                const isFormField = el instanceof HTMLInputElement
                    || el instanceof HTMLTextAreaElement
                    || el instanceof HTMLSelectElement;
                const value = isFormField ? el.value : staticValue;
                dispatch({ value });
            });
        } else {
            el.addEventListener(eventName, () => {
                dispatch(staticValue !== undefined ? { value: staticValue } : undefined);
            });
        }
    }
}

// ── Renderer ───────────────────────────────────────────────

const htmlViewRenderer = {
    render(node, ctx) {
        const container = document.createElement('div');
        container.dataset.controlType = 'html-view';
        if (node.id) container.dataset.controlId = node.id;
        container.classList.add('window-ui-html-view');
        ctx.applyStyle(container, node.style);

        const { container: sanitized, scripts } = sanitizeHtml(node.html || '');
        container.append(...Array.from(sanitized.childNodes));

        bindDataEvents(container, ctx);
        ctx.registerNode(node.id, container);

        if (scripts.length > 0) {
            ctx.dispatchScript(scripts.join('\n'));
        }

        return container;
    },

    patch(element, patch, ctx) {
        if (patch.html !== undefined) {
            const { container: sanitized, scripts } = sanitizeHtml(patch.html);
            element.replaceChildren(...Array.from(sanitized.childNodes));
            bindDataEvents(element, ctx);

            if (scripts.length > 0) {
                ctx.dispatchScript(scripts.join('\n'));
            }

            return true;
        }
        return false;
    },
};

// ── API Builder ────────────────────────────────────────────

function htmlViewApiBuilder(html, style, id) {
    return { type: 'html-view', html: html || '', style, id };
}

// ── Plugin ─────────────────────────────────────────────────

function setup(context) {
    context.registerUiComponent('html-view', htmlViewRenderer, htmlViewApiBuilder);

    // Register OS.htmlView — DOM manipulation APIs for use inside <script> blocks
    context.registerApi('htmlView', ({ process }) => {
        const windowManager = context.resolve('windowManager');

        return {
            /**
             * 在指定的 html-view 節點末尾追加 HTML 片段。
             * HTML 會經過安全清理（提取 <script> 內容送往沙箱執行、移除 iframe 及 on* 屬性），
             * 其中的 <script> 內容會在沙箱中執行。
             *
             * @param {string} windowId
             * @param {string} viewId   - html-view 節點的 id
             * @param {string} html     - 要追加的 HTML 字串
             */
            append(windowId, viewId, html) {
                const container = windowManager.getNodeElement(
                    process.processAppId, windowId, viewId
                );
                if (!container) return { success: false, error: 'NodeNotFound' };

                const ctx = windowManager.buildRenderContextFor(process.processAppId, windowId);
                if (!ctx) return { success: false, error: 'WindowNotFound' };

                const { container: sanitized, scripts } = sanitizeHtml(typeof html === 'string' ? html : '');
                const nodes = Array.from(sanitized.childNodes);
                for (const n of nodes) container.appendChild(n);
                bindDataEvents(container, ctx);

                if (scripts.length > 0) {
                    ctx.dispatchScript(scripts.join('\n'));
                }

                return { success: true };
            },

            /**
             * 移除 html-view 節點內帶有指定 data-id 屬性的第一個子元素。
             *
             * @param {string} windowId
             * @param {string} viewId      - html-view 節點的 id
             * @param {string} elementId   - 要移除的子元素的 data-id 屬性值
             */
            remove(windowId, viewId, elementId) {
                const container = windowManager.getNodeElement(
                    process.processAppId, windowId, viewId
                );
                if (!container) return { success: false, error: 'NodeNotFound' };

                const target = container.querySelector(`[data-id="${CSS.escape(String(elementId))}"]`);
                if (!target) return { success: false, error: 'NodeNotFound' };
                target.remove();

                return { success: true };
            },
        };
    }, ['window'], 'htmlView');

    context.log('INFO', 'html-view component registered');
}

function teardown(context) {
    context.log('INFO', 'html-view component unregistered');
}

export default {
    pluginName: 'sentryos-html-view',
    pluginVersion: '1.0.0',
    pluginDescription: '提供 html-view UI 元件，以純 DOM 渲染 HTML，事件透過 data-event 屬性橋接回 Runtime 執行。<script> 標籤會被提取後送回沙箱 Runtime 執行。',
    author: 'SentryOS',
    setup,
    teardown,
};
