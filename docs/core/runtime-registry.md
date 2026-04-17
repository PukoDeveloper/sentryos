# RuntimeRegistry

**檔案**：`src/runtime/RuntimeRegistry.ts`

`RuntimeRegistry` 是 SentryOS 的中央 Runtime 管理模組，負責兩大職責：

1. **Host API 中央註冊表** — 所有 Host API（來自 `src/api/` 和插件）統一存放在此
2. **多引擎管理** — 管理多個 Runtime 引擎（QuickJS、Lua 等）及程序→引擎的路由

---

## Host API 管理

### registerApi(name, factory, gates?, group?)

註冊一個 Host API 到中央註冊表。所有 Runtime 引擎在 `buildApiSurface()` 時共用這些 API。

```typescript
runtimeRegistry.registerApi(
    'myApi',                                // API 名稱
    (ctx) => ({ hello: () => 'world' }),    // ApiFactory
    ['my.permission'],                      // 權限閘門
    'myGroup'                               // 掛載到 OS.myGroup.*
);
```

### unregisterApi(name): boolean

移除已註冊的 Host API。

### getHostApiEntries(): ReadonlyMap

取得所有已註冊的 Host API 條目。`BaseRuntime.buildApiSurface()` 在每個程序啟動時呼叫此方法。

### 架構圖

```
src/api/*.ts ──registerApi()──→ RuntimeRegistry.hostApiEntries
插件 ──ctx.registerApi()──→  RuntimeRegistry.hostApiEntries
                                     │
                                     ↓
                            BaseRuntime.buildApiSurface()
                                     │
                            合併 builtinApiEntries + hostApiEntries
                                     │
                                     ↓
                              注入到 OS 全域物件
```

---

## 引擎管理

### register(engine, runtime)

註冊一個 Runtime 引擎。

```typescript
runtimeRegistry.register('lua', luaRuntime);
```

### get(engine): IRuntime | undefined

取得指定引擎實例。

### getDefault(): IRuntime

取得預設引擎（啟動時為 `'quickjs'`）。

### setDefault(engine)

變更預設引擎。

### has(engine): boolean

檢查引擎是否存在。

### unregister(engine): boolean

移除引擎。

---

## 程序路由

每個程序在啟動時透過 `bindProcess()` 綁定到特定引擎，之後系統可依 PID 或 processAppId 查找負責的 Runtime。

### bindProcess(pid, processAppId, engine)

綁定程序到引擎。由 `ApplicationLauncher` 在啟動應用時呼叫。

### unbindProcess(pid, processAppId)

解除綁定。程序終止時呼叫。

### getForPid(pid): IRuntime

根據 PID 取得負責的 Runtime。若未綁定則回傳預設引擎。

### getForProcessAppId(processAppId): IRuntime

根據 processAppId 取得負責的 Runtime。

---

## 與 BaseRuntime 的協作

`BaseRuntime` 抽象基底在 `buildApiSurface()` 中會合併兩個來源的 API：

1. **builtinApiEntries**（引擎各自獨立）— `process`, `event`, `ipc`, `serviceApi`, `windowApi`, `consoleApi`
2. **hostApiEntries**（RuntimeRegistry 中央共用）— 所有 `src/api/` 和插件註冊的 API

這樣任何新增的引擎只要繼承 `BaseRuntime`，就能自動取得所有 Host API，無需各自重複註冊。
