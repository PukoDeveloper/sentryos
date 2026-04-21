// ── sentryos-plugin-monaco-editor ─────────────────────────────
// Registers the `code-editor` UI component backed by Monaco Editor
// and the `editor` Host API (getValue / setValue / setLanguage /
// destroyWorkspace) for use inside sandboxed applications.

import type * as Monaco from 'monaco-editor';
import type { SentryPlugin, PluginContext, RenderContext, UiComponentRenderer } from 'sentryos-sdk';
import type { WindowUiNode, WindowUiNodePatch } from 'sentryos-sdk';
import type { ApiFactoryContext } from 'sentryos-sdk';

// ── Editor Registry ────────────────────────────────────────────
// Key: `${processAppId}::${windowId}::${nodeId}`

const editorMap = new Map<string, Monaco.editor.IStandaloneCodeEditor>();

function editorKey(processAppId: string, windowId: string, nodeId: string): string {
  return `${processAppId}::${windowId}::${nodeId}`;
}

// ── Monaco Loader ──────────────────────────────────────────────

let monacoInstance: typeof Monaco | null = null;
let monacoLoadPromise: Promise<typeof Monaco> | null = null;

function ensureMonaco(): Promise<typeof Monaco> {
  if (monacoInstance) return Promise.resolve(monacoInstance);
  if (monacoLoadPromise) return monacoLoadPromise;

  monacoLoadPromise = import('monaco-editor').then((m) => {
    // Configure minimal stub workers so Monaco can start without a bundler
    // worker setup. This disables rich IntelliSense but keeps syntax
    // highlighting and basic editing fully functional.
    const win = window as Window & {
      MonacoEnvironment?: { getWorker: () => Worker };
    };
    if (!win.MonacoEnvironment) {
      win.MonacoEnvironment = {
        getWorker() {
          const stub = 'self.onmessage=function(){}';
          return new Worker(
            URL.createObjectURL(new Blob([stub], { type: 'application/javascript' })),
          );
        },
      };
    }
    monacoInstance = m;
    return m;
  });

  return monacoLoadPromise;
}

// ── ResizeObserver helper ──────────────────────────────────────

const observerMap = new Map<HTMLElement, ResizeObserver>();

function observeResize(container: HTMLElement, editor: Monaco.editor.IStandaloneCodeEditor): void {
  const ro = new ResizeObserver(() => editor.layout());
  ro.observe(container);
  observerMap.set(container, ro);
}

function unobserveResize(container: HTMLElement): void {
  observerMap.get(container)?.disconnect();
  observerMap.delete(container);
}

// ── Model URI helper ───────────────────────────────────────────

function modelUri(monaco: typeof Monaco, workspace: string, path: string): Monaco.Uri {
  return monaco.Uri.parse(`sentryos://${workspace}/${path.replace(/^\//, '')}`);
}

// ── Renderer ──────────────────────────────────────────────────

const codeEditorRenderer: UiComponentRenderer = {
  render(node: WindowUiNode, ctx: RenderContext): HTMLElement {
    const n = node as WindowUiNode & {
      value?: string;
      language?: string;
      workspace?: string;
      path?: string;
      theme?: string;
      readOnly?: boolean;
      minimap?: boolean;
      lineNumbers?: string;
      wordWrap?: string;
      fontSize?: number;
      tabSize?: number;
      events?: string[];
    };

    const container = document.createElement('div');
    container.dataset['controlType'] = 'code-editor';
    if (n.id) container.dataset['controlId'] = n.id as string;
    container.classList.add('window-ui-code-editor');
    ctx.applyStyle(container, n.style);

    ctx.registerNode(n.id as string | undefined, container);

    // Monaco must be loaded asynchronously; create a placeholder until ready.
    ensureMonaco().then((monaco) => {
      const workspace = (n.workspace as string | undefined) ?? 'default';
      const path = (n.path as string | undefined) ?? (n.id as string | undefined) ?? 'untitled';
      const uri = modelUri(monaco, workspace, path);

      let model = monaco.editor.getModel(uri);
      if (!model) {
        model = monaco.editor.createModel(n.value ?? '', n.language ?? 'plaintext', uri);
      } else if (n.value !== undefined) {
        model.setValue(n.value);
      }

      const editor = monaco.editor.create(container, {
        model,
        theme: n.theme ?? 'vs-dark',
        readOnly: n.readOnly === true,
        minimap: { enabled: n.minimap !== false },
        lineNumbers: (n.lineNumbers as Monaco.editor.LineNumbersType | undefined) ?? 'on',
        wordWrap: (n.wordWrap as 'off' | 'on' | 'wordWrapColumn' | 'bounded' | undefined) ?? 'off',
        fontSize: n.fontSize ?? 14,
        tabSize: n.tabSize ?? 2,
        automaticLayout: false,
        scrollBeyondLastLine: false,
        fixedOverflowWidgets: true,
      });

      observeResize(container, editor);

      if (n.id) {
        const key = editorKey(ctx.processAppId, ctx.windowId, n.id as string);
        editorMap.set(key, editor);

        if ((n.events as string[] | undefined)?.includes('change')) {
          const dispatch = ctx.bindEvent(n.id as string, 'change');
          editor.onDidChangeModelContent(() => {
            dispatch({ value: editor.getValue() });
          });
        }
      }
    }).catch((err: unknown) => {
      container.textContent = '[monaco-editor] Failed to load editor: ' + String(err);
    });

    return container;
  },

  patch(element: HTMLElement, patch: WindowUiNodePatch, _ctx: RenderContext): boolean {
    const nodeId = element.dataset['controlId'];
    if (!nodeId) return false;

    // Find the editor by scanning editorMap keys that end with ::nodeId
    let foundEditor: Monaco.editor.IStandaloneCodeEditor | undefined;
    for (const [key, ed] of editorMap) {
      if (key.endsWith(`::${nodeId}`)) { foundEditor = ed; break; }
    }
    if (!foundEditor) return false;

    let handled = false;
    if (patch.value !== undefined) {
      if (foundEditor.getValue() !== String(patch.value)) foundEditor.setValue(String(patch.value));
      handled = true;
    }
    if ((patch as { language?: string }).language !== undefined && monacoInstance) {
      const model = foundEditor.getModel();
      if (model) monacoInstance.editor.setModelLanguage(model, (patch as { language: string }).language);
      handled = true;
    }
    if ((patch as { readOnly?: boolean }).readOnly !== undefined) {
      foundEditor.updateOptions({ readOnly: (patch as { readOnly: boolean }).readOnly });
      handled = true;
    }
    return handled;
  },
};

// ── API Builder ────────────────────────────────────────────────

function codeEditorApiBuilder(
  options: unknown,
): Record<string, unknown> {
  const opts = (options ?? {}) as Record<string, unknown>;
  return {
    type: 'code-editor',
    id: opts['id'],
    value: opts['value'] !== undefined ? opts['value'] : '',
    language: opts['language'] ?? 'plaintext',
    workspace: opts['workspace'] ?? 'default',
    path: opts['path'] ?? opts['id'] ?? 'untitled',
    theme: opts['theme'] ?? 'vs-dark',
    readOnly: opts['readOnly'] === true,
    minimap: opts['minimap'] !== false,
    lineNumbers: opts['lineNumbers'] ?? 'on',
    wordWrap: opts['wordWrap'] ?? 'off',
    fontSize: opts['fontSize'] ?? 14,
    tabSize: opts['tabSize'] ?? 2,
    style: opts['style'],
    events: opts['events'],
  };
}

// ── Plugin ─────────────────────────────────────────────────────

function setup(context: PluginContext): void {
  context.registerUiComponent('code-editor', codeEditorRenderer, codeEditorApiBuilder);

  context.registerApi(
    'editor',
    ({ process }: ApiFactoryContext) => {
      const windowManager = context.resolve('windowManager');

      return {
        /**
         * Get the current text content of a code-editor by its node ID.
         * Returns `null` if the editor is not found or not yet initialised.
         */
        getValue(...args: unknown[]): string | null {
          const [editorId] = args as [string];
          const windows = windowManager.getWindowsByProcess(process.processAppId);
          for (const wid of windows) {
            const key = editorKey(process.processAppId, wid, String(editorId));
            const ed = editorMap.get(key);
            if (ed) return ed.getValue();
          }
          return null;
        },

        /**
         * Set the text content of a code-editor.
         */
        setValue(...args: unknown[]): void {
          const [editorId, value] = args as [string, string];
          const windows = windowManager.getWindowsByProcess(process.processAppId);
          for (const wid of windows) {
            const key = editorKey(process.processAppId, wid, String(editorId));
            const ed = editorMap.get(key);
            if (ed) { ed.setValue(String(value)); return; }
          }
        },

        /**
         * Change the language mode of a code-editor.
         */
        setLanguage(...args: unknown[]): void {
          const [editorId, language] = args as [string, string];
          if (!monacoInstance) return;
          const windows = windowManager.getWindowsByProcess(process.processAppId);
          for (const wid of windows) {
            const key = editorKey(process.processAppId, wid, String(editorId));
            const ed = editorMap.get(key);
            if (ed) {
              const model = ed.getModel();
              if (model) monacoInstance.editor.setModelLanguage(model, String(language));
              return;
            }
          }
        },

        /**
         * Dispose all Monaco models and editors associated with a workspace.
         * Call this when the application window is closed to free memory.
         */
        destroyWorkspace(...args: unknown[]): void {
          const [workspaceId] = args as [string];
          if (!monacoInstance) return;

          // Dispose editors registered under this process
          for (const [key, ed] of editorMap) {
            if (key.startsWith(`${process.processAppId}::`)) {
              const domNode = ed.getDomNode();
              if (domNode) unobserveResize(domNode);
              ed.dispose();
              editorMap.delete(key);
            }
          }

          // Dispose Monaco models whose URI belongs to this workspace
          for (const model of monacoInstance.editor.getModels()) {
            const uri = model.uri.toString();
            if (uri.startsWith(`sentryos://${String(workspaceId)}/`)) {
              model.dispose();
            }
          }
        },
      };
    },
    ['window'],
    'editor',
  );

  context.log('INFO', 'monaco-editor: code-editor component and editor API registered');
}

function teardown(context: PluginContext): void {
  // Dispose all remaining editors managed by this plugin
  for (const [key, ed] of editorMap) {
    try {
      const domNode = ed.getDomNode();
      if (domNode) unobserveResize(domNode);
      ed.dispose();
    } catch {
      // ignore disposal errors during teardown
    }
    editorMap.delete(key);
  }
  context.log('INFO', 'monaco-editor: code-editor component and editor API unregistered');
}

const monacoEditorPlugin: SentryPlugin = {
  pluginName: 'sentryos-monaco-editor',
  pluginVersion: '1.0.0',
  pluginDescription:
    '提供 code-editor UI 元件（Monaco Editor）及 OS.editor.* Host API，' +
    '支援語法高亮、多語言、工作區模型管理。',
  author: 'SentryOS',
  setup,
  teardown,
};

export default monacoEditorPlugin;
