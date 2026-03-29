# Host API 參考

本文件列出沙箱應用程式（`main.js`）中可使用的所有全域 API。

> 每個 API 標註了其 **Scope**，只有符合程序類型的 API 才會被注入：
>
> | Scope | 注入對象 |
> |-------|---------|
> | `all` | 所有程序（Service、Window、Console、Library） |
> | `service` | `type === 'Service'` |
> | `window` | `type === 'Window'` |
> | `console` | `type === 'Console'` |
> | `library` | `type === 'Library'` |

---

## processApi

**Scope**: `all`

| 欄位/方法 | 型別 | 說明 |
|-----------|------|------|
| `processApi.pid` | `number` | 目前 PID |
| `processApi.appDefId` | `string` | 應用定義 ID |
| `processApi.appId` | `string` | 程序實例的 processAppId |
| `processApi.type` | `string` | 程序類型（`'Service'` / `'Window'` / `'Console'` / `'Library'`） |
| `processApi.parentPid` | `number \| null` | 父程序 PID（`null` 表示根程序） |
| `processApi.status()` | `() → string` | 查詢當前狀態 |
| `processApi.spawnChild(appDefId?, type?)` | `() → { success, pid? }` | 啟動子程序 |
| `processApi.terminateSelf()` | `() → ProcessResult` | 終止自身 |
| `processApi.listProcesses()` | `() → { success, data? }` | 列出所有程序（需 `process.list`） |
| `processApi.terminateProcess(targetPid)` | `(number) → ProcessResult` | 終止指定程序 |

### spawnChild

```javascript
// 啟動與自身相同應用的子程序
var result = processApi.spawnChild();

// 啟動指定應用的子程序
var result = processApi.spawnChild('appdef_xxx', 'Window');
```

---

## eventApi

**Scope**: `all`

| 方法 | 簽章 | 說明 |
|------|------|------|
| `eventApi.subscribe(eventName)` | `(string) → EventBusResult` | 訂閱事件 |
| `eventApi.unsubscribe(eventName)` | `(string) → EventBusResult` | 取消訂閱 |
| `eventApi.emit(eventName, payload?)` | `(string, any?) → EventBusResult` | 發送事件 |

### 訂閱後的接收

訂閱的事件會被放入程序的 inbox，可透過 `ipcApi.receive()` 讀取。

---

## ipcApi

**Scope**: `all`

| 方法 | 簽章 | 說明 |
|------|------|------|
| `ipcApi.sendToParent(payload)` | `(any) → RuntimeResult` | 傳訊息給父程序（需 `process.ipc.send-parent`） |
| `ipcApi.sendToChild(childPid, payload)` | `(number, any) → RuntimeResult` | 傳訊息給子程序（需 `process.ipc.send-child`） |
| `ipcApi.broadcastChildren(payload)` | `(any) → RuntimeResult` | 廣播給所有子程序 |
| `ipcApi.receive()` | `() → Message[]` | 讀取收件匣（一次性清空） |

### Message 結構

```javascript
{
  fromPid: 1,
  toPid: 2,
  type: 'ipc',         // 'ipc' 或 'event'
  channel: 'parent',   // 'parent', 'child', 或事件名稱
  payload: { ... },
  timestamp: 1679836215000
}
```

---

## systemApi

**Scope**: `all`

| 方法 | 簽章 | 說明 |
|------|------|------|
| `systemApi.terminateProcess(targetPid)` | `(number) → { success, data? }` | 完整終止某程序（關閉視窗 + 銷毀 Runtime + 終止程序樹，需 `process.terminate`） |

> **注意**：`systemApi.terminateProcess` 會以 `setTimeout` 非同步執行，避免同步終止造成 re-entrant 問題。

---

## storageApi

**Scope**: `all`

| 方法 | 簽章 | 說明 |
|------|------|------|
| `storageApi.usage()` | `() → { success, data? }` | 查詢虛擬儲存空間使用量（需 `storage.usage`） |

---

## ui（僅 Window 類程序）

**Scope**: `window`

### 視窗建立

| 方法 | 說明 |
|------|------|
| `ui.createWindow(options)` | 建立視窗，回傳 `{ success, data: windowId }` |
| `ui.initialize(windowId, tree)` | 以 UI tree 替換視窗內容 |

#### createWindow options

```javascript
ui.createWindow({
  title: 'My App',            // 視窗標題
  width: 520, height: 400,    // 初始尺寸
  x: 100, y: 80,              // 初始位置（可省略）
  useDefaultFrame: true,       // 是否使用預設標題列
  alwaysOnTop: false,          // 置頂模式
  style: {                     // 視窗框樣式
    background: '...',
    color: '...',
    border: '...',
    borderRadius: '...',
    boxShadow: '...',
  }
});
```

### UI 節點工廠

| 方法 | 說明 |
|------|------|
| `ui.label(text, style?, id?)` | 建立文字標籤節點 |
| `ui.button(text, style?, id?)` | 建立按鈕節點 |
| `ui.stack(children, style?, id?)` | 建立堆疊容器（預設垂直排列） |
| `ui.panel(children, style?, id?)` | 建立面板容器 |

#### 參數說明

- `text`：`string` — 顯示文字
- `style`：`object` — 可選樣式物件
  - `background`, `color`, `padding`, `gap`, `borderRadius`, `border`
  - `fontSize`, `justifyContent`, `alignItems`, `flexDirection`
- `id`：`string` — 控制項 ID，用於事件回呼比對
- `children`：`array` — 子節點陣列（stack / panel 使用）

---

## onWindowEvent（Window 回呼）

應用程式可定義 `globalThis.onWindowEvent` 來接收 UI 事件回呼：

```javascript
globalThis.onWindowEvent = function(event) {
  // event.controlId — 觸發的控制項 ID（對應 ui.button 的第三個參數）
  // event.type       — 事件類型（'click'）
  // event.windowId   — 所屬視窗 ID
  // event.eventId    — 事件唯一 ID
  // event.processAppId — 程序 ID
};
```

---

## serviceApi（僅 Service 類程序）

**Scope**: `service`

| 方法 | 說明 |
|------|------|
| `serviceApi.publishHealth(health)` | 發送健康檢查事件 `service.health` |

---

## windowApi（僅 Window 類程序）

**Scope**: `window`

| 方法 | 說明 |
|------|------|
| `windowApi.postUiEvent(name, payload?)` | 發送自訂 UI 事件 `window.ui` |

---

## consoleApi（僅 Console 類程序）

**Scope**: `console`

| 方法 | 簽章 | 說明 |
|------|------|------|
| `consoleApi.writeLine(text)` | `(any) → boolean` | 輸出一行文字到 Console 視窗（需 `console.write`） |
| `consoleApi.write(text)` | `(any) → boolean` | 附加文字到最後一行（不換行，需 `console.write`） |
| `consoleApi.clear()` | `() → boolean` | 清除 Console 視窗所有輸出（需 `console.write`） |

### onConsoleInput（Console 回呼）

Console 類程式可定義 `globalThis.onConsoleInput` 接收使用者輸入：

```javascript
globalThis.onConsoleInput = function(line) {
  // line — 使用者在 Console 輸入框按下 Enter 送出的文字
  consoleApi.writeLine('你輸入了: ' + line);
};
```

---

## envApi（環境 API）

**Scope**: `all`

提供環境變數、自動啟動註冊、程式庫載入與命令註冊功能。

### 環境變數

| 方法 | 簽章 | 說明 |
|------|------|------|
| `envApi.getVariable(key)` | `(string) → { success, data? }` | 讀取環境變數（需 `env.read`） |
| `envApi.getAllVariables()` | `() → { success, data? }` | 讀取所有環境變數（需 `env.read`） |
| `envApi.setVariable(key, value)` | `(string, string) → { success }` | 設定環境變數（需 `env.write`） |
| `envApi.removeVariable(key)` | `(string) → { success, data? }` | 刪除環境變數（需 `env.write`） |

### 自動啟動

| 方法 | 簽章 | 說明 |
|------|------|------|
| `envApi.registerAutoStart()` | `() → { success }` | 將目前程式註冊為自動啟動（需 `env.autostart`） |
| `envApi.unregisterAutoStart()` | `() → { success }` | 取消自動啟動（需 `env.autostart`） |

### 程式庫

| 方法 | 簽章 | 說明 |
|------|------|------|
| `envApi.loadLibrary(libraryId)` | `(string) → RuntimeResult` | 載入程式庫到目前程序（在現有 Context 中執行程式碼，需 `env.library.load`） |
| `envApi.listLibraries()` | `() → { success, data: string[] }` | 列出所有已註冊的程式庫 ID |

#### loadLibrary 用法

```javascript
// libraryId 格式為 "packageName/appName"，例如 "stdlib/Math Utils"
var result = envApi.loadLibrary('stdlib/Math Utils');
if (result.success) {
  // 程式庫已載入，其匯出的全域物件（如 MathUtils）可直接使用
  var n = MathUtils.factorial(5); // 120
}
```

### 命令註冊

| 方法 | 簽章 | 說明 |
|------|------|------|
| `envApi.registerCommand(name, description, usage?)` | `(string, string, string?) → { success }` | 註冊 CLI 命令到系統命令表 |

#### registerCommand 用法

```javascript
// 通常在 Library 的 init 階段註冊命令
envApi.registerCommand('factorial', '計算階乘', 'factorial <n>');

// 同時提供命令處理函式（掛在 __commands 全域物件上）
globalThis.__commands = globalThis.__commands || {};
globalThis.__commands['factorial'] = function(args) {
  var n = parseInt(args[0], 10);
  return String(MathUtils.factorial(n));
};
```

---

## shellApi（系統指令 API）

**Scope**: `console`（僅 Console 類程序可用）

提供系統層級操作，如程序管理、應用啟動、視窗查詢和系統資訊。

### 程序管理

| 方法 | 簽章 | 說明 |
|------|------|------|
| `shellApi.listProcesses()` | `() → { success, data? }` | 列出所有程序（需 `process.list`） |
| `shellApi.killProcess(targetPid)` | `(number) → { success, data? }` | 終止指定程序（需 `process.terminate`） |

#### listProcesses 回傳

```javascript
{
  success: true,
  data: [
    { pid: 1, appDefId: '...', processAppId: '...', type: 'Window', status: 'running', parentPid: null },
    ...
  ]
}
```

### 應用管理

| 方法 | 簽章 | 說明 |
|------|------|------|
| `shellApi.listApps()` | `() → { success, data? }` | 列出所有已註冊應用（需 `shell.apps`） |
| `shellApi.launch(appDefId)` | `(string) → { success, data? }` | 啟動應用（可以使用 appId 或名稱，需 `shell.launch`） |

#### listApps 回傳

```javascript
{
  success: true,
  data: [
    { appId: '...', name: 'Example App', version: '1.0.0', type: 'Window', package: 'example', autoStart: false },
    ...
  ]
}
```

> `launch` 不支援啟動 Library 類應用，會回傳 `{ success: false, error: 'CannotLaunchLibrary' }`。

### 視窗查詢

| 方法 | 簽章 | 說明 |
|------|------|------|
| `shellApi.listWindows()` | `() → { success, data? }` | 列出所有開啟中視窗（需 `shell.windows`） |

### 系統資訊

| 方法 | 簽章 | 說明 |
|------|------|------|
| `shellApi.sysinfo()` | `() → { success, data? }` | 取得系統摘要（需 `shell.sysinfo`） |

#### sysinfo 回傳

```javascript
{
  success: true,
  data: {
    uptime: '2m 15s',
    processes: { total: 5, running: 3 },
    windows: 2,
    libraries: 2,
    commands: 9,
    apps: 6
  }
}
```

### 命令查詢

| 方法 | 簽章 | 說明 |
|------|------|------|
| `shellApi.listCommands()` | `() → { success, data? }` | 列出所有已註冊 CLI 命令 |
| `shellApi.resolveCommand(name)` | `(string) → { success, data? }` | 解析命令名稱，取得其 libraryId 等資訊 |

#### 命令自動分派模式

Console 應用可透過 `resolveCommand` + `loadLibrary` + `__commands` 實現自動命令分派：

```javascript
// 1. 使用者輸入未識別的命令
var cmd = 'factorial';
var args = ['5'];

// 2. 查詢命令是否已註冊
var resolved = shellApi.resolveCommand(cmd);
if (resolved.success) {
  // 3. 載入對應的程式庫
  envApi.loadLibrary(resolved.data.libraryId);
  // 4. 執行命令處理函式
  if (globalThis.__commands && globalThis.__commands[cmd]) {
    var output = globalThis.__commands[cmd](args);
    consoleApi.writeLine(output);
  }
}
```

---

## notificationApi（通知 API）

**Scope**: `all`

提供全域通知功能，可由任何應用類型使用。

| 方法 | 簽章 | 說明 |
|------|------|------|
| `notificationApi.notify(title, body?, type?, duration?)` | `(string, string?, string?, number?) → { success, data? }` | 發送通知（需 `notification.send`） |
| `notificationApi.dismiss(id)` | `(string) → { success }` | 關閉指定通知（需 `notification.send`） |

### notify 參數

| 參數 | 型別 | 說明 |
|------|------|------|
| `title` | `string` | 通知標題（必填） |
| `body` | `string` | 通知內容（選填） |
| `type` | `string` | 通知類型：`'info'`（預設）、`'success'`、`'warning'`、`'error'` |
| `duration` | `number` | 自動消失時間（毫秒），`0` 表示不自動消失 |

### 用法範例

```javascript
// 基本通知
notificationApi.notify('操作完成');

// 帶類型與內容的通知
notificationApi.notify('儲存成功', '檔案已成功寫入', 'success');

// 不自動消失的錯誤通知
notificationApi.notify('錯誤', '無法連接伺服器', 'error', 0);

// 手動關閉通知
var result = notificationApi.notify('處理中...');
if (result.success) {
  // result.data 為通知 ID
  notificationApi.dismiss(result.data);
}
```

---

## monitorApi（系統監控 API）

**Scope**: `all`

提供系統監控統計數據，所有方法均需 `monitor.read` 權限。

| 方法 | 簽章 | 說明 |
|------|------|------|
| `monitorApi.snapshot()` | `() → { success, data? }` | 取得完整監控快照 |
| `monitorApi.eventStats()` | `() → { success, data? }` | 取得事件統計 |
| `monitorApi.apiStats()` | `() → { success, data? }` | 取得 API 呼叫統計 |
| `monitorApi.permissionStats()` | `() → { success, data? }` | 取得權限檢查統計 |
| `monitorApi.recentEvents(limit?)` | `(number?) → { success, data? }` | 取得最近事件記錄 |
| `monitorApi.recentApiCalls(limit?)` | `(number?) → { success, data? }` | 取得最近 API 呼叫記錄 |
| `monitorApi.processHistory()` | `() → { success, data? }` | 取得程序歷史記錄 |

### snapshot 回傳

```javascript
{
  success: true,
  data: {
    events: { total: 42, byName: { 'window.ui': 15, ... } },
    api: { total: 100, byName: { 'ui.createWindow': 5, ... } },
    permissions: { total: 200, granted: 195, denied: 5 },
    processes: { launched: 8, terminated: 3 },
    uptime: '5m 30s'
  }
}
```

### 用法範例

```javascript
// 取得完整快照
var snap = monitorApi.snapshot();
if (snap.success) {
  consoleApi.writeLine('Events: ' + snap.data.events.total);
  consoleApi.writeLine('API calls: ' + snap.data.api.total);
}

// 取得最近 10 筆事件
var events = monitorApi.recentEvents(10);

// 取得權限統計
var perms = monitorApi.permissionStats();
```
