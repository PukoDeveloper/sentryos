// ── sentryos-plugin-python-runtime ─────────────────────────────
// Registers a Python 3 runtime engine using Pyodide (CPython compiled
// to WebAssembly). Applications can set `"engine": "python"` in their
// manifest to run their main script through this runtime.
//
// Security model — equivalent to QuickJS sandboxing:
//   • Per-process isolated Python namespace (dict used as exec globals).
//   • Restricted __builtins__: dangerous primitives (open, exec, eval,
//     compile, __import__, input, breakpoint) are removed.
//   • Restricted __import__: blocks access to OS-level modules (os, sys,
//     subprocess, socket, ctypes, threading, etc.).
//   • JS↔Python boundary: the OS API surface is injected as a JsProxy
//     object; Python code cannot reach the host JS environment beyond it.
//
// The plugin uses the RuntimeAdapter pattern so that IPC routing,
// event subscriptions, and OS API surface construction are all handled
// automatically by AdapterRuntime / BaseRuntime.

import type { SentryPlugin, PluginContext } from 'sentryos-sdk';
import type { PyodideAPI } from 'pyodide';

// ── Sandbox type ───────────────────────────────────────────────

interface PySandbox {
  /** PyProxy wrapping the per-process Python namespace dict. */
  namespace: unknown;
}

// ── Python setup code (runs once in Pyodide main globals) ─────
//
// Defines three helpers that are later retrieved via pyodide.globals.get():
//   create_namespace(os_api)     → dict  (restricted builtins + OS bound)
//   execute_in_namespace(ns, code)        (exec code in ns)
//   call_handler(ns, name, arg)  → any   (invoke ns[name](arg))

const SANDBOX_SETUP_CODE = `
import builtins as _bi

# ── Builtins removed in sandbox namespaces ─────────────────────
_BLOCKED_BUILTINS = frozenset({
    'open', 'exec', 'eval', 'compile', '__import__',
    'input', 'breakpoint', 'exit', 'quit',
    '__loader__', '__spec__',
})

# ── Top-level module names blocked in sandbox ──────────────────
_BLOCKED_MODULES = frozenset({
    'os', 'sys', 'subprocess', 'socket', 'ctypes',
    'importlib', 'pathlib', 'io', 'shutil', 'tempfile',
    '_thread', 'threading', 'multiprocessing', 'signal',
    'mmap', 'resource', 'gc', 'traceback', 'inspect',
    'ast', 'dis', 'code', 'codeop', 'linecache',
    'tokenize', 'token', 'keyword', 'symtable',
    'sysconfig', 'zipimport', '_frozen_importlib',
    '_frozen_importlib_external',
})

_orig_import = _bi.__import__

def _restricted_import(name, glbs=None, locs=None, fromlist=(), level=0):
    root = name.split('.')[0]
    if root in _BLOCKED_MODULES:
        raise ImportError(f"Module '{root}' is blocked in the SentryOS sandbox")
    return _orig_import(name, glbs, locs, fromlist, level)

# Build a shared restricted builtins dict (reused per process)
_safe_builtins = {k: v for k, v in _bi.__dict__.items() if k not in _BLOCKED_BUILTINS}
_safe_builtins['__import__'] = _restricted_import

def create_namespace(os_api_js):
    """Return a fresh sandbox namespace dict with restricted builtins and OS bound."""
    return {
        '__builtins__': _safe_builtins,
        '__name__': '__main__',
        '__doc__': None,
        'OS': os_api_js,
    }

def execute_in_namespace(ns, code):
    """Compile and exec Python source code within the sandbox namespace."""
    exec(compile(code, '<sentryos-sandbox>', 'exec'), ns)

def call_handler(ns, handler_name, arg):
    """Invoke a named callable from the sandbox namespace (used for event dispatch)."""
    fn = ns.get(handler_name)
    if callable(fn):
        return fn(arg)
    return None
`;

// ── Pyodide CDN base URL (matches npm package version) ─────────
const PYODIDE_VERSION = '0.29.3';
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

// ── Plugin ─────────────────────────────────────────────────────

function setup(context: PluginContext): void {
  void (async () => {
    let pyodide: PyodideAPI;
    try {
      const { loadPyodide } = await import('pyodide');
      pyodide = await loadPyodide({ indexURL: PYODIDE_INDEX_URL });
    } catch (err) {
      context.log('ERROR', `python-runtime: failed to load Pyodide — ${String(err)}`);
      return;
    }

    // Run sandbox setup code once in Pyodide's main globals.
    try {
      pyodide.runPython(SANDBOX_SETUP_CODE);
    } catch (err) {
      context.log('ERROR', `python-runtime: sandbox setup failed — ${String(err)}`);
      return;
    }

    // Retrieve the three Python helper functions.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const pyCreateNamespace = pyodide.globals.get('create_namespace') as (osApi: unknown) => unknown;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const pyExecute = pyodide.globals.get('execute_in_namespace') as (ns: unknown, code: string) => void;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const pyCallHandler = pyodide.globals.get('call_handler') as (ns: unknown, name: string, arg: unknown) => unknown;

    const runtime = context.createRuntime({

      // ── createSandbox ───────────────────────────────────────
      // Create an empty placeholder; the actual namespace is built in
      // injectGlobals() once the API surface is available.
      createSandbox(_pid: number): unknown {
        return { namespace: null } satisfies PySandbox;
      },

      // ── injectGlobals ───────────────────────────────────────
      // Build a restricted Python namespace dict containing the full
      // OS API surface. The JS apiSurface object is passed directly;
      // Pyodide wraps it as a JsProxy accessible from Python.
      injectGlobals(sandbox: unknown, apiSurface: Record<string, unknown>): void {
        const pySandbox = sandbox as PySandbox;
        // toPy converts the JS object so Python can traverse its properties;
        // depth:1 keeps nested values as JsProxy (callable JS functions).
        const osApiPy = pyodide.toPy(apiSurface, { depth: 1 });
        pySandbox.namespace = pyCreateNamespace(osApiPy);
      },

      // ── execute ─────────────────────────────────────────────
      execute(sandbox: unknown, code: string, _timeoutMs?: number): unknown {
        const { namespace } = sandbox as PySandbox;
        if (namespace === null) throw new Error('Sandbox not initialized');
        pyExecute(namespace, code);
        return null;
      },

      // ── destroy ─────────────────────────────────────────────
      destroy(sandbox: unknown): void {
        const pySandbox = sandbox as PySandbox;
        if (pySandbox.namespace !== null) {
          // Release the PyProxy to free Pyodide memory.
          try {
            (pySandbox.namespace as { destroy?: () => void }).destroy?.();
          } catch {
            // Ignore errors during cleanup.
          }
          pySandbox.namespace = null;
        }
      },

      // ── callHandler ─────────────────────────────────────────
      // Directly invoke a named function in the Python namespace.
      // Used by AdapterRuntime to dispatch OS events
      // (onWindowEvent, onConsoleInput, etc.) without generating
      // language-specific code strings.
      callHandler(sandbox: unknown, handlerName: string, arg: unknown): unknown {
        const { namespace } = sandbox as PySandbox;
        if (namespace === null) return undefined;
        const argPy = pyodide.toPy(arg, { depth: 1 });
        return pyCallHandler(namespace, handlerName, argPy);
      },
    });

    context.registerRuntime('python', runtime);
    context.log('INFO', `python-runtime: Python 3 engine registered (Pyodide ${PYODIDE_VERSION})`);
  })();
}

function teardown(context: PluginContext): void {
  context.log('INFO', 'python-runtime: Python 3 engine unregistered');
}

const pythonRuntimePlugin: SentryPlugin = {
  pluginName: 'python-runtime',
  pluginVersion: '1.0.0',
  pluginDescription: `Python 3 執行引擎（Pyodide ${PYODIDE_VERSION}），支援 manifest \`"engine": "python"\` 的應用程式。`,
  author: 'SentryOS',
  setup,
  teardown,
};

export default pythonRuntimePlugin;
