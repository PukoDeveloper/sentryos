// ── sentryos-lua-runtime plugin ────────────────────────────────
// Registers a Lua 5.3 runtime engine backed by Fengari
// (https://fengari.io) — a pure-JavaScript Lua implementation.
//
// Applications set `"engine": "lua"` in their manifest.json to use
// this runtime.  The OS API is injected into the Lua global space as
// the `OS` object; Lua scripts access it exactly like JS apps:
//
//   local win = OS.ui.createWindow({title="Hello", width=400, height=300})
//
// Fengari is loaded lazily from esm.sh CDN on first use.
//
// Standalone usage: list this file in public/plugins.json.
// Bundled usage:    import 'sentryos-plugin-lua-runtime' in main.ts.

let fengariModule = null;
let fengariLoadPromise = null;

function ensureFengari() {
    if (fengariModule) return Promise.resolve(fengariModule);
    if (fengariLoadPromise) return fengariLoadPromise;
    fengariLoadPromise = import('https://esm.sh/fengari-web@0.1.4').then((m) => {
        fengariModule = m;
        return m;
    });
    return fengariLoadPromise;
}

async function setup(context) {
    let fengari;
    try {
        fengari = await ensureFengari();
    } catch (err) {
        context.log('ERROR', `lua-runtime: failed to load fengari-web — ${String(err)}`);
        return;
    }

    const { lua, lauxlib, lualib, interop, to_luastring, to_jsstring } = fengari;

    const runtime = context.createRuntime({
        // ── createSandbox ─────────────────────────────────────
        createSandbox(_pid) {
            const L = lauxlib.luaL_newstate();
            lualib.luaL_openlibs(L);
            return { L };
        },

        // ── injectGlobals ──────────────────────────────────────
        // Inject the full OS API surface as a single `OS` global.
        // Fengari interop wraps JS objects with __index/__call metamethods,
        // so `OS.ui.createWindow({title="…"})` works transparently.
        injectGlobals(sandbox, apiSurface) {
            const { L } = sandbox;
            interop.push(L, apiSurface);
            lua.lua_setglobal(L, to_luastring('OS'));
        },

        // ── execute ────────────────────────────────────────────
        execute(sandbox, code, _timeoutMs) {
            const { L } = sandbox;
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
        destroy(sandbox) {
            lua.lua_close(sandbox.L);
        },

        // ── callHandler ────────────────────────────────────────
        // Directly call a named Lua global function with one argument.
        // Used by AdapterRuntime to dispatch onWindowEvent, onConsoleInput, etc.
        callHandler(sandbox, handlerName, arg) {
            const { L } = sandbox;
            lua.lua_getglobal(L, to_luastring(handlerName));
            if (!lua.lua_isfunction(L, -1)) {
                lua.lua_pop(L, 1);
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
}

function teardown(context) {
    context.log('INFO', 'lua-runtime: Lua 5.3 engine unregistered');
}

export default {
    pluginName: 'sentryos-lua-runtime',
    pluginVersion: '1.0.0',
    pluginDescription: 'Lua 5.3 執行引擎（Fengari），支援 manifest `"engine": "lua"` 的應用程式。',
    author: 'SentryOS',
    setup,
    teardown,
};
