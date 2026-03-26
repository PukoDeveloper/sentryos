# ScriptRuntime

**檔案**：`src/core/ScriptRuntime.ts`

基於 QuickJS（WASM）的沙箱 JavaScript 執行環境，負責為每個程序建立隔離的 Runtime/Context 並注入 Host API。

---

## API

| 方法 | 簽章 | 說明 |
|------|------|------|
| `registerApi()` | `(name, factory, scope?) → void` | 註冊 Host API 工廠 |
| `unregisterApi()` | `(name, scope?) → boolean` | 移除 Host API 工廠 |
| `execute()` | `(pid, code, timeoutMs?) → RuntimeResult` | 在指定程序中執行 JavaScript（預設 300ms 超時） |
| `evaluateInContext()` | `(pid, code) → RuntimeResult` | 在已存在的程序 Context 中執行（不重新注入 API），用於載入程式庫 |
| `dispatchUiEvent()` | `(processAppId, event) → RuntimeResult` | 分派 UI 事件到程序中的 `onWindowEvent` |
| `dispatchConsoleInput()` | `(processAppId, line) → RuntimeResult` | 分派 Console 輸入到程序中的 `onConsoleInput` |
| `destroyProcessRuntime()` | `(pid) → void` | 銷毀指定程序的 Runtime（清除事件訂閱 + dispose） |
| `destroyAll()` | `() → void` | 銷毀全部 Runtime |

---

## API Scope

每個 Host API 註冊時可指定作用範圍，僅符合程序類型的 API 會被注入：

| Scope | 注入對象 |
|-------|---------|
| `all` | 所有程序 |
| `service` | `type === 'Service'` 的程序 |
| `window` | `type === 'Window'` 的程序 |
| `console` | `type === 'Console'` 的程序 |
| `library` | `type === 'Library'` 的程序 |

---

## 內建 Host API

ScriptRuntime 自身註冊的 API：

| API 名稱 | Scope | 全域變數 | 提供方法 |
|-----------|-------|---------|---------|
| `process` | all | `processApi` | `pid`, `appDefId`, `appId`, `type`, `parentPid`, `status()`, `spawnChild()`, `terminateSelf()`, `listProcesses()`, `terminateProcess()` |
| `event` | all | `eventApi` | `subscribe(name)`, `unsubscribe(name)`, `emit(name, payload?)` |
| `ipc` | all | `ipcApi` | `sendToParent(payload)`, `sendToChild(childPid, payload)`, `broadcastChildren(payload)`, `receive()` |
| `serviceApi` | service | `serviceApi` | `publishHealth(health)` |
| `windowApi` | window | `windowApi` | `postUiEvent(name, payload?)` |
| `consoleApi` | console | `consoleApi` | `writeLine(text)` |

## Bootstrap 註冊 Host API

以下 API 由 `systemBootstrap.ts` 於啟動時註冊：

| API 名稱 | Scope | 全域變數 | 提供方法 |
|-----------|-------|---------|---------|
| `ui` | window | `ui` | `createWindow(opts)`, `initialize(wid, tree)`, `label()`, `button()`, `stack()`, `panel()` |
| `systemApi` | all | `systemApi` | `terminateProcess(targetPid)` |
| `storageApi` | all | `storageApi` | `usage()` |
| `envApi` | all | `envApi` | `getVariable()`, `getAllVariables()`, `setVariable()`, `removeVariable()`, `registerAutoStart()`, `unregisterAutoStart()`, `loadLibrary()`, `listLibraries()`, `registerCommand()` |
| `consoleApi` | console | `consoleApi` | `writeLine()`, `write()`, `clear()`（覆寫內建版本，直接操作 Console 視窗 DOM） |
| `shellApi` | console | `shellApi` | `listProcesses()`, `killProcess()`, `listApps()`, `launch()`, `listWindows()`, `sysinfo()`, `listCommands()`, `resolveCommand()` |

> Bootstrap 的 `consoleApi` 會覆寫 ScriptRuntime 內建版本，提供實際操作 Console 視窗 DOM 的功能。

---

## API Factory 模式

```typescript
type ApiFactoryContext = {
  pid: number;
  process: ProcessView;
};

type ApiFactory = (ctx: ApiFactoryContext) => Record<string, HostApiValue>;
```

每次 `execute()` 時，會呼叫所有適用 scope 的 factory 產生 API 物件，再注入沙箱。

---

## IPC 訊息結構

```typescript
interface Message {
  fromPid: number;
  toPid: number;
  type: 'ipc' | 'event';
  channel: string;
  payload: unknown;
  timestamp: number;
}
```

IPC 權限要求：
- `sendToParent`：需 `process.ipc.send-parent`
- `sendToChild` / `broadcastChildren`：需 `process.ipc.send-child`

---

## 沙箱注入機制

1. **`ensureRuntimeProcess()`**：延遲建立 QuickJS Runtime + Context（首次 execute 時才建立）
2. **`injectApis()`**：呼叫 `buildApiSurface()` 產生 API 物件，以 `Sentry` 名稱設定到全域
3. **Prelude 代碼**：自動將 `Sentry` 展開為快捷變數
   ```javascript
   globalThis.processApi  = Sentry.process;
   globalThis.eventApi    = Sentry.event;
   globalThis.ipcApi      = Sentry.ipc;
   globalThis.ui          = Sentry.ui ?? {};
   globalThis.serviceApi  = Sentry.serviceApi ?? {};
   globalThis.windowApi   = Sentry.windowApi ?? {};
   globalThis.consoleApi  = Sentry.consoleApi ?? {};
   globalThis.systemApi   = Sentry.systemApi ?? {};
   globalThis.storageApi  = Sentry.storageApi ?? {};
   globalThis.envApi      = Sentry.envApi ?? {};
   globalThis.shellApi    = Sentry.shellApi ?? {};
   ```
4. **`toHandle()`**：遞迴將 JS 值轉換為 QuickJS Handle（支援 function、object、array、primitives）
5. **`normalizeReturnValue()`**：將 Host function 回傳值正規化為可序列化格式

---

## 事件分派機制

### dispatchUiEvent（Window）

當 WindowManager 捕捉到 UI 事件（如按鈕點擊），透過 `dispatchUiEvent()` 執行：

```javascript
if(typeof onWindowEvent === 'function') {
  onWindowEvent(${JSON.stringify(event)})
}
```

### dispatchConsoleInput（Console）

當使用者在 Console 輸入框按下 Enter，透過 `dispatchConsoleInput()` 執行：

```javascript
if(typeof onConsoleInput === 'function') {
  onConsoleInput(${JSON.stringify(line)})
}
```

### evaluateInContext（Library 載入）

`evaluateInContext()` 在已存在的程序 Context 中直接執行程式碼，不重新注入 API。用於 `envApi.loadLibrary()` 將程式庫原始碼載入呼叫者的 Context。

---

## 錯誤代碼

| 錯誤 | 說明 |
|------|------|
| `ProcessNotFound` | PID 不存在 |
| `ProcessNotRunning` | 程序非 running 狀態 |
| `RuntimeError` | QuickJS 執行錯誤 |
| `PermissionDenied` | IPC 權限不足 |
| `InvalidTarget` | IPC 目標無效 |
