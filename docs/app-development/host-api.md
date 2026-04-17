# Host API

**檔案**：`src/api/` 目錄

Host API 是沙箱應用程式透過 `OS` 全域物件存取的系統功能。每個 API 模組由 `runtime.registerApi()` 注入。

---

## API 模組一覽

| 模組 | 命名空間 | 檔案 | 說明 |
|------|---------|------|------|
| UI | `OS.ui` | `uiApi.ts` | 視窗建立、UI tree 操作、ContextMenu |
| System | `OS.system` | `systemApi.ts` | 程序管理（launch、terminate、list、IPC） |
| Storage | `OS.storage` | `storageApi.ts` | 檔案系統操作 |
| Env | `OS.env` | `envApi.ts` | 環境變數讀寫 |
| Console | `OS.console` | `consoleApi.ts` | 主控台輸出/輸入 |
| Shell | `OS.shell` | `shellApi.ts` | 系統指令（列出 app、啟動、視窗列表） |
| Notification | `OS.notification` | `notificationApi.ts` | 通知發送 |
| Monitor | `OS.monitor` | `monitorApi.ts` | 系統監控快照 |
| Settings | `OS.settings` | `settingsApi.ts` | 設定讀寫 |
| Network | `OS.network` | `networkApi.ts` | HTTP 請求 |
| Registry | `OS.registry` | `registryApi.ts` | 系統註冊表 |
| Dialog | `OS.dialog` | `dialogApi.ts` | 對話框 |

---

## UI API（`OS.ui`）

### createWindow(options)

```javascript
const result = OS.ui.createWindow({
  title: 'My App',
  width: 520,
  height: 360,
  x: 100,               // 選填，預設自動排列
  y: 100,               // 選填
  useDefaultFrame: true, // 預設 true
  alwaysOnTop: false,    // 預設 false
  resizable: true,       // 預設 true
  style: {               // 選填
    background: '#1a1f2a',
    color: '#fff',
  }
});
// result: { success: true, data: windowId } 或 { success: false, error: '...' }
```

> **速率限制**：每個程序每秒最多建立 10 個視窗，超過回傳 `RateLimitExceeded`。

### initialize(windowId, tree)

以 UI node 陣列初始化視窗內容。

### update(windowId, nodeId, patch)

更新指定 UI 節點屬性（見 `WindowUiNodePatch`）。

### remove(windowId, nodeId)

移除指定 UI 節點。

### append(windowId, parentId, nodes)

在指定父節點下新增子節點。

### showContextMenu(windowId, controlId, x, y, items)

顯示右鍵選單。

### closeContextMenu()

關閉右鍵選單。

### Node 建構器

透過 `UiComponentRegistry` 動態註冊的節點建構函式。例如：
```javascript
OS.ui.label({ id: 'lbl', text: 'Hello', style: { color: 'red' } })
OS.ui.button({ id: 'btn', text: 'Click' })
OS.ui.panel({ id: 'p', children: [...] })
```

---

## Window 事件

視窗 UI 事件透過 EventBus 以 `window.ui` 事件傳遞：

```typescript
interface WindowUiEvent {
  eventId: string;
  windowId: string;
  processAppId: string;
  type: 'click' | 'change' | 'submit' | 'dblclick' | 'contextmenu' | 'contextmenu-select';
  controlId?: string;
  value?: unknown;     // input/textarea/select 等的值
  x?: number;          // contextmenu 的滑鼠 X 座標
  y?: number;          // contextmenu 的滑鼠 Y 座標
}
```

視窗生命週期事件（created/closed/minimized/maximized/restored/focused/resized）透過 `setWindowChangeListener` 回呼。
