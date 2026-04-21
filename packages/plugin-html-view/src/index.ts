// ── sentryos-plugin-html-view ──────────────────────────────────
// Renders HTML strings via plain DOM (no iframe sandbox).
// Events are declared via data-event attributes and bridged back to the
// application Runtime.  <script> tag contents are extracted and forwarded
// to the sandboxed Runtime instead of being evaluated in the host page.

import type { SentryPlugin, PluginContext, RenderContext, UiComponentRenderer } from 'sentryos-sdk';
import type { WindowUiNode, WindowUiNodePatch, WindowUiStyle } from 'sentryos-sdk';

// ── HTML sanitisation ─────────────────────────────────────────

interface SanitizeResult {
  container: HTMLDivElement;
  scripts: string[];
}

/**
 * Strip unsafe elements/attributes from an HTML string and extract
 * any inline <script> bodies (to be dispatched to the sandbox later).
 */
function sanitizeHtml(html: string): SanitizeResult {
  const temp = document.createElement('div');
  temp.innerHTML = html;

  const scripts: string[] = [];
  for (const el of temp.querySelectorAll('script')) {
    if (el.textContent?.trim()) {
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

// ── Data-event binding ────────────────────────────────────────

/**
 * Walk the container for elements that carry `data-event` attributes
 * and wire up DOM listeners that dispatch back to the application Runtime
 * via `ctx.bindEvent()`.
 */
function bindDataEvents(container: HTMLElement, ctx: RenderContext): void {
  for (const el of container.querySelectorAll<HTMLElement>('[data-event]')) {
    const eventName = el.dataset['event'];
    if (!eventName) continue;

    const controlId = el.dataset['id'];
    const staticValue = el.dataset['value'];
    const dispatch = ctx.bindEvent(controlId, eventName);

    if (eventName === 'input' || eventName === 'change') {
      el.addEventListener(eventName, () => {
        const isFormField =
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement ||
          el instanceof HTMLSelectElement;
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

// ── Renderer ──────────────────────────────────────────────────

interface HtmlViewNode extends WindowUiNode {
  html?: string;
}

interface HtmlViewPatch extends WindowUiNodePatch {
  html?: string;
}

const htmlViewRenderer: UiComponentRenderer = {
  render(node: WindowUiNode, ctx: RenderContext): HTMLElement {
    const typedNode = node as HtmlViewNode;
    const container = document.createElement('div');
    container.dataset['controlType'] = 'html-view';
    if (typedNode.id) container.dataset['controlId'] = typedNode.id;
    container.classList.add('window-ui-html-view');
    ctx.applyStyle(container, typedNode.style as WindowUiStyle | undefined);

    const { container: sanitized, scripts } = sanitizeHtml(typedNode.html ?? '');
    container.append(...Array.from(sanitized.childNodes));

    bindDataEvents(container, ctx);
    ctx.registerNode(typedNode.id, container);

    if (scripts.length > 0) {
      ctx.dispatchScript(scripts.join('\n'));
    }

    return container;
  },

  patch(element: HTMLElement, patch: WindowUiNodePatch, ctx: RenderContext): boolean {
    const typedPatch = patch as HtmlViewPatch;
    if (typedPatch.html !== undefined) {
      const { container: sanitized, scripts } = sanitizeHtml(typedPatch.html);
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

// ── API Builder ───────────────────────────────────────────────

function htmlViewApiBuilder(
  html: unknown,
  style: unknown,
  id: unknown,
): Record<string, unknown> {
  return { type: 'html-view', html: html ?? '', style, id };
}

// ── Plugin ────────────────────────────────────────────────────

function setup(context: PluginContext): void {
  context.registerUiComponent('html-view', htmlViewRenderer, htmlViewApiBuilder);

  // Register OS.htmlView — DOM manipulation APIs for use inside <script> blocks
  context.registerApi(
    'htmlView',
    ({ process }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const windowManager = context.resolve('windowManager') as any;

      return {
        /**
         * Append HTML to an existing html-view node.
         * <script> bodies are extracted and dispatched to the sandboxed Runtime.
         */
        append(...args: unknown[]) {
          const [windowId, viewId, html] = args as [string, string, string];
          const container = windowManager.getNodeElement(
            process.processAppId, windowId, viewId,
          ) as HTMLElement | null;
          if (!container) return { success: false, error: 'NodeNotFound' };

          const ctx = windowManager.buildRenderContextFor(
            process.processAppId, windowId,
          ) as RenderContext | null;
          if (!ctx) return { success: false, error: 'WindowNotFound' };

          const { container: sanitized, scripts } = sanitizeHtml(
            typeof html === 'string' ? html : '',
          );
          for (const n of Array.from(sanitized.childNodes)) container.appendChild(n);
          bindDataEvents(container, ctx);

          if (scripts.length > 0) {
            ctx.dispatchScript(scripts.join('\n'));
          }

          return { success: true };
        },

        /**
         * Remove the first child element whose `data-id` matches `elementId`
         * from the specified html-view node.
         */
        remove(...args: unknown[]) {
          const [windowId, viewId, elementId] = args as [string, string, string];
          const container = windowManager.getNodeElement(
            process.processAppId, windowId, viewId,
          ) as HTMLElement | null;
          if (!container) return { success: false, error: 'NodeNotFound' };

          const target = container.querySelector(
            `[data-id="${CSS.escape(String(elementId))}"]`,
          );
          if (!target) return { success: false, error: 'NodeNotFound' };
          target.remove();

          return { success: true };
        },
      };
    },
    ['window'],
    'htmlView',
  );

  context.log('INFO', 'html-view component registered');
}

function teardown(context: PluginContext): void {
  context.log('INFO', 'html-view component unregistered');
}

const htmlViewPlugin: SentryPlugin = {
  pluginName: 'sentryos-html-view',
  pluginVersion: '1.0.0',
  pluginDescription:
    '提供 html-view UI 元件，以純 DOM 渲染 HTML，事件透過 data-event 屬性橋接回 Runtime 執行。<script> 標籤會被提取後送回沙箱 Runtime 執行。',
  author: 'SentryOS',
  setup,
  teardown,
};

export default htmlViewPlugin;
