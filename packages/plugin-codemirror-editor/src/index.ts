// ── sentryos-plugin-codemirror-editor ─────────────────────────
// Registers the `codemirror-editor` UI component backed by CodeMirror 6
// and the `codemirrorEditor` Host API (getValue / setValue / setLanguage /
// destroyWorkspace) for use inside sandboxed applications.

import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, type ViewUpdate } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, indentOnInput } from '@codemirror/language';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';

import type { SentryPlugin, PluginContext, RenderContext, UiComponentRenderer } from 'sentryos-sdk';
import type { WindowUiNode, WindowUiNodePatch } from 'sentryos-sdk';
import type { ApiFactoryContext } from 'sentryos-sdk';

// ── Language registry ──────────────────────────────────────────

type LanguageExtensionFactory = () => import('@codemirror/state').Extension;

const languageRegistry: Record<string, LanguageExtensionFactory> = {
  javascript: () => javascript(),
  typescript: () => javascript({ typescript: true }),
  jsx:        () => javascript({ jsx: true }),
  tsx:        () => javascript({ jsx: true, typescript: true }),
  python:     () => python(),
};

function languageExtension(lang: string): import('@codemirror/state').Extension | null {
  const factory = languageRegistry[lang.toLowerCase()];
  return factory ? factory() : null;
}

// ── Editor Record ──────────────────────────────────────────────
// Key: `${processAppId}::${windowId}::${nodeId}`

interface EditorRecord {
  view: EditorView;
  languageCompartment: Compartment;
  readOnlyCompartment: Compartment;
}

const editorMap = new Map<string, EditorRecord>();

function editorKey(processAppId: string, windowId: string, nodeId: string): string {
  return `${processAppId}::${windowId}::${nodeId}`;
}

// ── ResizeObserver helper ──────────────────────────────────────

const observerMap = new Map<HTMLElement, ResizeObserver>();

function observeResize(container: HTMLElement, view: EditorView): void {
  const ro = new ResizeObserver(() => view.requestMeasure());
  ro.observe(container);
  observerMap.set(container, ro);
}

function unobserveResize(container: HTMLElement): void {
  observerMap.get(container)?.disconnect();
  observerMap.delete(container);
}

// ── Theme helper ───────────────────────────────────────────────

function themeExtension(theme: string): import('@codemirror/state').Extension {
  if (theme === 'one-dark') return oneDark;
  // Default to a light base theme; use EditorView.theme for dark bg variants
  return EditorView.baseTheme({});
}

// ── Renderer ──────────────────────────────────────────────────

const codemirrorEditorRenderer: UiComponentRenderer = {
  render(node: WindowUiNode, ctx: RenderContext): HTMLElement {
    const n = node as WindowUiNode & {
      value?: string;
      language?: string;
      theme?: string;
      readOnly?: boolean;
      lineNumbers?: boolean;
      wordWrap?: boolean;
      fontSize?: number;
      tabSize?: number;
      events?: string[];
    };

    const container = document.createElement('div');
    container.dataset['controlType'] = 'codemirror-editor';
    if (n.id) container.dataset['controlId'] = n.id as string;
    container.classList.add('window-ui-codemirror-editor');
    ctx.applyStyle(container, n.style);

    ctx.registerNode(n.id as string | undefined, container);

    const languageCompartment = new Compartment();
    const readOnlyCompartment = new Compartment();
    const tabSizeCompartment = new Compartment();
    const wrapCompartment = new Compartment();

    const tabSizeVal = n.tabSize ?? 2;
    const langExt = languageExtension(n.language ?? 'plaintext');
    const isReadOnly = n.readOnly === true;
    const isWrap = n.wordWrap === true;
    const theme = n.theme ?? 'one-dark';
    const showLineNumbers = n.lineNumbers !== false;

    const extensions: import('@codemirror/state').Extension[] = [
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      foldGutter(),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...completionKeymap,
        indentWithTab,
      ]),
      themeExtension(theme),
      languageCompartment.of(langExt ?? []),
      readOnlyCompartment.of(EditorState.readOnly.of(isReadOnly)),
      tabSizeCompartment.of(EditorState.tabSize.of(tabSizeVal)),
      wrapCompartment.of(isWrap ? EditorView.lineWrapping : []),
    ];

    if (showLineNumbers) {
      extensions.push(lineNumbers());
    }

    if (n.fontSize) {
      extensions.push(EditorView.theme({
        '&': { fontSize: `${n.fontSize}px` },
      }));
    }

    const dispatchChange = n.id && (n.events as string[] | undefined)?.includes('change')
      ? ctx.bindEvent(n.id as string, 'change')
      : null;

    if (dispatchChange) {
      extensions.push(EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged) {
          dispatchChange({ value: update.state.doc.toString() });
        }
      }));
    }

    const state = EditorState.create({
      doc: n.value ?? '',
      extensions,
    });

    const view = new EditorView({ state, parent: container });

    observeResize(container, view);

    if (n.id) {
      const key = editorKey(ctx.processAppId, ctx.windowId, n.id as string);
      editorMap.set(key, { view, languageCompartment, readOnlyCompartment });
    }

    return container;
  },

  patch(element: HTMLElement, patch: WindowUiNodePatch, _ctx: RenderContext): boolean {
    const nodeId = element.dataset['controlId'];
    if (!nodeId) return false;

    let record: EditorRecord | undefined;
    for (const [key, rec] of editorMap) {
      if (key.endsWith(`::${nodeId}`)) { record = rec; break; }
    }
    if (!record) return false;

    const { view, languageCompartment, readOnlyCompartment } = record;
    const effects: import('@codemirror/state').StateEffect<unknown>[] = [];
    let handled = false;

    if (patch.value !== undefined) {
      const current = view.state.doc.toString();
      const next = String(patch.value);
      if (current !== next) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
      }
      handled = true;
    }

    const p = patch as { language?: string; readOnly?: boolean };

    if (p.language !== undefined) {
      const langExt = languageExtension(p.language);
      effects.push(languageCompartment.reconfigure(langExt ?? []));
      handled = true;
    }

    if (p.readOnly !== undefined) {
      effects.push(readOnlyCompartment.reconfigure(EditorState.readOnly.of(p.readOnly)));
      handled = true;
    }

    if (effects.length > 0) {
      view.dispatch({ effects });
    }

    return handled;
  },
};

// ── API Builder ────────────────────────────────────────────────

function codemirrorEditorApiBuilder(
  options: unknown,
): Record<string, unknown> {
  const opts = (options ?? {}) as Record<string, unknown>;
  return {
    type: 'codemirror-editor',
    id: opts['id'],
    value: opts['value'] !== undefined ? opts['value'] : '',
    language: opts['language'] ?? 'plaintext',
    theme: opts['theme'] ?? 'one-dark',
    readOnly: opts['readOnly'] === true,
    lineNumbers: opts['lineNumbers'] !== false,
    wordWrap: opts['wordWrap'] === true,
    fontSize: opts['fontSize'],
    tabSize: opts['tabSize'] ?? 2,
    style: opts['style'],
    events: opts['events'],
  };
}

// ── Plugin ─────────────────────────────────────────────────────

function setup(context: PluginContext): void {
  context.registerUiComponent('codemirror-editor', codemirrorEditorRenderer, codemirrorEditorApiBuilder);

  context.registerApi(
    'codemirrorEditor',
    ({ process }: ApiFactoryContext) => {
      const windowManager = context.resolve('windowManager');

      return {
        /**
         * Get the current text content of a codemirror-editor by its node ID.
         * Returns `null` if the editor is not found or not yet initialised.
         */
        getValue(...args: unknown[]): string | null {
          const [editorId] = args as [string];
          const windows = windowManager.getWindowsByProcess(process.processAppId);
          for (const wid of windows) {
            const key = editorKey(process.processAppId, wid, String(editorId));
            const rec = editorMap.get(key);
            if (rec) return rec.view.state.doc.toString();
          }
          return null;
        },

        /**
         * Set the text content of a codemirror-editor.
         */
        setValue(...args: unknown[]): void {
          const [editorId, value] = args as [string, string];
          const windows = windowManager.getWindowsByProcess(process.processAppId);
          for (const wid of windows) {
            const key = editorKey(process.processAppId, wid, String(editorId));
            const rec = editorMap.get(key);
            if (rec) {
              const { view } = rec;
              view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: String(value) },
              });
              return;
            }
          }
        },

        /**
         * Change the language mode of a codemirror-editor.
         */
        setLanguage(...args: unknown[]): void {
          const [editorId, language] = args as [string, string];
          const windows = windowManager.getWindowsByProcess(process.processAppId);
          for (const wid of windows) {
            const key = editorKey(process.processAppId, wid, String(editorId));
            const rec = editorMap.get(key);
            if (rec) {
              const langExt = languageExtension(String(language));
              rec.view.dispatch({
                effects: rec.languageCompartment.reconfigure(langExt ?? []),
              });
              return;
            }
          }
        },

        /**
         * Dispose all CodeMirror editors associated with this process / workspace.
         * Call this when the application window is closed to free memory.
         */
        destroyWorkspace(..._args: unknown[]): void {
          for (const [key, rec] of editorMap) {
            if (key.startsWith(`${process.processAppId}::`)) {
              unobserveResize(rec.view.dom);
              rec.view.destroy();
              editorMap.delete(key);
            }
          }
        },
      };
    },
    ['window'],
    'codemirrorEditor',
  );

  context.log('INFO', 'codemirror-editor: codemirror-editor component and codemirrorEditor API registered');
}

function teardown(context: PluginContext): void {
  for (const [key, rec] of editorMap) {
    try {
      unobserveResize(rec.view.dom);
      rec.view.destroy();
    } catch {
      // ignore disposal errors during teardown
    }
    editorMap.delete(key);
  }
  context.log('INFO', 'codemirror-editor: codemirror-editor component and codemirrorEditor API unregistered');
}

const codemirrorEditorPlugin: SentryPlugin = {
  pluginName: 'sentryos-codemirror-editor',
  pluginVersion: '1.0.0',
  pluginDescription:
    '提供 codemirror-editor UI 元件（CodeMirror 6）及 OS.codemirrorEditor.* Host API，' +
    '支援語法高亮、多語言（JS/TS/JSX/TSX/Python）、Compartment 動態切換語言與唯讀模式。',
  author: 'SentryOS',
  setup,
  teardown,
};

export default codemirrorEditorPlugin;
