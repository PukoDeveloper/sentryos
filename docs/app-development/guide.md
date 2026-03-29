# 應用程式開發指南

本文件說明如何建立新的 SentryOS 應用程式。

---

## 應用類型總覽

| 類型 | 說明 | 視窗 | 預設 autoStart |
|------|------|------|---------------|
| `Window` | GUI 應用，透過 `ui` API 建立視窗 | 是 | 否 |
| `Service` | 背景服務，無視窗 | 否 | 是 |
| `Console` | 文字互動式應用，系統自動建立 Console 視窗 | 自動 | 否 |
| `Library` | 程式庫，開機時執行 init → 快取程式碼 → 程序結束 | 否 | 是 |

---

## 建立步驟

1. 建立目錄 `public/apps/<package-name>/`
2. 建立 [manifest.json](./manifest.md)（支援套件或單一格式）
3. 建立入口腳本（`main.js` 或自訂檔名）
4. （選用）建立 `icon.svg` 圖示
5. 在 `public/app.json` 新增條目：`"app/<package-name>"`

---

## Window 類應用範本

```javascript
// 1. 建立視窗
var win = ui.createWindow({
  title: 'My App',
  width: 520,
  height: 400,
  style: {
    background: 'rgba(10, 14, 20, 0.96)',
    color: '#ecf4ff',
    border: '1px solid rgba(118, 185, 255, 0.26)',
  }
});

// 2. 應用狀態
var count = 0;

// 3. 渲染函式（data-driven re-render）
function render() {
  if (!win.success) return;
  ui.initialize(win.data, [
    ui.stack([
      ui.label('Count: ' + count),
      ui.button('+1', {}, 'increment'),
    ], { padding: '16px', gap: '8px' })
  ]);
}

// 4. 初始渲染
render();

// 5. 事件處理
globalThis.onWindowEvent = function(event) {
  if (event.controlId === 'increment') {
    count++;
    render();
  }
};
```

---

## Service 類應用範本

Service 應用沒有視窗，在背景執行。

```javascript
// main.js
serviceApi.publishHealth({ status: 'ok', uptime: 0 });

// 可使用 eventApi 與其他程式溝通
eventApi.emit('my-service.started', { pid: processApi.pid });
```

---

## Console 類應用範本

Console 應用由系統自動建立控制台視窗，提供文字輸入/輸出介面。

```javascript
// 歡迎訊息
consoleApi.writeLine('Welcome to My Console App');
consoleApi.writeLine('Type "help" for available commands.');

// 接收使用者輸入
globalThis.onConsoleInput = function(line) {
  var parts = line.trim().split(' ');
  var cmd = parts[0];
  var args = parts.slice(1);

  if (cmd === 'help') {
    consoleApi.writeLine('Available commands: help, echo, clear, exit');
  } else if (cmd === 'echo') {
    consoleApi.writeLine(args.join(' '));
  } else if (cmd === 'clear') {
    consoleApi.clear();
  } else if (cmd === 'exit') {
    processApi.terminateSelf();
  } else {
    consoleApi.writeLine('Unknown command: ' + cmd);
  }
};
```

### Console API 方法

- `consoleApi.writeLine(text)` — 輸出一行（附換行）
- `consoleApi.write(text)` — 附加文字到最後一行（不換行）
- `consoleApi.clear()` — 清除螢幕

### Console + Shell 命令分派

Console 應用可透過 `shellApi` 實現進階系統指令：

```javascript
globalThis.onConsoleInput = function(line) {
  var parts = line.trim().split(' ');
  var cmd = parts[0];
  var args = parts.slice(1);

  // 內建命令
  if (cmd === 'ps') {
    var result = shellApi.listProcesses();
    if (result.success) {
      result.data.forEach(function(p) {
        consoleApi.writeLine('PID ' + p.pid + ' | ' + p.type + ' | ' + p.status);
      });
    }
    return;
  }

  // 自動分派到已註冊命令
  var resolved = shellApi.resolveCommand(cmd);
  if (resolved.success) {
    envApi.loadLibrary(resolved.data.libraryId);
    if (globalThis.__commands && globalThis.__commands[cmd]) {
      consoleApi.writeLine(globalThis.__commands[cmd](args));
    }
    return;
  }

  consoleApi.writeLine('Unknown command: ' + cmd);
};
```

---

## Library 類應用範本

Library 不面向使用者，開機時自動載入（init → 快取 → 程序結束）。其他程式可透過 `envApi.loadLibrary()` 載入其程式碼。

```javascript
// math.js — Library 入口

// 匯出工具物件到全域
globalThis.MathUtils = {
  factorial: function(n) {
    if (n <= 1) return 1;
    return n * MathUtils.factorial(n - 1);
  },
  fibonacci: function(n) {
    if (n <= 0) return 0;
    if (n === 1) return 1;
    var a = 0, b = 1;
    for (var i = 2; i <= n; i++) {
      var c = a + b; a = b; b = c;
    }
    return b;
  }
};

// 註冊 CLI 命令（可選）
envApi.registerCommand('factorial', '計算階乘', 'factorial <n>');
envApi.registerCommand('fib', '計算費氏數列', 'fib <n>');

// 提供命令處理函式
globalThis.__commands = globalThis.__commands || {};
globalThis.__commands['factorial'] = function(args) {
  return String(MathUtils.factorial(parseInt(args[0], 10)));
};
globalThis.__commands['fib'] = function(args) {
  return String(MathUtils.fibonacci(parseInt(args[0], 10)));
};
```

### Library 生命週期

1. 系統啟動時，所有 Library 類應用優先執行
2. `EnvironmentManager.registerLibrary()` 快取程式碼
3. 執行 init（Library 的 `main.js`）— 此時可註冊命令、匯出全域物件
4. init 完成後，程序自動銷毀（Library 不持續運行）
5. 其他程式透過 `envApi.loadLibrary('packageName/appName')` 載入

---

## 設計模式

### Data-Driven Re-render

所有 UI 以純資料節點描述，每次狀態變更時呼叫 `render()` 重新建立完整 UI tree 並交由 `ui.initialize()` 替換 DOM。

```
  狀態變更 → render() → ui.initialize(windowId, newTree) → DOM 更新
```

**優點**：
- UI 永遠反映最新狀態
- 無需手動操作 DOM
- 邏輯簡單可預測

**注意**：每次 `ui.initialize()` 都會完全替換 `.window-content` 下的所有子元素。

### 事件 ID 匹配

在 `ui.button(text, style, id)` 的第三個參數給定 `id`，在 `onWindowEvent` 中以 `event.controlId` 比對。

```javascript
// 建立按鈕時指定 id
ui.button('Submit', {}, 'submit-btn')

// 事件處理時比對
globalThis.onWindowEvent = function(event) {
  if (event.controlId === 'submit-btn') {
    // 處理提交
  }
};
```

### 命令註冊模式（Library + Console）

Library 在 init 時註冊命令名稱與處理函式，Console 透過 `shellApi.resolveCommand()` 查詢 → `envApi.loadLibrary()` 載入 → `__commands[cmd](args)` 執行：

```
Library init
  → envApi.registerCommand('cmd', ...)
  → globalThis.__commands['cmd'] = handler

Console unknown input
  → shellApi.resolveCommand('cmd')
  → envApi.loadLibrary(libraryId)
  → __commands['cmd'](args)
  → consoleApi.writeLine(result)
```

---

## 常用權限

| 權限 | 用途 |
|------|------|
| `event.subscribe.window.ui` | 訂閱視窗 UI 事件 |
| `event.emit.window.ui` | 發送視窗 UI 事件 |
| `event.subscribe.console.output` | 訂閱 console 輸出 |
| `console.write` | Console 輸出（writeLine/write/clear） |
| `console.read` | Console 輸入 |
| `env.read` | 讀取環境變數 |
| `env.write` | 寫入環境變數 |
| `env.autostart` | 管理自動啟動 |
| `env.library.load` | 載入程式庫 |
| `process.list` | 列出所有程序 |
| `process.terminate` | 終止其他程序 |
| `shell.apps` | 列出已註冊應用 |
| `shell.launch` | 啟動應用 |
| `shell.windows` | 列出開啟中視窗 |
| `shell.sysinfo` | 取得系統資訊 |
| `storage.usage` | 查詢儲存用量 |
| `notification.send` | 發送通知 |
| `monitor.read` | 讀取系統監控數據 |
| `service.publish-health` | 發送健康狀態 |
| `window.create` | 建立視窗 |
| `process.ipc.send-parent` | IPC 傳訊給父程序 |
| `process.ipc.send-child` | IPC 傳訊給子程序 |
| `file.read.<tier>` | 讀取指定 tier 的儲存資料 |
| `file.write.<tier>` | 寫入指定 tier 的儲存資料 |

---

## 進階：多按鈕互動

```javascript
var win = ui.createWindow({ title: 'Multi-Button Demo', width: 400, height: 300 });
var log = [];

function render() {
  if (!win.success) return;
  ui.initialize(win.data, [
    ui.stack([
      ui.label(log.join('\n') || '(no actions yet)'),
      ui.stack([
        ui.button('Action A', {}, 'action-a'),
        ui.button('Action B', {}, 'action-b'),
        ui.button('Clear', {}, 'clear'),
      ], { flexDirection: 'row', gap: '8px' })
    ], { padding: '16px', gap: '12px' })
  ]);
}

render();

globalThis.onWindowEvent = function(event) {
  if (event.controlId === 'action-a') {
    log.push('Executed Action A');
  } else if (event.controlId === 'action-b') {
    log.push('Executed Action B');
  } else if (event.controlId === 'clear') {
    log = [];
  }
  render();
};
```

---

## 進階：父子程序 IPC

```javascript
// parent main.js
var child = processApi.spawnChild(undefined, 'Service');
if (child.success) {
  ipcApi.sendToChild(child.pid, { command: 'start' });
}

// 讀取子程序回覆
var messages = ipcApi.receive();
messages.forEach(function(msg) {
  if (msg.type === 'ipc') {
    // 處理回覆
  }
});
```
