// Type declaration for fengari-web (no official @types package available).
// Only the subset of the API used by the Lua runtime plugin is declared here.
declare module 'fengari-web' {
    export interface FengariLua {
        readonly LUA_OK: number;
        readonly LUA_TNIL: number;
        readonly LUA_TBOOLEAN: number;
        readonly LUA_TNUMBER: number;
        readonly LUA_TSTRING: number;
        readonly LUA_TTABLE: number;
        readonly LUA_TFUNCTION: number;
        lua_close(L: unknown): void;
        lua_getglobal(L: unknown, name: Uint8Array): number;
        lua_setglobal(L: unknown, name: Uint8Array): void;
        lua_isfunction(L: unknown, idx: number): boolean;
        lua_pcall(L: unknown, nargs: number, nresults: number, errfunc: number): number;
        lua_pop(L: unknown, n: number): void;
        lua_tostring(L: unknown, idx: number): Uint8Array | null;
        lua_type(L: unknown, idx: number): number;
    }

    export interface FengariLauxlib {
        luaL_newstate(): unknown;
        luaL_dostring(L: unknown, code: Uint8Array): number;
    }

    export interface FengariLualib {
        luaL_openlibs(L: unknown): void;
    }

    export interface FengariInterop {
        push(L: unknown, value: unknown): void;
    }

    export const lua: FengariLua;
    export const lauxlib: FengariLauxlib;
    export const lualib: FengariLualib;
    export const interop: FengariInterop;

    export function to_luastring(s: string, cache?: boolean): Uint8Array;
    export function to_jsstring(s: Uint8Array): string;
}
