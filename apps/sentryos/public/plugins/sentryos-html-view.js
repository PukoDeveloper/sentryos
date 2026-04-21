// ── sentryos-html-view plugin ─────────────────────────────
// 以純 DOM 渲染 HTML 字串，不使用 iframe 沙盒。
// 所有邏輯透過 data-event 屬性宣告，事件回傳至應用程式 Runtime 執行。

/**
 * 對 HTML 字串進行靜態清理：
 * - 移除 <script>、<iframe>、<object>、<embed> 元素
 * - 移除所有行內 on* 事件處理器屬性
 *
 * @param {string} html
 * @returns {HTMLDivElement} 已清理的容器元素（其子節點為安全 HTML）
 */
function sanitizeHtml(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;

    for (const el of temp.querySelectorAll('script, iframe, object, embed')) {
        el.remove();
    }

    for (const el of temp.querySelectorAll('*')) {
        for (let i = el.attributes.length - 1; i >= 0; i--) {
            if (el.attributes[i].name.toLowerCase().startsWith('on')) {
                el.removeAttribute(el.attributes[i].name);
            }
        }
    }

    return temp;
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

        const sanitized = sanitizeHtml(node.html || '');
        container.append(...Array.from(sanitized.childNodes));

        bindDataEvents(container, ctx);
        ctx.registerNode(node.id, container);
        return container;
    },

    patch(element, patch, ctx) {
        if (patch.html !== undefined) {
            const sanitized = sanitizeHtml(patch.html);
            element.replaceChildren(...Array.from(sanitized.childNodes));
            bindDataEvents(element, ctx);
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
    context.log('INFO', 'html-view component registered');
}

function teardown(context) {
    context.log('INFO', 'html-view component unregistered');
}

export default {
    pluginName: 'sentryos-html-view',
    pluginVersion: '1.0.0',
    pluginDescription: '提供 html-view UI 元件，以純 DOM 渲染 HTML，事件透過 data-event 屬性橋接回 Runtime 執行。',
    author: 'SentryOS',
    setup,
    teardown,
};
