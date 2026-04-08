# Host API 參考

本文件列出沙箱應用程式（`main.js`）中可透過全域物件 **`OS`** 存取的所有 API。

> **v2 變更**：所有 API 已統一扁平化至單一 `OS` 全域物件。不再需要 `consoleApi.xxx`、`shellApi.xxx` 等分離的命名空間，直接使用 `OS.xxx` 即可。

---

## Scope（作用範圍）

每個方法標註了 **Scope**，只有符合程序類型的方法才會被注入 `OS` 物件：

| Scope | 注入對象 |
|-------|---------|
| `all` | 所有程序（Service、Window、Console、Library） |
| `service` | `type === 'Service'` |
| `window` | `type === 'Window'` |
| `console` | `type === 'Console'` |

---

## 權限系統

部分 API 需要特定權限才能執行，否則回傳 `{ success: false, error: 'PermissionDenied' }`。

- 權限字串定義位置：[`src/kernel/constants.ts`](../../src/kernel/constants.ts)（`Permissions` 物件）
- 權限檢查由 [`PermissionsManager`](../core/permissions-manager.md) 執行，支援萬用字元匹配
- 應用程式在 `manifest.json` 的 `permissions` 欄位中宣告所需權限

### 權限分類

| 分類 | 權限前綴 | 說明 |
|------|---------|------|
| **程序** | `process.*` | 程序啟動、終止、暫停、列表 |
| **事件** | `event.*` | 事件訂閱與發送（動態：`event.subscribe.<name>`、`event.emit.<name>`） |
| **IPC** | `process.ipc.*` | 程序間通訊 |
| **檔案系統** | `file.*` | 檔案讀寫刪除列表（動態：`file.<action>.<tier>`） |
| **視窗** | `window.*` | 視窗建立 |
| **主控台** | `console.*` | 主控台讀寫 |
| **服務** | `service.*` | 服務健康狀態發布 |
| **環境** | `env.*` | 環境變數、自動啟動、程式庫載入 |
| **Shell** | `shell.*` | 系統指令（應用列表、啟動、視窗查詢） |
| **儲存** | `storage.*` | 儲存空間查詢 |
| **通知** | `notification.*` | 系統通知 |
| **監控** | `monitor.*` | 系統監控統計 |
| **設定** | `settings.*` | 主題與系統設定 |
| **網路** | `network.*` | HTTP 連線與允許清單管理 |

---

## 程序 API

**Scope**: `all` · **來源**: `ScriptRuntime` 內建

### 屬性

| 屬性 | 型別 | 說明 |
|------|------|------|
| `OS.pid` | `number` | 目前 PID |
| `OS.appDefId` | `string` | 應用定義 ID |
| `OS.appId` | `string` | 程序實例的 processAppId |
| `OS.type` | `string` | 程序類型（`'Service'` / `'Window'` / `'Console'` / `'Library'`） |
| `OS.parentPid` | `number \| null` | 父程序 PID（`null` 表示根程序） |

### 方法

| 方法 | 簽章 | 權限 | 說明 |
|------|------|------|------|
| `OS.status()` | `() → string` | — | 查詢當前狀態 |
| `OS.spawnChild(appDefId?, type?)` | `(string?, string?) → { success, pid? }` | `process.launch.<appDefId>` | 啟動子程序 |
| `OS.terminateSelf()` | `() → ProcessResult` | — | 終止自身 |
| `OS.listProcesses()` | `() → { success, data? }` | [`process.list`](../../src/kernel/constants.ts) | 列出所有程序 |
| `OS.terminateProcess(targetPid)` | `(number) → { success, data? }` | [`process.terminate`](../../src/kernel/constants.ts) | 完整終止指定程序（關閉視窗 + 銷毀 Runtime） |

> **注意**：`OS.terminateProcess` 會以 `setTimeout` 非同步執行，避免同步終止造成 re-entrant 問題。

### spawnChild 範例

```javascript
// 啟動與自身相同應用的子程序
var result = OS.spawnChild();

// 啟動指定應用的子程序
var result = OS.spawnChild('appdef_xxx', 'Window');
```

---

## 事件 API

**Scope**: `all` · **來源**: `ScriptRuntime` 內建

| 方法 | 簽章 | 權限 | 說明 |
|------|------|------|------|
| `OS.subscribe(eventName)` | `(string) → EventBusResult` | `event.subscribe.<eventName>` | 訂閱事件 |
| `OS.unsubscribe(eventName)` | `(string) → EventBusResult` | — | 取消訂閱 |
| `OS.emit(eventName, payload?)` | `(string, any?) → EventBusResult` | `event.emit.<eventName>` | 發送事件 |

> 事件權限為動態產生：[`Permissions.eventSubscribe()`](../../src/kernel/constants.ts)、[`Permissions.eventEmit()`](../../src/kernel/constants.ts)

### 訂閱後的接收

訂閱的事件會被放入程序的 inbox，可透過 `OS.receive()` 讀取。

---

## IPC API

**Scope**: `all` · **來源**: `ScriptRuntime` 內建

| 方法 | 簽章 | 權限 | 說明 |
|------|------|------|------|
| `OS.sendToParent(payload)` | `(any) → RuntimeResult` | [`process.ipc.send-parent`](../../src/kernel/constants.ts) | 傳訊息給父程序 |
| `OS.sendToChild(childPid, payload)` | `(number, any) → RuntimeResult` | [`process.ipc.send-child`](../../src/kernel/constants.ts) | 傳訊息給子程序 |
| `OS.broadcastChildren(payload)` | `(any) → RuntimeResult` | [`process.ipc.send-child`](../../src/kernel/constants.ts) | 廣播給所有子程序 |
| `OS.receive()` | `() → Message[]` | — | 讀取收件匣（一次性清空） |

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

## UI API（僅 Window 類程序）

**Scope**: `window` · **來源**: [`src/api/uiApi.ts`](../../src/api/uiApi.ts)

### 視窗操作

| 方法 | 簽章 | 權限 | 說明 |
|------|------|------|------|
| `OS.createWindow(options)` | `(object) → { success, data: windowId }` | [`window.create`](../../src/kernel/constants.ts) | 建立視窗 |
| `OS.initialize(windowId, tree)` | `(string, array) → void` | — | 以 UI tree 替換視窗內容 |
| `OS.update(windowId, nodeId, patch)` | `(string, string, object) → void` | — | 更新指定節點屬性 |
| `OS.remove(windowId, nodeId)` | `(string, string) → void` | — | 移除指定節點 |
| `OS.append(windowId, parentId, nodes)` | `(string, string, array) → void` | — | 在父節點下新增子節點 |

#### createWindow options

```javascript
OS.createWindow({
  title: 'My App',            // 視窗標題
  width: 520, height: 400,    // 初始尺寸
  x: 100, y: 80,              // 初始位置（可省略）
  useDefaultFrame: true,       // 是否使用預設標題列
  alwaysOnTop: false,          // 置頂模式
  resizable: true,             // 可否調整大小
  style: {                     // 視窗框樣式
    background: '...',
    color: '...',
    border: '...',
    borderRadius: '...',
    boxShadow: '...',
  }
});
```

### UI 節點建構器

所有節點建構器為純函式，不需要權限。

| 方法 | 說明 |
|------|------|
| `OS.label(text, style?, id?)` | 建立文字標籤節點 |
| `OS.button(text, style?, id?)` | 建立按鈕節點 |
| `OS.stack(children, style?, id?)` | 建立堆疊容器（預設垂直排列） |
| `OS.panel(children, style?, id?)` | 建立面板容器 |
| `OS.input(value?, placeholder?, style?, id?)` | 建立文字輸入框 |
| `OS.textarea(value?, placeholder?, rows?, style?, id?)` | 建立多行文字區域 |
| `OS.checkbox(checked?, label?, style?, id?)` | 建立核取方塊 |
| `OS.select(options, value?, style?, id?)` | 建立下拉選單 |
| `OS.image(src, alt?, style?, id?)` | 建立圖片節點 |
| `OS.separator(style?, id?)` | 建立分隔線 |
| `OS.progress(value, color?, style?, id?)` | 建立進度條 |
| `OS.list(children, style?, id?)` | 建立列表容器 |

#### 參數說明

- `text`：`string` — 顯示文字
- `style`：`object` — 可選樣式物件
  - `background`, `color`, `padding`, `gap`, `borderRadius`, `border`
  - `fontSize`, `justifyContent`, `alignItems`, `flexDirection`
- `id`：`string` — 控制項 ID，用於事件回呼比對
- `children`：`array` — 子節點陣列（stack / panel / list 使用）
- `options`：`array` — 選項陣列（select 使用）

---

## onWindowEvent（Window 回呼）

應用程式可定義 `globalThis.onWindowEvent` 來接收 UI 事件回呼：

```javascript
globalThis.onWindowEvent = function(event) {
  // event.controlId — 觸發的控制項 ID（對應 OS.button 的第三個參數）
  // event.type       — 事件類型（'click', 'change' 等）
  // event.windowId   — 所屬視窗 ID
  // event.eventId    — 事件唯一 ID
  // event.processAppId — 程序 ID
};
```

---

## Service API（僅 Service 類程序）

**Scope**: `service` · **來源**: `ScriptRuntime` 內建

| 方法 | 簽章 | 權限 | 說明 |
|------|------|------|------|
| `OS.publishHealth(health)` | `(any) → EventBusResult` | [`service.publish-health`](../../src/kernel/constants.ts) | 發送健康檢查事件 `service.health` |

---

## Window API（僅 Window 類程序）

**Scope**: `window` · **來源**: `ScriptRuntime` 內建

| 方法 | 簽章 | 權限 | 說明 |
|------|------|------|------|
| `OS.postUiEvent(name, payload?)` | `(string, any?) → EventBusResult` | `event.emit.window.ui` | 發送自訂 UI 事件 |

---

## Console API（僅 Console 類程序）

**Scope**: `console` · **來源**: [`src/api/consoleApi.ts`](../../src/api/consoleApi.ts)

| 方法 | 簽章 | 權限 | 說明 |
|------|------|------|------|
| `OS.writeLine(text)` | `(any) → boolean` | [`console.write`](../../src/kernel/constants.ts) | 輸出一行文字到 Console 視窗 |
| `OS.write(text)` | `(any) → boolean` | [`console.write`](../../src/kernel/constants.ts) | 附加文字到最後一行（不換行） |
| `OS.clear()` | `() → boolean` | [`console.write`](../../src/kernel/constants.ts) | 清除 Console 視窗所有輸出 |

### onConsoleInput（Console 回呼）

Console 類程式可定義 `globalThis.onConsoleInput` 接收使用者輸入：

```javascript
globalThis.onConsoleInput = function(line) {
  // line — 使用者在 Console 輸入框按下 Enter 送出的文字
  OS.writeLine('你輸入了: ' + line);
};
```

---

## System API

**Scope**: `all` · **來源**: [`src/api/systemApi.ts`](../../src/api/systemApi.ts)

| 方法 | 簽章 | 權限 | 說明 |
|------|------|------|------|
| `OS.terminateProcess(targetPid)` | `(number) → { success, data? }` | [`process.terminate`](../../src/kernel/constants.ts) | 完整終止程序（關閉視窗 + 銷毀 Runtime + 終止程序樹） |

> 此方法會覆寫內建 Process API 的同名方法，提供更完整的終止流程。

---

## Storage API（檔案儲存）

**Scope**: `all` · **來源**: [`src/api/storageApi.ts`](../../src/api/storageApi.ts)

所有路徑格式為 `[tier:][@namespace/]filename`。

| Tier | 說明 |
|------|------|
| `app`（預設） | 應用私有空間 |
| `user` | 使用者空間 |
| `sys` | 系統全域空間 |
| `cache` | 快取空間 |

| 方法 | 簽章 | 權限 | 說明 |
|------|------|------|------|
| `OS.readFile(path)` | `(string) → { success, data? }` | `file.read.<tier>` | 讀取檔案 |
| `OS.writeFile(path, data, options?)` | `(string, any, object?) → { success, data? }` | `file.write.<tier>` | 寫入檔案 |
| `OS.deleteFile(path)` | `(string) → { success }` | `file.delete.<tier>` | 刪除檔案 |
| `OS.listFiles(path?)` | `(string?) → { success, data? }` | `file.list.<tier>` | 列出檔案 |
| `OS.fileExists(path)` | `(string) → { success, data? }` | `file.list.<tier>` | 檢查檔案是否存在 |
| `OS.storageUsage()` | `() → { success, data? }` | [`storage.usage`](../../src/kernel/constants.ts) | 查詢儲存空間使用量 |
| `OS.listAllFiles(tier?)` | `(string?) → { success, data? }` | [`file.list-all`](../../src/kernel/constants.ts) | 列出所有應用的全部檔案 |

> 檔案權限為動態產生：[`Permissions.fileAction(action, tier)`](../../src/kernel/constants.ts)
>
> 跨應用存取（路徑含 `@namespace/`）額外需要 [`file.cross-app`](../../src/kernel/constants.ts) 權限。

### 路徑範例

```javascript
OS.readFile('test.json');                     // app 層, 本應用
OS.readFile('user:doc/readme');               // user 層, 本應用
OS.readFile('@terminal/config.json');         // app 層, 跨應用（需 file.cross-app）
OS.writeFile('cache:temp', { key: 'value' }); // cache 層
```

---

## 環境 API

**Scope**: `all` · **來源**: [`src/api/envApi.ts`](../../src/api/envApi.ts)

提供環境變數、自動啟動註冊、程式庫載入與命令註冊功能。

### 環境變數

| 方法 | 簽章 | 權限 | 說明 |
|------|------|------|------|
| `OS.getVariable(key)` | `(string) → { success, data? }` | [`env.read`](../../src/kernel/constants.ts) | 讀取環境變數 |
| `OS.getAllVariables()` | `() → { success, data? }` | [`env.read`](../../src/kernel/constants.ts) | 讀取所有環境變數 |
| `OS.setVariable(key, value)` | `(string, string) → { success }` | [`env.write`](../../src/kernel/constants.ts) | 設定環境變數 |
| `OS.removeVariable(key)` | `(string) → { success, data? }` | [`env.write`](../../src/kernel/constants.ts) | 刪除環境變數 |

### 自動啟動

| 方法 | 簽章 | 權限 | 說明 |
|------|------|------|------|
| `OS.registerAutoStart()` | `() → { success }` | [`env.autostart`](../../src/kernel/constants.ts) | 將目前程式註冊為自動啟動 |
| `OS.unregisterAutoStart()` | `() → { success }` | [`env.autostart`](../../src/kernel/constants.ts) | 取消自動啟動 |

### 程式庫

| 方法 | 簽章 | 權限 | 說明 |
|------|------|------|------|
| `OS.loadLibrary(libraryId)` | `(string) → RuntimeResult` | [`env.library.load`](../../src/kernel/constants.ts) | 載入程式庫到目前程序 |
| `OS.listLibraries()` | `() → { success, data: string[] }` | — | 列出所有已註冊的程式庫 ID |

#### loadLibrary 用法

```javascript
// libraryId 格式為 "packageName/appName"
var result = OS.loadLibrary('stdlib/Math Utils');
if (result.success) {
  // 程式庫已載入，其匯出的全域物件可直接使用
  var n = MathUtils.factorial(5); // 120
}
```

### 命令註冊

| 方法 | 簽章 | 權限 | 說明 |
|------|------|------|------|
| `OS.registerCommand(name, description, usage?)` | `(string, string, string?) → { success }` | — | 註冊 CLI 命令到系統命令表 |

#### registerCommand 用法

```javascript
// 通常在 Library 的 init 階段註冊命令
OS.registerCommand('factorial', '計算階乘', 'factorial <n>');

// 同時提供命令處理函式
globalThis.__commands = globalThis.__commands || {};
globalThis.__commands['factorial'] = function(args) {
  var n = parseInt(args[0], 10);
  return String(MathUtils.factorial(n));
};
```

---

## Shell API（系統指令）

**Scope**: `console` · **來源**: [`src/api/shellApi.ts`](../../src/api/shellApi.ts)

提供系統層級操作，僅 Console 類程序可用。

### 程序管理

| 方法 | 簽章 | 權限 | 說明 |
|------|------|------|------|
| `OS.listProcesses()` | `() → { success, data? }` | [`process.list`](../../src/kernel/constants.ts) | 列出所有程序 |
| `OS.killProcess(targetPid)` | `(number) → { success, data? }` | [`process.terminate`](../../src/kernel/constants.ts) | 終止指定程序 |

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

| 方法 | 簽章 | 權限 | 說明 |
|------|------|------|------|
| `OS.listApps()` | `() → { success, data? }` | [`shell.apps`](../../src/kernel/constants.ts) | 列出所有已註冊應用 |
| `OS.launch(appDefId)` | `(string) → { success, data? }` | [`shell.launch`](../../src/kernel/constants.ts) | 啟動應用（支援 appId 或名稱） |

> `launch` 不支援啟動 Library 類應用，會回傳 `{ success: false, error: 'CannotLaunchLibrary' }`。

### 視窗查詢

| 方法 | 簽章 | 權限 | 說明 |
|------|------|------|------|
| `OS.listWindows()` | `() → { success, data? }` | [`shell.windows`](../../src/kernel/constants.ts) | 列出所有開啟中視窗 |

### 系統資訊

| 方法 | 簽章 | 權限 | 說明 |
|------|------|------|------|
| `OS.sysinfo()` | `() → { success, data? }` | [`shell.sysinfo`](../../src/kernel/constants.ts) | 取得系統摘要 |

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

| 方法 | 簽章 | 權限 | 說明 |
|------|------|------|------|
| `OS.listCommands()` | `() → { success, data? }` | — | 列出所有已註冊 CLI 命令 |
| `OS.resolveCommand(name)` | `(string) → { success, data? }` | — | 解析命令名稱，取得其 libraryId 等資訊 |

#### 命令自動分派模式

```javascript
var cmd = 'factorial';
var args = ['5'];

var resolved = OS.resolveCommand(cmd);
if (resolved.success) {
  OS.loadLibrary(resolved.data.libraryId);
  if (globalThis.__commands && globalThis.__commands[cmd]) {
    var output = globalThis.__commands[cmd](args);
    OS.writeLine(output);
  }
}
```

---

## Notification API（通知）

**Scope**: `all` · **來源**: [`src/api/notificationApi.ts`](../../src/api/notificationApi.ts)

| 方法 | 簽章 | 權限 | 說明 |
|------|------|------|------|
| `OS.notify(title, body?, type?, duration?)` | `(string, string?, string?, number?) → { success, data? }` | [`notification.send`](../../src/kernel/constants.ts) | 發送通知 |
| `OS.dismiss(id)` | `(string) → { success }` | — | 關閉指定通知 |

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
OS.notify('操作完成');

// 帶類型與內容的通知
OS.notify('儲存成功', '檔案已成功寫入', 'success');

// 不自動消失的錯誤通知
OS.notify('錯誤', '無法連接伺服器', 'error', 0);

// 手動關閉通知
var result = OS.notify('處理中...');
if (result.success) {
  OS.dismiss(result.data);
}
```

---

## Monitor API（系統監控）

**Scope**: `all` · **來源**: [`src/api/monitorApi.ts`](../../src/api/monitorApi.ts)

所有方法均需 [`monitor.read`](../../src/kernel/constants.ts) 權限。

| 方法 | 簽章 | 說明 |
|------|------|------|
| `OS.snapshot()` | `() → { success, data? }` | 取得完整監控快照 |
| `OS.eventStats()` | `() → { success, data? }` | 取得事件統計 |
| `OS.apiStats()` | `() → { success, data? }` | 取得 API 呼叫統計 |
| `OS.permissionStats()` | `() → { success, data? }` | 取得權限檢查統計 |
| `OS.recentEvents(limit?)` | `(number?) → { success, data? }` | 取得最近事件記錄 |
| `OS.recentApiCalls(limit?)` | `(number?) → { success, data? }` | 取得最近 API 呼叫記錄 |
| `OS.processHistory()` | `() → { success, data? }` | 取得程序歷史記錄 |

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

---

## Settings API（系統設定）

**Scope**: `all` · **來源**: [`src/api/settingsApi.ts`](../../src/api/settingsApi.ts)

### 主題設定

| 方法 | 簽章 | 權限 | 說明 |
|------|------|------|------|
| `OS.getTheme()` | `() → { success, data? }` | [`settings.read`](../../src/kernel/constants.ts) | 取得目前主題 |
| `OS.applyTheme(theme)` | `(object) → { success }` | [`settings.write`](../../src/kernel/constants.ts) | 套用主題（不持久化） |
| `OS.saveTheme(theme)` | `(object) → { success }` | [`settings.write`](../../src/kernel/constants.ts) | 套用並儲存主題 |
| `OS.loadSavedTheme()` | `() → { success, data? }` | [`settings.read`](../../src/kernel/constants.ts) | 讀取已儲存的主題 |

#### 主題屬性

```javascript
OS.applyTheme({
  wallpaper: 'url(...)',       // 桌面背景
  tint: 'rgba(0,0,0,0.5)',    // 色調覆蓋
  accentPrimary: '#4a9eff',   // 主色調
  accentSecondary: '#2d7dd2', // 次色調
  taskbarOpacity: 0.85,       // 工作列透明度
  startMenuWidth: 320,        // 開始選單寬度
  startMenuHeight: 480,       // 開始選單高度
});
```

### 系統資訊

| 方法 | 簽章 | 權限 | 說明 |
|------|------|------|------|
| `OS.sysinfo()` | `() → { success, data? }` | [`settings.read`](../../src/kernel/constants.ts) | 取得系統摘要（所有程序類型可用） |

> **注意**：Console 程序中此方法會被 Shell API 的同名方法覆蓋（改為需要 `shell.sysinfo` 權限）。

### 通知設定

| 方法 | 簽章 | 權限 | 說明 |
|------|------|------|------|
| `OS.getNotificationSettings()` | `() → { success, data? }` | [`settings.read`](../../src/kernel/constants.ts) | 取得通知設定 |
| `OS.setNotificationSettings(settings)` | `(object) → { success, data? }` | [`settings.write`](../../src/kernel/constants.ts) | 更新通知設定 |

#### 通知設定屬性

```javascript
OS.setNotificationSettings({
  doNotDisturb: false,   // 勿擾模式
  defaultDuration: 4000, // 預設顯示時間（毫秒）
  maxVisible: 5,         // 同時顯示最大數量
});
```

### 應用資訊

| 方法 | 簽章 | 權限 | 說明 |
|------|------|------|------|
| `OS.getApps()` | `() → { success, data? }` | [`settings.read`](../../src/kernel/constants.ts) | 取得所有已註冊應用的詳細資訊 |
| `OS.getAppProcesses()` | `() → { success, data? }` | [`settings.read`](../../src/kernel/constants.ts) | 取得所有程序列表 |

---

## Network API（網路）

**Scope**: `all` · **來源**: [`src/api/networkApi.ts`](../../src/api/networkApi.ts)

提供受控的 HTTP 連線功能。所有連線受允許清單約束，僅匹配的網域可發送請求。

### 請求

| 方法 | 簽章 | 權限 | 說明 |
|------|------|------|------|
| `OS.request(url, options?)` | `(string, object?) → Promise<{ success, data? }>` | [`network.request`](../../src/kernel/constants.ts) | 發送 HTTP 請求 |
| `OS.isAllowed(url)` | `(string) → { success, data? }` | [`network.status`](../../src/kernel/constants.ts) | 檢查 URL 是否在允許清單中 |

#### request options

| 欄位 | 型別 | 說明 |
|------|------|------|
| `method` | `string` | HTTP 方法：`GET`、`POST`、`PUT`、`DELETE`、`PATCH`、`HEAD`、`OPTIONS`（預設 `GET`） |
| `headers` | `object` | 請求標頭 |
| `body` | `string` | 請求主體（GET / HEAD 時忽略） |
| `timeout` | `number` | 逾時時間（毫秒），預設 10000 |

### 狀態與管理

| 方法 | 簽章 | 權限 | 說明 |
|------|------|------|------|
| `OS.getStatus()` | `() → { success, data? }` | [`network.status`](../../src/kernel/constants.ts) | 取得網路狀態 |
| `OS.getAllowlist()` | `() → { success, data? }` | [`network.manage`](../../src/kernel/constants.ts) | 取得允許清單 |
| `OS.addAllowlistEntry(pattern, description?)` | `(string, string?) → { success }` | [`network.manage`](../../src/kernel/constants.ts) | 新增允許清單項目 |
| `OS.removeAllowlistEntry(pattern)` | `(string) → { success }` | [`network.manage`](../../src/kernel/constants.ts) | 移除允許清單項目 |
| `OS.setEnabled(enabled)` | `(boolean) → { success }` | [`network.manage`](../../src/kernel/constants.ts) | 啟用/停用網路功能 |

### 用法範例

```javascript
// 檢查 URL 是否允許
var check = OS.isAllowed('https://api.example.com');

// 發送 GET 請求
var res = OS.request('https://api.example.com/data');

// 發送 POST 請求
var res = OS.request('https://api.example.com/submit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: 'value' }),
  timeout: 5000
});
```

---

## 全域函式

### imports（模組載入）

```javascript
var module = imports('./utils.js');
```

使用 CommonJS-like 模式載入同一套件中的其他檔案。模組內可使用 `module.exports` 匯出。

### Timer 函式

| 函式 | 說明 |
|------|------|
| `setTimeout(fn, delay)` | 延遲執行（回傳 timer ID） |
| `setInterval(fn, delay)` | 週期執行（回傳 timer ID） |
| `clearTimeout(id)` | 取消 setTimeout |
| `clearInterval(id)` | 取消 setInterval |

---

## 權限速查表

以下列出所有 API 使用的權限字串，定義於 [`src/kernel/constants.ts`](../../src/kernel/constants.ts) 的 `Permissions` 物件。

| 權限字串 | 常數名稱 | 對應 API |
|---------|---------|---------|
| `process.list` | `PROCESS_LIST` | `OS.listProcesses()` |
| `process.terminate` | `PROCESS_TERMINATE` | `OS.terminateProcess()`, `OS.killProcess()` |
| `process.launch.<id>` | `processLaunch(id)` | `OS.spawnChild()` |
| `process.ipc.send-parent` | `IPC_SEND_PARENT` | `OS.sendToParent()` |
| `process.ipc.send-child` | `IPC_SEND_CHILD` | `OS.sendToChild()`, `OS.broadcastChildren()` |
| `event.subscribe.<name>` | `eventSubscribe(name)` | `OS.subscribe()` |
| `event.emit.<name>` | `eventEmit(name)` | `OS.emit()` |
| `window.create` | `WINDOW_CREATE` | `OS.createWindow()` |
| `console.write` | `CONSOLE_WRITE` | `OS.writeLine()`, `OS.write()`, `OS.clear()` |
| `console.read` | `CONSOLE_READ` | Console 輸入事件 |
| `service.publish-health` | `SERVICE_PUBLISH_HEALTH` | `OS.publishHealth()` |
| `file.<action>.<tier>` | `fileAction(action, tier)` | `OS.readFile()`, `OS.writeFile()`, `OS.deleteFile()`, `OS.listFiles()` |
| `file.cross-app` | `FILE_CROSS_APP` | 跨應用檔案存取 |
| `file.list-all` | `FILE_LIST_ALL` | `OS.listAllFiles()` |
| `storage.usage` | `STORAGE_USAGE` | `OS.storageUsage()` |
| `env.read` | `ENV_READ` | `OS.getVariable()`, `OS.getAllVariables()` |
| `env.write` | `ENV_WRITE` | `OS.setVariable()`, `OS.removeVariable()` |
| `env.autostart` | `ENV_AUTOSTART` | `OS.registerAutoStart()`, `OS.unregisterAutoStart()` |
| `env.library.load` | `ENV_LOAD_LIBRARY` | `OS.loadLibrary()` |
| `shell.apps` | `SHELL_LIST_APPS` | `OS.listApps()` |
| `shell.launch` | `SHELL_LAUNCH` | `OS.launch()` |
| `shell.windows` | `SHELL_WINDOWS` | `OS.listWindows()` |
| `shell.sysinfo` | `SHELL_SYSINFO` | `OS.sysinfo()`（Console） |
| `notification.send` | `NOTIFICATION_SEND` | `OS.notify()` |
| `monitor.read` | `MONITOR_READ` | `OS.snapshot()`, `OS.eventStats()`, `OS.apiStats()`, `OS.permissionStats()`, `OS.recentEvents()`, `OS.recentApiCalls()`, `OS.processHistory()` |
| `settings.read` | `SETTINGS_READ` | `OS.getTheme()`, `OS.loadSavedTheme()`, `OS.sysinfo()`（非 Console）, `OS.getNotificationSettings()`, `OS.getApps()`, `OS.getAppProcesses()` |
| `settings.write` | `SETTINGS_WRITE` | `OS.applyTheme()`, `OS.saveTheme()`, `OS.setNotificationSettings()` |
| `network.request` | `NETWORK_REQUEST` | `OS.request()` |
| `network.status` | `NETWORK_STATUS` | `OS.isAllowed()`, `OS.getStatus()` |
| `network.manage` | `NETWORK_MANAGE` | `OS.getAllowlist()`, `OS.addAllowlistEntry()`, `OS.removeAllowlistEntry()`, `OS.setEnabled()` |
