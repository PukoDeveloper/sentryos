// ── sentryos-code-editor plugin ───────────────────────────────
// Registers the `code-editor` UI component and the
// `editor` Host API (getValue / setValue / setLanguage / destroyWorkspace).
//
// The underlying editor engine is loaded lazily from esm.sh CDN the first
// time an editor node is rendered.  A stub web-worker is injected so that
// it can initialise without a bundler-specific worker setup;
// syntax highlighting works fully while rich IntelliSense features
// that depend on dedicated workers are disabled.
//
// Standalone usage: list this file in public/plugins.json.
// Bundled usage:    import 'sentryos-plugin-code-editor' in main.ts.

// ── Editor Registry ────────────────────────────────────────────
// Key: `${processAppId}::${windowId}::${nodeId}`

/** @type {Map<string, import('monaco-editor').editor.IStandaloneCodeEditor>} */
const editorMap = new Map();

/**
 * @param {string} processAppId
 * @param {string} windowId
 * @param {string} nodeId
 * @returns {string}
 */
function editorKey(processAppId, windowId, nodeId) {
    return `${processAppId}::${windowId}::${nodeId}`;
}

// ── Monaco Loader ──────────────────────────────────────────────

let monacoInstance = null;
let monacoLoadPromise = null;

function ensureMonaco() {
    if (monacoInstance) return Promise.resolve(monacoInstance);
    if (monacoLoadPromise) return monacoLoadPromise;

    monacoLoadPromise = import('https://esm.sh/monaco-editor@0.55.1').then((m) => {
        if (!window.MonacoEnvironment) {
            const stub = 'self.onmessage=function(){}';
            window.MonacoEnvironment = {
                getWorker() {
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

const observerMap = new Map();

function observeResize(container, editor) {
    const ro = new ResizeObserver(() => editor.layout());
    ro.observe(container);
    observerMap.set(container, ro);
}

function unobserveResize(container) {
    const ro = observerMap.get(container);
    if (ro) { ro.disconnect(); observerMap.delete(container); }
}

// ── Model URI helper ───────────────────────────────────────────

function modelUri(monaco, workspace, path) {
    return monaco.Uri.parse(`sentryos://${workspace}/${path.replace(/^\//, '')}`);
}

// ── Renderer ──────────────────────────────────────────────────

const codeEditorRenderer = {
    render(node, ctx) {
        const container = document.createElement('div');
        container.dataset.controlType = 'code-editor';
        if (node.id) container.dataset.controlId = node.id;
        container.classList.add('window-ui-code-editor');
        ctx.applyStyle(container, node.style);
        ctx.registerNode(node.id, container);

        ensureMonaco().then((monaco) => {
            const workspace = node.workspace || 'default';
            const path = node.path || node.id || 'untitled';
            const uri = modelUri(monaco, workspace, path);

            let model = monaco.editor.getModel(uri);
            if (!model) {
                model = monaco.editor.createModel(node.value || '', node.language || 'plaintext', uri);
            } else if (node.value !== undefined) {
                model.setValue(node.value);
            }

            const editor = monaco.editor.create(container, {
                model,
                theme: node.theme || 'vs-dark',
                readOnly: node.readOnly === true,
                minimap: { enabled: node.minimap !== false },
                lineNumbers: node.lineNumbers || 'on',
                wordWrap: node.wordWrap || 'off',
                fontSize: node.fontSize || 14,
                tabSize: node.tabSize || 2,
                automaticLayout: false,
                scrollBeyondLastLine: false,
                fixedOverflowWidgets: true,
            });

            observeResize(container, editor);

            if (node.id) {
                const key = editorKey(ctx.processAppId, ctx.windowId, node.id);
                editorMap.set(key, editor);

                if (Array.isArray(node.events) && node.events.includes('change')) {
                    const dispatch = ctx.bindEvent(node.id, 'change');
                    editor.onDidChangeModelContent(() => {
                        dispatch({ value: editor.getValue() });
                    });
                }
            }
        }).catch((err) => {
            container.textContent = '[monaco-editor] Failed to load editor: ' + String(err);
        });

        return container;
    },

    patch(element, patch) {
        const nodeId = element.dataset.controlId;
        if (!nodeId) return false;

        let foundEditor;
        for (const [key, ed] of editorMap) {
            if (key.endsWith(`::${nodeId}`)) { foundEditor = ed; break; }
        }
        if (!foundEditor) return false;

        let handled = false;
        if (patch.value !== undefined) {
            if (foundEditor.getValue() !== patch.value) foundEditor.setValue(patch.value);
            handled = true;
        }
        if (patch.language !== undefined && monacoInstance) {
            const model = foundEditor.getModel();
            if (model) monacoInstance.editor.setModelLanguage(model, patch.language);
            handled = true;
        }
        if (patch.readOnly !== undefined) {
            foundEditor.updateOptions({ readOnly: patch.readOnly });
            handled = true;
        }
        return handled;
    },
};

// ── API Builder ────────────────────────────────────────────────

function codeEditorApiBuilder(options) {
    const opts = options || {};
    return {
        type: 'code-editor',
        id: opts.id,
        value: opts.value !== undefined ? opts.value : '',
        language: opts.language || 'plaintext',
        workspace: opts.workspace || 'default',
        path: opts.path || opts.id || 'untitled',
        theme: opts.theme || 'vs-dark',
        readOnly: opts.readOnly === true,
        minimap: opts.minimap !== false,
        lineNumbers: opts.lineNumbers || 'on',
        wordWrap: opts.wordWrap || 'off',
        fontSize: opts.fontSize || 14,
        tabSize: opts.tabSize || 2,
        style: opts.style,
        events: opts.events,
    };
}

// ── Plugin ─────────────────────────────────────────────────────

function setup(context) {
    context.registerUiComponent('code-editor', codeEditorRenderer, codeEditorApiBuilder);

    context.registerApi('editor', ({ process }) => {
        const windowManager = context.resolve('windowManager');

        return {
            /**
             * Get the current text content of a code-editor by its node ID.
             * @param {string} editorId
             * @returns {string | null}
             */
            getValue(editorId) {
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
             * @param {string} editorId
             * @param {string} value
             */
            setValue(editorId, value) {
                const windows = windowManager.getWindowsByProcess(process.processAppId);
                for (const wid of windows) {
                    const key = editorKey(process.processAppId, wid, String(editorId));
                    const ed = editorMap.get(key);
                    if (ed) { ed.setValue(String(value)); return; }
                }
            },

            /**
             * Change the language mode of a code-editor.
             * @param {string} editorId
             * @param {string} language
             */
            setLanguage(editorId, language) {
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
             * Dispose all editors and Monaco models for a workspace.
             * Call this when the application window closes.
             * @param {string} workspaceId
             */
            destroyWorkspace(workspaceId) {
                if (!monacoInstance) return;
                for (const [key, ed] of editorMap) {
                    if (key.startsWith(`${process.processAppId}::`)) {
                        const domNode = ed.getDomNode();
                        if (domNode) unobserveResize(domNode);
                        ed.dispose();
                        editorMap.delete(key);
                    }
                }
                for (const model of monacoInstance.editor.getModels()) {
                    const uri = model.uri.toString();
                    if (uri.startsWith(`sentryos://${String(workspaceId)}/`)) {
                        model.dispose();
                    }
                }
            },
        };
    }, ['window'], 'editor');

    context.log('INFO', 'monaco-editor: code-editor component and editor API registered');
}

function teardown(context) {
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

export default {
    pluginName: 'sentryos-code-editor',
    pluginVersion: '1.0.0',
    pluginDescription:
        '提供 code-editor UI 元件及 OS.editor.* Host API，' +
        '支援語法高亮、多語言、工作區模型管理。',
    author: 'SentryOS',
    setup,
    teardown,
};
