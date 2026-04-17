# Host API

**檔案**：`src/api/` 目錄

Host API 是沙箱應用程式透過 `OS` 全域物件存取的系統功能。每個 API 模組由 `runtime.registerApi()` 注入。

---

## API 模組一覽

### 內建 Runtime API（`BaseRuntime` 自動注入）

| 模組 | 命名空間 | 說明 |
|------|---------|------|
| Process | `OS.process` | 程序資訊、生命週期、子程序管理 |
| Event | `OS.event` | 事件訂閱/發射 |
| IPC | `OS.ipc` | 程序間通訊 |
| Service | `OS.service` | 服務健康狀態（僅 Service 類型） |

### Host API（`src/api/` 模組註冊）

| 模組 | 命名空間 | 檔案 | 說明 |
|------|---------|------|------|
| UI | `OS.ui` | `uiApi.ts` | 視窗建立、UI tree 操作、ContextMenu |
| System | `OS.system` | `systemApi.ts` | 程序終止 |
| Storage | `OS.storage` | `storageApi.ts` | 檔案系統操作 |
| Env | `OS.env` | `envApi.ts` | 環境變數、程式庫、命令註冊 |
| Console | `OS.console` | `consoleApi.ts` | 主控台輸出/輸入、ANSI 色彩 |
| Shell | `OS.shell` | `shellApi.ts` | 系統指令（程序、app、視窗、命令） |
| Notification | `OS.notification` | `notificationApi.ts` | 通知發送與撤銷 |
| Monitor | `OS.monitor` | `monitorApi.ts` | 系統監控快照與統計 |
| Settings | `OS.settings` | `settingsApi.ts` | 主題、通知、語言、系統資訊 |
| Network | `OS.network` | `networkApi.ts` | HTTP 請求、允許清單管理 |
| Registry | `OS.registry` | `registryApi.ts` | 系統角色註冊表、檔案類型關聯 |
| Dialog | `OS.dialog` | `dialogApi.ts` | 檔案選擇對話框 |

---

## 共用回傳格式

所有 API 皆回傳統一的 Result 物件：

```typescript
interface Result {
  success: boolean;
  data?: any;       // 成功時的資料
  error?: string;   // 失敗時的錯誤碼
}
```

常見錯誤碼：`PermissionDenied`、`NotFound`、`InvalidArgument`。

---

## Process API（`OS.process`）

內建 API，所有程序自動可用。

### pid

當前程序的 PID。

```javascript
var myPid = OS.process.pid;
```

### appDefId

當前程序的應用定義 ID。

### appId

當前程序的 processAppId。

### type

程序類型：`'Service'` | `'Window'` | `'Console'` | `'Library'`。

### parentPid

父程序 PID（若無則為 `null`）。

### status()

取得當前程序狀態。

```javascript
var s = OS.process.status(); // 'running' | 'stopped' | 'suspended'
```

### spawnChild(appDefId?, type?)

建立子程序。

```javascript
var child = OS.process.spawnChild(undefined, 'Service');
// { success: true, pid: 42 }
```

### terminateSelf()

終止自身程序。

### terminateProcess(targetPid)

終止指定程序。需要 `process.terminate` 權限。

### listProcesses()

列出所有程序。需要 `process.list` 權限。

---

## Event API（`OS.event`）

內建 API，所有程序自動可用。

### subscribe(eventName)

訂閱事件。需要 `event.subscribe.<eventName>` 權限。

```javascript
OS.event.subscribe('process.started');
```

訂閱後，事件資料透過 `OS.ipc.receive()` 的訊息佇列接收。

### unsubscribe(eventName)

取消訂閱事件。

### emit(eventName, payload?)

發射事件。需要 `event.emit.<eventName>` 權限。

```javascript
OS.event.emit('my-service.ready', { version: '1.0' });
```

---

## IPC API（`OS.ipc`）

內建 API，所有程序自動可用。

### sendToParent(payload)

發送訊息給父程序。需要 `process.ipc.send-parent` 權限。

```javascript
OS.ipc.sendToParent({ status: 'done', result: 42 });
```

### sendToChild(childPid, payload)

發送訊息給子程序。需要 `process.ipc.send-child` 權限。

```javascript
OS.ipc.sendToChild(childPid, { command: 'start' });
```

### broadcastChildren(payload)

廣播訊息給所有子程序。需要 `process.ipc.send-child` 權限。

### receive()

讀取訊息佇列（IPC 訊息 + 事件訊息）。

```javascript
var messages = OS.ipc.receive();
messages.forEach(function(msg) {
  // msg: { fromPid, toPid, type: 'ipc'|'event', channel, payload, timestamp }
});
```

---

## Service API（`OS.service`）

**權限 gate**：`service`（僅 Service 類型程序可用）  
**所需權限**：`service.publish-health`

### publishHealth(health)

發布服務健康狀態。

```javascript
OS.service.publishHealth({ status: 'ok', uptime: 3600 });
```

---

## UI API（`OS.ui`）

**權限 gate**：`window`  
**所需權限**：`window.create`

### createWindow(options)

建立新視窗，回傳 windowId。

```javascript
const result = OS.ui.createWindow({
  title: 'My App',       // 視窗標題
  width: 520,             // 寬度（px），預設 520
  height: 360,            // 高度（px），預設 360
  x: 100,                 // 選填，預設自動排列
  y: 100,                 // 選填
  useDefaultFrame: true,  // 預設 true，系統提供標題列/按鈕
  alwaysOnTop: false,     // 預設 false
  resizable: true,        // 預設 true
  style: {                // 選填，視窗外框樣式
    background: '#1a1f2a',
    color: '#fff',
  }
});
// result: { success: true, data: 'win_xxxxx' }
```

> **速率限制**：每個程序每秒最多建立 10 個視窗，超過回傳 `RateLimitExceeded`。

### initialize(windowId, tree)

以 UI node 陣列初始化（或替換）視窗內容。每次呼叫會完全替換 `.window-content` 下的所有子元素。

```javascript
OS.ui.initialize(windowId, [
  OS.ui.panel({ id: 'main', children: [
    OS.ui.label({ id: 'title', text: 'Hello World' }),
    OS.ui.button({ id: 'btn', text: 'Click Me' }),
  ]})
]);
```

### update(windowId, nodeId, patch)

更新指定 UI 節點的屬性。

```javascript
OS.ui.update(windowId, 'title', { text: 'Updated!' });
OS.ui.update(windowId, 'btn', { style: { color: 'red' } });
```

**可更新屬性（WindowUiNodePatch）**：
| 屬性 | 型別 | 說明 |
|------|------|------|
| `text` | `string` | label/button 文字 |
| `value` | `string \| number \| boolean` | input/textarea/select/checkbox 值 |
| `checked` | `boolean` | checkbox 勾選狀態 |
| `style` | `WindowUiStyle` | 樣式物件 |
| `options` | `{value, label}[]` | select 選項 |
| `children` | `WindowUiNode[]` | 替換子節點 |
| `src` | `string` | image 來源 |
| `placeholder` | `string` | input/textarea 佔位文字 |
| `label` | `string` | checkbox 標籤 |
| `color` | `string` | progress 色彩 |
| `rows` | `number` | textarea 行數 |

### remove(windowId, nodeId)

移除指定 UI 節點。

### append(windowId, parentId, nodes)

在指定父節點下新增子節點。

```javascript
OS.ui.append(windowId, 'main', [
  OS.ui.label({ id: 'new-item', text: 'Added!' })
]);
```

### showContextMenu(windowId, controlId, x, y, items)

顯示右鍵選單。

```javascript
OS.ui.showContextMenu(windowId, 'file-list', event.x, event.y, [
  { id: 'open', label: '開啟' },
  { separator: true },
  { id: 'delete', label: '刪除', danger: true },
]);
```

### closeContextMenu()

關閉目前開啟的右鍵選單。

### Node 建構器

透過 `UiComponentRegistry` 動態註冊的節點建構函式。內建元件：

```javascript
OS.ui.label({ id, text, style, events })
OS.ui.button({ id, text, style, events, eventType })
OS.ui.panel({ id, children, style, events })
OS.ui.stack({ id, children, style, events })
OS.ui.input({ id, value, placeholder, style, events })
OS.ui.textarea({ id, value, placeholder, rows, style, events })
OS.ui.checkbox({ id, checked, label, style, events })
OS.ui.select({ id, options: [{value, label}], value, style, events })
OS.ui.image({ id, src, alt, style, events })
OS.ui.separator({ id, style })
OS.ui.progress({ id, value, color, style })
OS.ui.list({ id, children, style, events })
```

> 插件可透過 `context.registerUiComponent()` 新增自訂元件類型。

---

## Window 事件

視窗 UI 事件透過 `globalThis.onWindowEvent` 回呼：

```typescript
interface WindowUiEvent {
  eventId: string;
  windowId: string;
  processAppId: string;
  type: 'click' | 'change' | 'submit' | 'dblclick' | 'contextmenu' | 'contextmenu-select';
  controlId?: string;   // 觸發事件的元件 id
  value?: unknown;       // input/textarea/select 等的值
  x?: number;            // contextmenu 的滑鼠 X 座標
  y?: number;            // contextmenu 的滑鼠 Y 座標
}
```

```javascript
globalThis.onWindowEvent = function(event) {
  if (event.type === 'click' && event.controlId === 'my-btn') { /* ... */ }
  if (event.type === 'change' && event.controlId === 'my-input') {
    var newValue = event.value;
  }
  if (event.type === 'contextmenu-select') {
    var menuItemId = event.controlId; // 對應 ContextMenuItem.id
  }
};
```

### 視窗生命週期事件

透過 `globalThis.onWindowChange` 回呼，事件類型：`created`、`closed`、`minimized`、`maximized`、`restored`、`focused`、`resized`。

```javascript
globalThis.onWindowChange = function(event) {
  // event: { type, windowId, processAppId, title, state, bounds? }
  if (event.type === 'resized') {
    // event.bounds: { width, height, x, y }
  }
  if (event.type === 'closed') {
    // 視窗已關閉
  }
};
```

---

## System API（`OS.system`）

**權限 gate**：`process`

### terminateProcess(targetPid)

終止指定 PID 的程序。需要 `process.terminate` 權限。

```javascript
var result = OS.system.terminateProcess(42);
// { success: true, data: 42 }
```

---

## Storage API（`OS.storage`）

**權限 gate**：無（使用檔案層級權限）  
**所需權限**：`file.read.<tier>`、`file.write.<tier>`、`file.delete.<tier>`、`file.list.<tier>`

### 路徑格式

```
[tier:][@namespace/]filename
```

| 部分 | 說明 | 範例 |
|------|------|------|
| `tier:` | 儲存層級，預設 `app` | `sys:`、`app:`、`user:`、`cache:` |
| `@namespace/` | 跨應用存取（需 `file.cross-app` 權限） | `@terminal/` |
| `filename` | 檔案名稱，支援 `/` 子目錄 | `config.json`、`data/list.json` |

**路徑範例**：
| 路徑 | 層級 | 實際 key |
|------|------|----------|
| `"test.json"` | app | `{storageId}/test.json` |
| `"user:readme"` | user | `readme` |
| `"sys:boot-config"` | sys | `boot-config` |
| `"@terminal/config.json"` | app | `terminal/config.json`（跨應用） |
| `"user:@terminal/data.json"` | user | `terminal/data.json`（跨應用） |

> **注意**：`sys` 和 `user` 層是全域共享的，不自動加命名空間前綴。

### readFile(path)

讀取檔案。

```javascript
var result = OS.storage.readFile('config.json');
// { success: true, data: { key: 'config.json', tier: 'app', data: {...}, createdAt, updatedAt } }
```

### writeFile(path, data, options?)

寫入檔案。

```javascript
OS.storage.writeFile('config.json', { theme: 'dark' });
OS.storage.writeFile('config.json', { theme: 'light' }, { overwrite: true });
```

### deleteFile(path)

刪除檔案。

```javascript
OS.storage.deleteFile('old-data.json');
```

### listFiles(path?)

列出指定前綴下的所有檔案。

```javascript
var result = OS.storage.listFiles('data/');
// { success: true, data: [{ key: 'data/file1.json', ... }, ...] }
```

### fileExists(path)

檢查檔案是否存在。

```javascript
var result = OS.storage.fileExists('config.json');
// { success: true, data: true }
```

### storageUsage()

查詢儲存空間用量。需要 `storage.usage` 權限。

```javascript
var result = OS.storage.storageUsage();
// { success: true, data: { total: 1024, used: 42, tiers: { sys: {...}, app: {...}, ... } } }
```

### listAllFiles(tier?)

列出所有檔案（可選指定 tier）。需要 `file.list-all` 權限。

```javascript
var result = OS.storage.listAllFiles('app');
```

---

## Env API（`OS.env`）

**權限 gate**：`env`

### getVariable(key)

讀取環境變數。需要 `env.read` 權限。

```javascript
var result = OS.env.getVariable('PATH');
// { success: true, data: '/usr/bin' }
```

### getAllVariables()

取得所有環境變數。需要 `env.read` 權限。

```javascript
var result = OS.env.getAllVariables();
// { success: true, data: { PATH: '...', HOME: '...', ... } }
```

### setVariable(key, value)

設定環境變數。需要 `env.write` 權限。

```javascript
OS.env.setVariable('MY_VAR', 'hello');
```

### removeVariable(key)

移除環境變數。需要 `env.write` 權限。

### registerAutoStart()

將目前應用註冊為開機自動啟動。需要 `env.autostart` 權限。

### unregisterAutoStart()

取消自動啟動。需要 `env.autostart` 權限。

### loadLibrary(libraryId)

載入已快取的 Library 程式碼到當前程序。需要 `env.library.load` 權限。

```javascript
var result = OS.env.loadLibrary('stdlib/MathUtils');
// Library 的全域變數會注入到當前 context
```

### listLibraries()

列出所有可用的 Library ID。

```javascript
var result = OS.env.listLibraries();
// { success: true, data: ['stdlib/MathUtils', 'stdlib/StringUtils'] }
```

### registerCommand(name, description, usage?)

註冊 CLI 命令（通常由 Library 使用）。

```javascript
OS.env.registerCommand('factorial', '計算階乘', 'factorial <n>');
```

---

## Console API（`OS.console`）

**權限 gate**：`console`  
**所需權限**：`console.write`

### writeLine(text)

輸出一行文字（附換行）。

### write(text)

附加文字到最後一行（不換行）。

### clear()

清除控制台螢幕。

### ANSI

ANSI 色彩/樣式常數物件。

```javascript
OS.console.writeLine(OS.console.ANSI.RED + 'Error!' + OS.console.ANSI.RESET);
```

**可用常數**：
`RESET`、`BOLD`、`DIM`、`ITALIC`、`UNDERLINE`、`INVERSE`、`STRIKETHROUGH`、
`BLACK`、`RED`、`GREEN`、`YELLOW`、`BLUE`、`MAGENTA`、`CYAN`、`WHITE`、
`BRIGHT_BLACK`～`BRIGHT_WHITE`、
`BG_BLACK`～`BG_WHITE`

### fg256(n)

產生 256 色前景碼。

```javascript
OS.console.writeLine(OS.console.fg256(208) + 'Orange text' + OS.console.ANSI.RESET);
```

### bg256(n)

產生 256 色背景碼。

### fgRgb(r, g, b)

產生 RGB 前景碼。

```javascript
OS.console.writeLine(OS.console.fgRgb(255, 128, 0) + 'Custom color' + OS.console.ANSI.RESET);
```

### bgRgb(r, g, b)

產生 RGB 背景碼。

### colorize(text, color)

便利函式，自動包裝 ANSI 色彩。

```javascript
OS.console.writeLine(OS.console.colorize('Warning!', 'YELLOW'));
```

---

## Shell API（`OS.shell`）

**權限 gate**：`shell`

### listProcesses()

列出所有程序。需要 `process.list` 權限。

```javascript
var result = OS.shell.listProcesses();
// { success: true, data: [{ pid, appDefId, appName, processAppId, type, status, parentPid }] }
```

### killProcess(targetPid)

終止指定程序。需要 `process.terminate` 權限。

```javascript
OS.shell.killProcess(42);
```

### listApps()

列出所有已註冊應用。需要 `shell.apps` 權限。

```javascript
var result = OS.shell.listApps();
// { success: true, data: [{ appId, name, version, type, package, autoStart }] }
```

### launch(appDefId, fileArgs?)

啟動應用程式。需要 `shell.launch` 權限。

```javascript
OS.shell.launch('appdef_xxxxx');
OS.shell.launch('Text Editor', { filePath: '/docs/readme.md', tier: 'user' });
```

> 支援 appDefId 或應用名稱。`fileArgs` 為選填物件，傳遞給目標應用。

### listWindows()

列出所有開啟中的視窗。需要 `shell.windows` 權限。

```javascript
var result = OS.shell.listWindows();
// { success: true, data: [{ windowId, processAppId, title, state }] }
```

### sysinfo()

取得系統概況。需要 `shell.sysinfo` 權限。

```javascript
var result = OS.shell.sysinfo();
// { success: true, data: { uptime, processes: { total, running }, windows, libraries, commands, apps } }
```

### listCommands()

列出所有已註冊的 CLI 命令。

```javascript
var result = OS.shell.listCommands();
// { success: true, data: [{ name, description, usage, libraryId }] }
```

### resolveCommand(name)

查詢指定命令的詳細資訊。

```javascript
var result = OS.shell.resolveCommand('factorial');
// { success: true, data: { name, description, usage, libraryId } }
// 若不存在：{ success: false, error: 'CommandNotFound' }
```

---

## Notification API（`OS.notification`）

**權限 gate**：`notification`  
**所需權限**：`notification.send`

### notify(title, body?, type?, duration?)

發送通知。

```javascript
OS.notification.notify('下載完成', '檔案已儲存', 'success', 5000);
```

| 參數 | 型別 | 說明 |
|------|------|------|
| `title` | `string` | 通知標題 |
| `body` | `string?` | 通知內文 |
| `type` | `'info' \| 'success' \| 'warning' \| 'error'` | 通知類型，預設 `info` |
| `duration` | `number?` | 顯示時間（ms），預設由系統設定決定 |

回傳通知 ID：`{ success: true, data: 'notif_xxxxx' }`

### dismiss(id)

撤銷指定通知。

```javascript
OS.notification.dismiss('notif_xxxxx');
```

---

## Monitor API（`OS.monitor`）

**權限 gate**：`monitor`  
**所需權限**：`monitor.read`

### snapshot()

取得系統監控快照。

```javascript
var result = OS.monitor.snapshot();
// { success: true, data: { activeProcesses, ... } }
```

### eventStats()

取得事件統計（發射/訂閱/取消訂閱次數）。

### apiStats()

取得 API 呼叫統計。

### permissionStats()

取得權限檢查統計。

### recentEvents(limit?)

取得最近的事件紀錄。預設 50 筆。

```javascript
var result = OS.monitor.recentEvents(20);
```

### recentApiCalls(limit?)

取得最近的 API 呼叫紀錄。預設 50 筆。

### processHistory()

取得程序啟動/終止歷史。

---

## Settings API（`OS.settings`）

**權限 gate**：`settings`

### getTheme()

取得目前主題設定。需要 `settings.read` 權限。

```javascript
var result = OS.settings.getTheme();
// { success: true, data: { wallpaper, tint, accentPrimary, accentSecondary, taskbarOpacity, taskbarMode, ... } }
```

### applyTheme(theme)

套用主題（不持久化）。需要 `settings.write` 權限。

```javascript
OS.settings.applyTheme({
  wallpaper: 'url(...)',
  tint: 'rgba(0,0,0,0.5)',
  accentPrimary: '#4a9eff',
  accentSecondary: '#76b9ff',
  taskbarOpacity: 0.85,
  taskbarMode: 'docked',        // 'docked' | 'fullwidth' | 'floating-compact'
  startMenuWidth: 320,
  startMenuHeight: 480,
  startMenuGroupByPackage: true,
});
```

### saveTheme(theme)

套用並持久化主題。需要 `settings.write` 權限。

### loadSavedTheme()

讀取已儲存的主題設定。需要 `settings.read` 權限。

### sysinfo()

取得系統概況（與 Shell API 的 sysinfo 相同格式）。需要 `settings.read` 權限。

### getNotificationSettings()

取得通知設定。需要 `settings.read` 權限。

```javascript
var result = OS.settings.getNotificationSettings();
// { success: true, data: { doNotDisturb, defaultDuration, maxVisible } }
```

### setNotificationSettings(settings)

更新通知設定。需要 `settings.write` 權限。

```javascript
OS.settings.setNotificationSettings({
  doNotDisturb: true,
  defaultDuration: 5000,
  maxVisible: 3,
});
```

### getApps()

取得所有已註冊應用的詳細資訊。需要 `settings.read` 權限。

```javascript
var result = OS.settings.getApps();
// { success: true, data: [{ appId, name, packageName, version, description, author, runtimeType, permissions, maxInstances, autoStart }] }
```

### getAppProcesses()

取得所有程序的狀態。需要 `settings.read` 權限。

```javascript
var result = OS.settings.getAppProcesses();
// { success: true, data: [{ pid, appDefId, type, status }] }
```

### getLanguage()

取得語言設定。需要 `settings.read` 權限。

```javascript
var result = OS.settings.getLanguage();
// { success: true, data: { current: 'zh-TW', supported: ['en', 'zh-TW', 'ja'] } }
```

### setLanguage(locale)

切換系統語言。需要 `settings.write` 權限。

```javascript
OS.settings.setLanguage('en');
```

---

## Network API（`OS.network`）

**權限 gate**：`network`

### request(url, options?)

發送 HTTP 請求。需要 `network.request` 權限。

```javascript
var result = await OS.network.request('https://api.example.com/data', {
  method: 'POST',                      // 預設 'GET'
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: 'value' }),
  timeout: 10000,                      // ms
});
// 成功：{ success: true, data: { status: 200, statusText: 'OK', headers: {...}, body: '...' } }
// 失敗：{ success: false, error: 'NotAllowed' | 'ConnectionFailed' | 'Timeout' | ... }
```

> **注意**：URL 必須在系統允許清單中，否則回傳 `NotAllowed`。

### isAllowed(url)

檢查 URL 是否在允許清單中。需要 `network.status` 權限。

```javascript
var result = OS.network.isAllowed('https://api.example.com');
// { success: true, data: true }
```

### getStatus()

取得網路模組狀態。需要 `network.status` 權限。

```javascript
var result = OS.network.getStatus();
// { success: true, data: { enabled, allowlistCount, totalRequests, blockedRequests } }
```

### getAllowlist()

取得完整允許清單。需要 `network.manage` 權限。

```javascript
var result = OS.network.getAllowlist();
// { success: true, data: [{ pattern: 'https://api.example.com/*', description: '...', createdAt }] }
```

### addAllowlistEntry(pattern, description?)

新增允許清單條目。需要 `network.manage` 權限。

```javascript
OS.network.addAllowlistEntry('https://api.example.com/*', 'Example API');
```

### removeAllowlistEntry(pattern)

移除允許清單條目。需要 `network.manage` 權限。

### setEnabled(enabled)

啟用/停用網路模組。需要 `network.manage` 權限。

```javascript
OS.network.setEnabled(false); // 停用所有網路請求
```

---

## Registry API（`OS.registry`）

**權限 gate**：`registry`

### getDefaultApp(role)

取得指定系統角色的預設應用程式 appDefId。需要 `registry.read` 權限。

```javascript
var result = OS.registry.getDefaultApp('text-editor');
// { success: true, data: 'appdef_xxxxx' }
```

**內建角色**：`task-manager`、`file-manager`、`terminal`、`settings`、`text-editor`

### getAllRoles()

取得所有角色對應表。需要 `registry.read` 權限。

### setDefaultApp(role, appDefId)

設定角色的預設應用。需要 `registry.write` 權限。

### getFileTypeHandler(extension)

取得副檔名對應的預設應用。需要 `registry.read` 權限。

```javascript
var result = OS.registry.getFileTypeHandler('.txt');
// { success: true, data: { extension: '.txt', appDefId: 'appdef_xxxxx', mimeType: 'text/plain' } }
```

### getAllFileTypeHandlers()

取得所有檔案類型關聯。需要 `registry.read` 權限。

### setFileTypeHandler(extension, appDefId, mimeType?)

設定副檔名的預設應用。需要 `registry.write` 權限。

```javascript
OS.registry.setFileTypeHandler('.md', 'appdef_xxxxx', 'text/markdown');
```

### removeFileTypeHandler(extension)

移除副檔名的檔案類型關聯。需要 `registry.write` 權限。

### getSnapshot()

取得完整註冊表快照。需要 `registry.read` 權限。

```javascript
var result = OS.registry.getSnapshot();
// { success: true, data: { roles: {...}, fileTypes: [...] } }
```

---

## Dialog API（`OS.dialog`）

**權限 gate**：`dialog`

### pickFile(options?)

開啟檔案選擇對話框。需要 `dialog.open` 權限。需要有至少一個開啟的視窗。

```javascript
var result = OS.dialog.pickFile({
  mode: 'file',           // 'file' | 'folder' | 'save'
  title: '選擇檔案',
  extensions: ['.txt', '.md'],  // 選填，篩選副檔名
  defaultPath: '/docs',         // 選填，預設路徑
});
// { success: true, data: dialogId }
```

使用者選擇結果透過 `globalThis.onDialogResult` 回呼接收：

```javascript
globalThis.onDialogResult = function(result) {
  // result: { cancelled, path?, tier?, filename? }
  if (!result.cancelled) {
    var filePath = result.tier + ':' + result.path;
    // 使用 OS.storage.readFile(filePath) 讀取
  }
};
```

---

## 全域回呼函式摘要

| 回呼 | 觸發時機 | 參數 |
|------|---------|------|
| `globalThis.onWindowEvent` | 視窗 UI 事件 | `WindowUiEvent` |
| `globalThis.onWindowChange` | 視窗生命週期事件 | `WindowLifecycleEvent` |
| `globalThis.onConsoleInput` | Console 使用者輸入 | `line: string` |
| `globalThis.onKeyboardEvent` | 鍵盤事件 | `event: object` |
| `globalThis.onFileOpen` | 檔案開啟事件（從檔案管理器等） | `fileInfo: object` |
| `globalThis.onDialogResult` | 對話框結果 | `result: { cancelled, path?, tier?, filename? }` |

---

## 權限速查表

### 靜態權限

| 權限 | 說明 |
|------|------|
| `*` | 完整權限（萬用字元） |
| `window.create` | 建立視窗 |
| `process.terminate` | 終止程序 |
| `process.suspend` | 暫停程序 |
| `process.resume` | 恢復程序 |
| `process.list` | 列出程序 |
| `process.ipc.send-parent` | IPC 傳訊給父程序 |
| `process.ipc.send-child` | IPC 傳訊給子程序 |
| `console.write` | Console 輸出 |
| `console.read` | Console 輸入 |
| `env.read` | 讀取環境變數 |
| `env.write` | 寫入環境變數 |
| `env.autostart` | 管理自動啟動 |
| `env.library.load` | 載入程式庫 |
| `storage.usage` | 查詢儲存用量 |
| `file.cross-app` | 跨應用存取檔案 |
| `file.list-all` | 列出所有檔案 |
| `shell.apps` | 列出已註冊應用 |
| `shell.launch` | 啟動應用 |
| `shell.windows` | 列出開啟中視窗 |
| `shell.sysinfo` | 取得系統資訊 |
| `notification.send` | 發送通知 |
| `monitor.read` | 讀取系統監控數據 |
| `settings.read` | 讀取系統設定 |
| `settings.write` | 寫入系統設定 |
| `network.request` | 發送 HTTP 請求 |
| `network.status` | 查詢網路狀態 |
| `network.manage` | 管理網路允許清單 |
| `registry.read` | 讀取註冊表 |
| `registry.write` | 寫入註冊表 |
| `dialog.open` | 開啟對話框 |
| `dialog.resolve` | 回報對話框結果（Picker 專用） |

### 動態權限

| 格式 | 說明 | 範例 |
|------|------|------|
| `event.subscribe.<event>` | 訂閱指定事件 | `event.subscribe.window.ui` |
| `event.emit.<event>` | 發送指定事件 | `event.emit.console.output` |
| `process.launch.<appDefId>` | 啟動指定應用 | `process.launch.appdef_xxxxx` |
| `file.<action>.<tier>` | 指定層級的檔案操作 | `file.read.user`、`file.write.app` |

> 支援萬用字元：`event.subscribe.*`、`process.launch.*`、`file.read.*`

---

## 系統事件常數

| 事件名稱 | 說明 |
|---------|------|
| `service.health` | 服務健康狀態更新 |
| `window.ui` | 視窗 UI 事件 |
| `console.output` | Console 輸出 |
| `console.input` | Console 輸入 |
| `process.started` | 程序啟動 |
| `process.stopped` | 程序終止 |
| `notification` | 通知事件 |
| `keyboard` | 鍵盤事件 |
| `language.changed` | 語言變更 |
| `theme.changed` | 主題變更 |
