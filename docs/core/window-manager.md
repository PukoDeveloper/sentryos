# WindowManager

**檔案**：`src/window/WindowManager.ts`（型別定義：`src/window/types.ts`）

管理視窗的建立、狀態轉換、UI tree 渲染、拖曳與焦點。完整的視窗系統文件請參考 [視窗系統](../window-system/window-system.md)。

---

## API

| 方法 | 簽章 | 說明 |
|------|------|------|
| `createWindow()` | `(context, options) → WindowSystemResult<string>` | 建立視窗，回傳 `windowId` |
| `initializeUi()` | `(processAppId, windowId, tree) → WindowSystemResult` | 以 UI tree 重新渲染視窗內容 |
| `closeWindow()` | `(processAppId, windowId) → WindowSystemResult` | 關閉視窗 |
| `minimizeWindow()` | `(processAppId, windowId) → WindowSystemResult` | 最小化（記錄 `stateBeforeMinimize`） |
| `maximizeWindow()` | `(processAppId, windowId) → WindowSystemResult` | 最大化 |
| `restoreWindow()` | `(processAppId, windowId) → WindowSystemResult` | 還原（若從最小化還原，恢復 `stateBeforeMinimize`） |
| `focusWindow()` | `(processAppId, windowId) → WindowSystemResult` | 聚焦視窗（若已最小化自動還原） |
| `setWindowChangeListener()` | `(listener) → void` | 設定視窗生命週期事件回呼 |
| `getOpenWindowSummaries()` | `() → Array<WindowSummary>` | 取得所有開啟中視窗的摘要（含 icon） |
| `getWindowsByProcess()` | `(processAppId) → string[]` | 取得程序擁有的所有視窗 ID |

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
| `Closed` | 視窗已關閉 |
| `InvalidOperation` | 無效操作 |
