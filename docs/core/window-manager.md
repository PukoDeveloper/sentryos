# WindowManager

**檔案**：`src/window/WindowManager.ts`（型別定義：`src/window/types.ts`）

管理視窗的建立、狀態轉換、UI tree 渲染、拖曳、調整大小與焦點。完整的視窗系統文件請參考 [視窗系統](../window-system/window-system.md)。

---

## API

| 方法 | 簽章 | 說明 |
|------|------|------|
| `createWindow()` | `(context, options) → WindowSystemResult<string>` | 建立視窗，回傳 `windowId` |
| `initializeUi()` | `(processAppId, windowId, tree) → WindowSystemResult` | 以 UI tree 重新渲染視窗內容 |
| `updateUi()` | `(processAppId, windowId, nodeId, patch) → WindowSystemResult` | 更新指定 UI 節點屬性 |
| `removeUiNode()` | `(processAppId, windowId, nodeId) → WindowSystemResult` | 移除指定 UI 節點 |
| `appendUiNode()` | `(processAppId, windowId, parentId, nodes) → WindowSystemResult` | 在父節點下新增子節點 |
| `closeWindow()` | `(processAppId, windowId) → WindowSystemResult` | 關閉視窗 |
| `minimizeWindow()` | `(processAppId, windowId) → WindowSystemResult` | 最小化（記錄 `stateBeforeMinimize`） |
| `maximizeWindow()` | `(processAppId, windowId) → WindowSystemResult` | 最大化 |
| `restoreWindow()` | `(processAppId, windowId) → WindowSystemResult` | 還原（若從最小化還原，恢復 `stateBeforeMinimize`） |
| `focusWindow()` | `(processAppId, windowId) → WindowSystemResult` | 聚焦視窗（若已最小化自動還原） |
| `setWindowChangeListener()` | `(listener) → void` | 設定視窗生命週期事件回呼 |
| `getOpenWindowSummaries()` | `() → Array<WindowSummary>` | 取得所有開啟中視窗的摘要（含 icon） |
| `getWindowsByProcess()` | `(processAppId) → string[]` | 取得程序擁有的所有視窗 ID |
| `setMaximizedTaskbarHeight()` | `(height, reflow?) → void` | 設定最大化時工作列高度，reflow 預設 true |
| `destroy()` | `() → void` | 銷毀所有視窗與 DOM 節點 |

---

## 速率限制

每個程序每秒最多建立 **10 個視窗**。超過限制時 `createWindow()` 回傳 `{ success: false, error: 'RateLimitExceeded' }`。

常數定義：
- `WINDOW_RATE_LIMIT = 10`（每秒最大建立數）
- `WINDOW_RATE_WINDOW_MS = 1000`（時間窗口）

---

## WindowInitOptions

```typescript
interface WindowInitOptions {
  title: string;
  width: number;
  height: number;
  x?: number;              // 預設依 windowCounter 遞增偏移
  y?: number;
  useDefaultFrame?: boolean; // 預設 true
  alwaysOnTop?: boolean;   // 預設 false，啟用時 z-index += 500
  resizable?: boolean;     // 預設 true，是否允許調整視窗大小
  style?: WindowStyle;     // background, color, borderRadius, border, boxShadow
}
```

---

## WindowProcessContext

建立視窗時需提供的程序上下文：

```typescript
interface WindowProcessContext {
  processAppId: string;
  appDefId: string;
  appName: string;
  icon?: string;
}
```

---

## 所有權檢查

所有視窗操作（close、minimize、maximize、restore、focus）都會先以 `getOwnedWindow()` 驗證 `processAppId` 是否與視窗所有者匹配，不匹配時回傳 `PermissionDenied`。

---

## 錯誤代碼

| 錯誤 | 說明 |
|------|------|
| `PermissionDenied` | processAppId 與視窗所有者不匹配 |
| `WindowNotFound` | windowId 不存在 |
| `NodeNotFound` | UI 節點 ID 不存在 |
| `Closed` | 視窗已關閉 |
| `InvalidOperation` | 無效操作 |
| `RateLimitExceeded` | 程序在 1 秒內建立視窗超過 10 個，遭到速率限制 |
# WindowManager

**檔案**：`src/window/WindowManager.ts`（型別定義：`src/window/types.ts`）

管理視窗的建立、狀態轉換、UI tree 渲染、拖曳、調整大小與焦點。完整的視窗系統文件請參考 [視窗系統](../window-system/window-system.md)。

---

## API

| 方法 | 簽章 | 說明 |
|------|------|------|
| `createWindow()` | `(context, options) → WindowSystemResult<string>` | 建立視窗，回傳 `windowId` |
| `initializeUi()` | `(processAppId, windowId, tree) → WindowSystemResult` | 以 UI tree 重新渲染視窗內容 |
| `updateUi()` | `(processAppId, windowId, nodeId, patch) → WindowSystemResult` | 更新指定 UI 節點屬性 |
| `removeUiNode()` | `(processAppId, windowId, nodeId) → WindowSystemResult` | 移除指定 UI 節點 |
| `appendUiNode()` | `(processAppId, windowId, parentId, nodes) → WindowSystemResult` | 在父節點下新增子節點 |
| `closeWindow()` | `(processAppId, windowId) → WindowSystemResult` | 關閉視窗 |
| `minimizeWindow()` | `(processAppId, windowId) → WindowSystemResult` | 最小化（記錄 `stateBeforeMinimize`） |
| `maximizeWindow()` | `(processAppId, windowId) → WindowSystemResult` | 最大化 |
| `restoreWindow()` | `(processAppId, windowId) → WindowSystemResult` | 還原（若從最小化還原，恢復 `stateBeforeMinimize`） |
| `focusWindow()` | `(processAppId, windowId) → WindowSystemResult` | 聚焦視窗（若已最小化自動還原） |
| `setWindowChangeListener()` | `(listener) → void` | 設定視窗生命週期事件回呼 |
| `getOpenWindowSummaries()` | `() → Array<WindowSummary>` | 取得所有開啟中視窗的摘要（含 icon） |
| `getWindowsByProcess()` | `(processAppId) → string[]` | 取得程序擁有的所有視窗 ID |
| `setMaximizedTaskbarHeight()` | `(height, reflow?) → void` | 設定最大化時工作列高度，reflow 預設 true |
| `destroy()` | `() → void` | 銷毀所有視窗與 DOM 節點 |

---

## 速率限制

每個程序每秒最多建立 **10 個視窗**。超過限制時 `createWindow()` 回傳 `{ success: false, error: 'RateLimitExceeded' }`。

常數定義：
- `WINDOW_RATE_LIMIT = 10`（每秒最大建立數）
- `WINDOW_RATE_WINDOW_MS = 1000`（時間窗口）

---

## WindowInitOptions

```typescript
interface WindowInitOptions {
  title: string;
  width: number;
  height: number;
  x?: number;              // 預設依 windowCounter 遞增偏移
  y?: number;
  useDefaultFrame?: boolean; // 預設 true
  alwaysOnTop?: boolean;   // 預設 false，啟用時 z-index += 500
  resizable?: boolean;     // 預設 true，是否允許調整視窗大小
  style?: WindowStyle;     // background, color, borderRadius, border, boxShadow
}
```

---

## WindowProcessContext

建立視窗時需提供的程序上下文：

```typescript
interface WindowProcessContext {
  processAppId: string;
  appDefId: string;
  appName: string;
  icon?: string;
}
```

---

## 所有權檢查

所有視窗操作（close、minimize、maximize、restore、focus）都會先以 `getOwnedWindow()` 驗證 `processAppId` 是否與視窗所有者匹配，不匹配時回傳 `PermissionDenied`。

---

## 錯誤代碼

| 錯誤 | 說明 |
|------|------|
| `PermissionDenied` | processAppId 與視窗所有者不匹配 |
| `WindowNotFound` | windowId 不存在 |
| `NodeNotFound` | UI 節點 ID 不存在 |
| `Closed` | 視窗已關閉 |
| `InvalidOperation` | 無效操作 |
| `RateLimitExceeded` | 程序在 1 秒內建立視窗超過 10 個，遭到速率限制 |
