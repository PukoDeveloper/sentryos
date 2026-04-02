# ScriptRuntime

**檔案**：`src/runtime/ScriptRuntime.ts`（WASM 初始化：`src/runtime/QuickJsInit.ts`）

基於 QuickJS（WASM）的沙箱 JavaScript 執行環境，負責為每個程序建立隔離的 Runtime/Context 並注入 Host API。

---

## API

| 方法 | 簽章 | 說明 |
|------|------|------|
| `registerApi()` | `(name, factory, gates?) → void` | 註冊 Host API 工廠（gates 為權限命名空間陣列） |
| `unregisterApi()` | `(name) → boolean` | 移除 Host API 工廠 |
| `execute()` | `(pid, code, timeoutMs?) → RuntimeResult` | 在指定程序中執行 JavaScript（預設 300ms 超時） |
| `evaluateInContext()` | `(pid, code) → RuntimeResult` | 在已存在的程序 Context 中執行（不重新注入 API），用於載入程式庫 |
| `dispatchUiEvent()` | `(processAppId, event) → RuntimeResult` | 分派 UI 事件到程序中的 `onWindowEvent` |
| `dispatchConsoleInput()` | `(processAppId, line) → RuntimeResult` | 分派 Console 輸入到程序中的 `onConsoleInput` |
| `destroyProcessRuntime()` | `(pid) → void` | 銷毀指定程序的 Runtime（清除事件訂閱 + dispose） |
| `destroyAll()` | `() → void` | 銷毀全部 Runtime |

---

## API Gates（權限門控）

每個 Host API 註冊時可指定 `gates`（權限命名空間陣列）。注入時會檢查程序的應用是否持有對應命名空間下的任一權限：

| Gates | 說明 |
|-------|------|
| `[]`（空陣列） | 所有程序皆注入 |
| `['window']` | 僅持有 `window.*` 權限的程序 |
| `['console']` | 僅持有 `console.*` 權限的程序 |
| `['service']` | 僅持有 `service.*` 權限的程序 |
| `['file', 'storage']` | 持有 `file.*` 或 `storage.*` 權限的程序 |

判定邏輯：`PermissionsManager.hasAnyUnder(appId, namespace)` — 檢查應用是否持有以 `{namespace}.` 開頭的任一權限。

---

## 內建 Host API

ScriptRuntime 自身註冊的 API（扁平化注入至 `OS` 全域物件）：

| API 名稱 | Gates | 提供方法 |
|-----------|-------|---------|
| `process` | `[]` | `pid`, `appDefId`, `appId`, `type`, `parentPid`, `status()`, `spawnChild()`, `terminateSelf()`, `listProcesses()`, `terminateProcess()` |
| `event` | `[]` | `subscribe(name)`, `unsubscribe(name)`, `emit(name, payload?)` |
| `ipc` | `[]` | `sendToParent(payload)`, `sendToChild(childPid, payload)`, `broadcastChildren(payload)`, `receive()` |
| `serviceApi` | `['service']` | `publishHealth(health)` |
| `windowApi` | `['window']` | `postUiEvent(name, payload?)` |
| `consoleApi` | `['console']` | `writeLine(text)` |

## Bootstrap 註冊 Host API

以下 API 由 `systemBootstrap.ts` 於啟動時註冊（同樣扁平化注入至 `OS`）：

| API 名稱 | Gates | 提供方法 |
|-----------|-------|---------|
| `ui` | `['window']` | `createWindow(opts)`, `initialize(wid, tree)`, `update()`, `remove()`, `append()`, `label()`, `button()`, `stack()`, `panel()`, `input()`, `textarea()`, `checkbox()`, `select()`, `image()`, `separator()`, `progress()`, `list()` |
| `systemApi` | `['process']` | `terminateProcess(targetPid)` |
| `storageApi` | `['file', 'storage']` | `readFile()`, `writeFile()`, `deleteFile()`, `listFiles()`, `fileExists()`, `storageUsage()`, `listAllFiles()` |
| `envApi` | `['env']` | `getVariable()`, `getAllVariables()`, `setVariable()`, `removeVariable()`, `registerAutoStart()`, `unregisterAutoStart()`, `loadLibrary()`, `listLibraries()`, `registerCommand()` |
| `consoleApi` | `['console']` | `writeLine()`, `write()`, `clear()`（覆寫內建版本，直接操作 Console 視窗 DOM） |
| `shellApi` | `['shell']` | `listProcesses()`, `killProcess()`, `listApps()`, `launch()`, `listWindows()`, `sysinfo()`, `listCommands()`, `resolveCommand()` |
| `notificationApi` | `['notification']` | `notify()`, `dismiss()` |
| `monitorApi` | `['monitor']` | `snapshot()`, `eventStats()`, `apiStats()`, `permissionStats()`, `recentEvents()`, `recentApiCalls()`, `processHistory()` |
| `settingsApi` | `['settings']` | `getTheme()`, `applyTheme()`, `saveTheme()`, `loadSavedTheme()`, `sysinfo()`, `getNotificationSettings()`, `setNotificationSettings()`, `getApps()`, `getAppProcesses()` |
| `networkApi` | `['network']` | `request()`, `isAllowed()`, `getStatus()`, `getAllowlist()`, `addAllowlistEntry()`, `removeAllowlistEntry()`, `setEnabled()` |
| `registryApi` | `['registry']` | `getDefaultApp()`, `getAllRoles()`, `setDefaultApp()`, `getFileTypeHandler()`, `getAllFileTypeHandlers()`, `setFileTypeHandler()`, `getSnapshot()` |

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

每次 `execute()` 時，會呼叫所有通過權限門控的 factory 產生 API 物件，再扁平化注入沙箱 `OS` 物件。

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
2. **`buildApiSurface()`**：收集所有適用 scope 的 API factory，執行產生方法，使用 `Object.assign` 扁平合併為單一物件
3. **`injectApis()`**：將合併後的 API 物件以 `OS` 名稱設定到沙箱全域
4. **`toHandle()`**：遞迴將 JS 值轉換為 QuickJS Handle（支援 function、object、array、primitives）
5. **`normalizeReturnValue()`**：將 Host function 回傳值正規化為可序列化格式

> **注意**：由於所有 API 方法被扁平化到單一 `OS` 物件，若不同 API 有同名方法，後註冊的會覆蓋先註冊的。例如 `systemApi.terminateProcess` 會覆蓋內建 `process.terminateProcess`。

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

`evaluateInContext()` 在已存在的程序 Context 中直接執行程式碼，不重新注入 API。用於 `OS.loadLibrary()` 將程式庫原始碼載入呼叫者的 Context。

---

## 錯誤代碼

| 錯誤 | 說明 |
|------|------|
| `ProcessNotFound` | PID 不存在 |
| `ProcessNotRunning` | 程序非 running 狀態 |
| `RuntimeError` | QuickJS 執行錯誤 |
| `PermissionDenied` | IPC 權限不足 |
| `InvalidTarget` | IPC 目標無效 |
