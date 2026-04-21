// ── Built-in UI Component Definitions ──────────────────────
// 將原本硬編碼在 WindowManager.renderNodeCore 的元件邏輯，
// 以 registry 模式逐一定義並註冊。

import { uiComponentRegistry } from './UiComponentRegistry';
import type { UiComponentRenderer } from './UiComponentRegistry';
import type { WindowUiNode } from './types';
import { toIterable } from './toIterable';

// ── label ─────────────────────────────────────────────────

const labelRenderer: UiComponentRenderer = {
    render(node, ctx) {
        const n = node as Extract<WindowUiNode, { type: 'label' }>;
        const el = document.createElement('div');
        el.dataset.controlType = 'label';
        if (n.id) el.dataset.controlId = n.id;
        el.classList.add('window-ui-label');
        el.textContent = n.text;
        ctx.applyStyle(el, n.style);
        ctx.registerNode(n.id, el);
        return el;
    },
    patch(element, patch) {
        if (patch.text !== undefined) { element.textContent = patch.text; return true; }
        return false;
    },
};

uiComponentRegistry.register('label', labelRenderer,
    (text: string, style?: Record<string, string>, id?: string, events?: string[]) =>
        ({ type: 'label', text, style, id, ...(events ? { events } : {}) }),
);

// ── button ────────────────────────────────────────────────

const buttonRenderer: UiComponentRenderer = {
    render(node, ctx) {
        const n = node as Extract<WindowUiNode, { type: 'button' }>;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'window-ui-button';
        btn.dataset.controlType = 'button';
        if (n.id) btn.dataset.controlId = n.id;
        btn.textContent = n.text;
        ctx.applyStyle(btn, n.style);

        const dispatch = ctx.bindEvent(n.id, n.eventType ?? 'click');
        btn.addEventListener('click', () => dispatch());

        ctx.registerNode(n.id, btn);
        return btn;
    },
    patch(element, patch) {
        if (patch.text !== undefined) { element.textContent = patch.text; return true; }
        return false;
    },
};

uiComponentRegistry.register('button', buttonRenderer,
    (text: string, style?: Record<string, string>, id?: string) =>
        ({ type: 'button', text, style, id }),
);

// ── input ─────────────────────────────────────────────────

const inputRenderer: UiComponentRenderer = {
    render(node, ctx) {
        const n = node as Extract<WindowUiNode, { type: 'input' }>;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'window-ui-input';
        input.dataset.controlType = 'input';
        if (n.id) { input.dataset.controlId = n.id; input.name = n.id; }
        if (n.value !== undefined) input.value = n.value;
        if (n.placeholder) input.placeholder = n.placeholder;
        ctx.applyStyle(input, n.style);

        if (n.id) {
            const dispatchChange = ctx.bindEvent(n.id, 'change');
            input.addEventListener('input', () => dispatchChange({ value: input.value }));

            const dispatchSubmit = ctx.bindEvent(n.id, 'submit');
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') dispatchSubmit({ value: input.value });
            });
        }

        ctx.registerNode(n.id, input);
        return input;
    },
    patch(element, patch) {
        const el = element as HTMLInputElement;
        let handled = false;
        if (patch.value !== undefined) { el.value = String(patch.value); handled = true; }
        if (patch.placeholder !== undefined) { el.placeholder = patch.placeholder; handled = true; }
        return handled;
    },
};

uiComponentRegistry.register('input', inputRenderer,
    (value?: string, placeholder?: string, style?: Record<string, string>, id?: string) =>
        ({ type: 'input', value, placeholder, style, id }),
);

// ── textarea ──────────────────────────────────────────────

const textareaRenderer: UiComponentRenderer = {
    render(node, ctx) {
        const n = node as Extract<WindowUiNode, { type: 'textarea' }>;
        const textarea = document.createElement('textarea');
        textarea.className = 'window-ui-textarea';
        textarea.dataset.controlType = 'textarea';
        if (n.id) { textarea.dataset.controlId = n.id; textarea.name = n.id; }
        if (n.value !== undefined) textarea.value = n.value;
        if (n.placeholder) textarea.placeholder = n.placeholder;
        if (n.rows) textarea.rows = n.rows;
        ctx.applyStyle(textarea, n.style);

        if (n.id) {
            const dispatchChange = ctx.bindEvent(n.id, 'change');
            textarea.addEventListener('input', () => dispatchChange({ value: textarea.value }));
        }

        ctx.registerNode(n.id, textarea);
        return textarea;
    },
    patch(element, patch) {
        const el = element as HTMLTextAreaElement;
        let handled = false;
        if (patch.value !== undefined) { el.value = String(patch.value); handled = true; }
        if (patch.placeholder !== undefined) { el.placeholder = patch.placeholder; handled = true; }
        if (patch.rows !== undefined) { el.rows = patch.rows; handled = true; }
        return handled;
    },
};

uiComponentRegistry.register('textarea', textareaRenderer,
    (value?: string, placeholder?: string, rows?: number, style?: Record<string, string>, id?: string) =>
        ({ type: 'textarea', value, placeholder, rows, style, id }),
);

// ── checkbox ──────────────────────────────────────────────

const checkboxRenderer: UiComponentRenderer = {
    render(node, ctx) {
        const n = node as Extract<WindowUiNode, { type: 'checkbox' }>;
        const wrapper = document.createElement('label');
        wrapper.className = 'window-ui-checkbox';
        wrapper.dataset.controlType = 'checkbox';
        if (n.id) wrapper.dataset.controlId = n.id;
        ctx.applyStyle(wrapper, n.style);

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        if (n.id) checkbox.name = n.id;
        if (n.checked) checkbox.checked = true;
        wrapper.appendChild(checkbox);

        if (n.label) {
            const span = document.createElement('span');
            span.textContent = n.label;
            wrapper.appendChild(span);
        }

        if (n.id) {
            const dispatch = ctx.bindEvent(n.id, 'change');
            checkbox.addEventListener('change', () => dispatch({ value: checkbox.checked }));
        }

        ctx.registerNode(n.id, wrapper);
        return wrapper;
    },
    patch(element, patch) {
        let handled = false;
        if (patch.checked !== undefined) {
            const cb = element.querySelector('input[type="checkbox"]') as HTMLInputElement;
            if (cb) { cb.checked = patch.checked; handled = true; }
        }
        if (patch.label !== undefined) {
            const span = element.querySelector('span');
            if (span) { span.textContent = patch.label; handled = true; }
        }
        return handled;
    },
};

uiComponentRegistry.register('checkbox', checkboxRenderer,
    (checked?: boolean, label?: string, style?: Record<string, string>, id?: string) =>
        ({ type: 'checkbox', checked, label, style, id }),
);

// ── select ────────────────────────────────────────────────

const selectRenderer: UiComponentRenderer = {
    render(node, ctx) {
        const n = node as Extract<WindowUiNode, { type: 'select' }>;
        const select = document.createElement('select');
        select.className = 'window-ui-select';
        select.dataset.controlType = 'select';
        if (n.id) { select.dataset.controlId = n.id; select.name = n.id; }
        ctx.applyStyle(select, n.style);

        for (const opt of toIterable(n.options)) {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            if (n.value === opt.value) option.selected = true;
            select.appendChild(option);
        }

        if (n.id) {
            const dispatch = ctx.bindEvent(n.id, 'change');
            select.addEventListener('change', () => dispatch({ value: select.value }));
        }

        ctx.registerNode(n.id, select);
        return select;
    },
    patch(element, patch) {
        const select = element as HTMLSelectElement;
        let handled = false;
        if (patch.value !== undefined) { select.value = String(patch.value); handled = true; }
        if (patch.options !== undefined) {
            const current = select.value;
            select.replaceChildren();
            for (const opt of toIterable(patch.options)) {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.label;
                select.appendChild(option);
            }
            select.value = current;
            handled = true;
        }
        return handled;
    },
};

uiComponentRegistry.register('select', selectRenderer,
    (options: unknown[], value?: string, style?: Record<string, string>, id?: string) =>
        ({ type: 'select', options, value, style, id }),
);

// ── image ─────────────────────────────────────────────────

const imageRenderer: UiComponentRenderer = {
    render(node, ctx) {
        const n = node as Extract<WindowUiNode, { type: 'image' }>;
        const img = document.createElement('img');
        img.className = 'window-ui-image';
        img.dataset.controlType = 'image';
        if (n.id) img.dataset.controlId = n.id;
        img.src = n.src;
        if (n.alt) img.alt = n.alt;
        ctx.applyStyle(img, n.style);
        ctx.registerNode(n.id, img);
        return img;
    },
    patch(element, patch) {
        if (patch.src !== undefined) { (element as HTMLImageElement).src = patch.src; return true; }
        return false;
    },
};

uiComponentRegistry.register('image', imageRenderer,
    (src: string, alt?: string, style?: Record<string, string>, id?: string) =>
        ({ type: 'image', src, alt, style, id }),
);

// ── separator ─────────────────────────────────────────────

const separatorRenderer: UiComponentRenderer = {
    render(node, ctx) {
        const el = document.createElement('div');
        el.dataset.controlType = 'separator';
        if (node.id) el.dataset.controlId = node.id;
        el.classList.add('window-ui-separator');
        ctx.applyStyle(el, node.style);
        ctx.registerNode(node.id, el);
        return el;
    },
};

uiComponentRegistry.register('separator', separatorRenderer,
    (style?: Record<string, string>, id?: string) =>
        ({ type: 'separator', style, id }),
);

// ── progress ──────────────────────────────────────────────

const progressRenderer: UiComponentRenderer = {
    render(node, ctx) {
        const n = node as Extract<WindowUiNode, { type: 'progress' }>;
        const el = document.createElement('div');
        el.dataset.controlType = 'progress';
        if (n.id) el.dataset.controlId = n.id;
        el.classList.add('window-ui-progress');
        ctx.applyStyle(el, n.style);

        const fill = document.createElement('div');
        fill.className = 'window-ui-progress-fill';
        const targetWidth = Math.max(0, Math.min(100, n.value));
        fill.style.width = '0%';
        if (n.color) fill.style.background = n.color;
        el.appendChild(fill);
        requestAnimationFrame(() => { fill.style.width = `${targetWidth}%`; });

        ctx.registerNode(n.id, el);
        return el;
    },
    patch(element, patch) {
        let handled = false;
        if (patch.value !== undefined) {
            const fill = element.querySelector('.window-ui-progress-fill') as HTMLElement;
            if (fill) { fill.style.width = `${Math.max(0, Math.min(100, Number(patch.value)))}%`; handled = true; }
        }
        if (patch.color !== undefined) {
            const fill = element.querySelector('.window-ui-progress-fill') as HTMLElement;
            if (fill) { fill.style.background = patch.color; handled = true; }
        }
        return handled;
    },
};

uiComponentRegistry.register('progress', progressRenderer,
    (value: number, color?: string, style?: Record<string, string>, id?: string) =>
        ({ type: 'progress', value, color, style, id }),
);

// ── list ──────────────────────────────────────────────────

const listRenderer: UiComponentRenderer = {
    render(node, ctx) {
        const n = node as Extract<WindowUiNode, { type: 'list' }>;
        const el = document.createElement('div');
        el.dataset.controlType = 'list';
        if (n.id) el.dataset.controlId = n.id;
        el.classList.add('window-ui-list');
        ctx.applyStyle(el, n.style);
        for (const child of toIterable(n.children)) el.appendChild(ctx.renderChild(child));
        ctx.registerNode(n.id, el);
        return el;
    },
    patch(element, patch, ctx) {
        if (patch.children !== undefined) {
            element.replaceChildren();
            for (const child of toIterable(patch.children)) element.appendChild(ctx.renderChild(child));
            return true;
        }
        return false;
    },
};

uiComponentRegistry.register('list', listRenderer,
    (children: unknown[], style?: Record<string, string>, id?: string, events?: string[]) =>
        ({ type: 'list', children, style, id, ...(events ? { events } : {}) }),
);

// ── panel ─────────────────────────────────────────────────

const panelRenderer: UiComponentRenderer = {
    render(node, ctx) {
        const n = node as Extract<WindowUiNode, { type: 'panel' }>;
        const el = document.createElement('div');
        el.dataset.controlType = 'panel';
        if (n.id) el.dataset.controlId = n.id;
        el.classList.add('window-ui-panel');
        ctx.applyStyle(el, n.style);
        for (const child of toIterable(n.children)) el.appendChild(ctx.renderChild(child));
        ctx.registerNode(n.id, el);
        return el;
    },
    patch(element, patch, ctx) {
        if (patch.children !== undefined) {
            element.replaceChildren();
            for (const child of toIterable(patch.children)) element.appendChild(ctx.renderChild(child));
            return true;
        }
        return false;
    },
};

uiComponentRegistry.register('panel', panelRenderer,
    (children: unknown[], style?: Record<string, string>, id?: string, events?: string[]) =>
        ({ type: 'panel', children, style, id, ...(events ? { events } : {}) }),
);

// ── stack ─────────────────────────────────────────────────

const stackRenderer: UiComponentRenderer = {
    render(node, ctx) {
        const n = node as Extract<WindowUiNode, { type: 'stack' }>;
        const el = document.createElement('div');
        el.dataset.controlType = 'stack';
        if (n.id) el.dataset.controlId = n.id;
        el.classList.add('window-ui-stack');
        if (!n.style?.flexDirection) {
            el.style.display = 'flex';
            el.style.flexDirection = 'column';
        }
        ctx.applyStyle(el, n.style);
        for (const child of toIterable(n.children)) el.appendChild(ctx.renderChild(child));
        ctx.registerNode(n.id, el);
        return el;
    },
    patch(element, patch, ctx) {
        if (patch.children !== undefined) {
            element.replaceChildren();
            for (const child of toIterable(patch.children)) element.appendChild(ctx.renderChild(child));
            return true;
        }
        return false;
    },
};

uiComponentRegistry.register('stack', stackRenderer,
    (children: unknown[], style?: Record<string, string>, id?: string, events?: string[]) =>
        ({ type: 'stack', children, style, id, ...(events ? { events } : {}) }),
);

// ── video ─────────────────────────────────────────────────────

const videoRenderer: UiComponentRenderer = {
    render(node, ctx) {
        const n = node as Extract<WindowUiNode, { type: 'video' }>;
        const video = document.createElement('video');
        video.className = 'window-ui-video';
        video.dataset.controlType = 'video';
        if (n.id) video.dataset.controlId = n.id;
        video.src = n.src;
        if (n.poster) video.poster = n.poster;
        video.autoplay = n.autoplay === true;
        video.controls = n.controls ?? true;
        video.loop = n.loop === true;
        video.muted = n.muted === true;
        ctx.applyStyle(video, n.style);

        if (n.id) {
            const dispatchPlay = ctx.bindEvent(n.id, 'play');
            const dispatchPause = ctx.bindEvent(n.id, 'pause');
            const dispatchEnded = ctx.bindEvent(n.id, 'ended');
            video.addEventListener('play', () => dispatchPlay());
            video.addEventListener('pause', () => dispatchPause());
            video.addEventListener('ended', () => dispatchEnded());
        }

        ctx.registerNode(n.id, video);
        return video;
    },
    patch(element, patch) {
        const video = element as HTMLVideoElement;
        let handled = false;
        if (patch.src !== undefined) { video.src = patch.src; handled = true; }
        if (patch.poster !== undefined) { video.poster = patch.poster; handled = true; }
        if (patch.autoplay !== undefined) { video.autoplay = patch.autoplay; handled = true; }
        if (patch.controls !== undefined) { video.controls = patch.controls; handled = true; }
        if (patch.loop !== undefined) { video.loop = patch.loop; handled = true; }
        if (patch.muted !== undefined) { video.muted = patch.muted; handled = true; }
        return handled;
    },
};

uiComponentRegistry.register('video', videoRenderer,
    (src: string, poster?: string, controls?: boolean, autoplay?: boolean, loop?: boolean, muted?: boolean, style?: Record<string, string>, id?: string) =>
        ({ type: 'video', src, poster, controls, autoplay, loop, muted, style, id }),
);
