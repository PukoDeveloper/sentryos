// ── sentryos-plugin-lua-runtime ────────────────────────────────
// Registers a Lua 5.3 runtime engine using Fengari (pure-JavaScript
// Lua implementation).  Applications can set `"engine": "lua"` in
// their manifest to run their main script through this runtime.
//
// The plugin uses the RuntimeAdapter pattern so that IPC routing,
// event subscriptions, and OS API surface construction are all handled
// automatically by AdapterRuntime / BaseRuntime.

import type { SentryPlugin, PluginContext } from 'sentryos-sdk';
import type * as FengariWeb from 'fengari-web';

// ── Sandbox type ───────────────────────────────────────────────

interface LuaSandbox {
  L: unknown;
}

// ── Plugin ─────────────────────────────────────────────────────

function setup(context: PluginContext): void {
  // Dynamically import fengari-web so that the WASM/JS engine is only
  // loaded when the Lua runtime is actually needed.
  void (async () => {
    let fengari: typeof FengariWeb;
    try {
      // When bundled by Vite this resolves the npm package.
      // When loaded as a standalone blob URL it resolves from the CDN
      // import declared in the public/plugins JS counterpart.
      fengari = await import('fengari-web');
    } catch (err) {
      context.log('ERROR', `lua-runtime: failed to load fengari-web — ${String(err)}`);
      return;
    }

    const { lua, lauxlib, lualib, interop, to_luastring, to_jsstring } = fengari;

    const runtime = context.createRuntime({
      // ── createSandbox ─────────────────────────────────────
      createSandbox(_pid: number): unknown {
        const L = lauxlib.luaL_newstate();
        lualib.luaL_openlibs(L);
        return { L } satisfies LuaSandbox;
      },

      // ── injectGlobals ──────────────────────────────────────
      // Inject the full OS API surface as a single `OS` global table.
      // Fengari's interop.push wraps every JS object as a Lua userdata
      // with __index/__newindex/__call metamethods, so Lua code can
      // transparently call `OS.ui.createWindow({...})` etc.
      injectGlobals(sandbox: unknown, apiSurface: Record<string, unknown>): void {
        const { L } = sandbox as LuaSandbox;
        interop.push(L, apiSurface);
        lua.lua_setglobal(L, to_luastring('OS'));
      },

      // ── execute ────────────────────────────────────────────
      execute(sandbox: unknown, code: string, _timeoutMs?: number): unknown {
        const { L } = sandbox as LuaSandbox;
        const status = lauxlib.luaL_dostring(L, to_luastring(code));
        if (status !== lua.LUA_OK) {
          const raw = lua.lua_tostring(L, -1);
          const msg = raw ? to_jsstring(raw) : 'Lua error';
          lua.lua_pop(L, 1);
          throw new Error(msg);
        }
        return null;
      },

      // ── destroy ────────────────────────────────────────────
      destroy(sandbox: unknown): void {
        const { L } = sandbox as LuaSandbox;
        lua.lua_close(L);
      },

      // ── callHandler ────────────────────────────────────────
      // Directly invoke a named global function in the Lua state.
      // Used by AdapterRuntime to dispatch OS events (onWindowEvent,
      // onConsoleInput, etc.) without producing language-specific code strings.
      callHandler(sandbox: unknown, handlerName: string, arg: unknown): unknown {
        const { L } = sandbox as LuaSandbox;
        lua.lua_getglobal(L, to_luastring(handlerName));
        if (!lua.lua_isfunction(L, -1)) {
          lua.lua_pop(L, 1); // pop non-function
          return undefined;
        }
        interop.push(L, arg);
        const status = lua.lua_pcall(L, 1, 0, 0);
        if (status !== lua.LUA_OK) {
          const raw = lua.lua_tostring(L, -1);
          const msg = raw ? to_jsstring(raw) : 'Lua handler error';
          lua.lua_pop(L, 1);
          context.log('WARN', `lua-runtime: handler '${handlerName}' error: ${msg}`);
        }
        return undefined;
      },
    });

    context.registerRuntime('lua', runtime);
    context.log('INFO', 'lua-runtime: Lua 5.3 engine registered (fengari)');
  })();
}

function teardown(context: PluginContext): void {
  context.log('INFO', 'lua-runtime: Lua 5.3 engine unregistered');
}

const luaRuntimePlugin: SentryPlugin = {
  pluginName: 'lua-runtime',
  pluginVersion: '1.0.0',
  pluginDescription: 'Lua 5.3 執行引擎（Fengari），支援 manifest `"engine": "lua"` 的應用程式。',
  author: 'SentryOS',
  setup,
  teardown,
};

export default luaRuntimePlugin;
