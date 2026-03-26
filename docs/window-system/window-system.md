# 視窗系統

**檔案**：`src/core/WindowSystem.ts`

本文件詳述視窗系統的 DOM 結構、狀態機、拖曳機制、Z-Index 設計與生命週期事件。

---

## 視窗 DOM 結構

每個視窗由 `createWindow()` 建立，產生以下 DOM 樹：

```
.window-shell[data-window-id]
  └── .window-frame
        ├── .window-titlebar
        │     ├── .window-title           # 標題文字
        │     └── .window-actions
        │           ├── button (−)         # 最小化
        │           ├── button (□)         # 最大化 / 還原
        │           └── button (×)         # 關閉
        └── .window-content
              └── (由 initializeUi 渲染的 UI tree)
```

### CSS Class 說明

| Class | 說明 |
|-------|------|
| `.window-shell` | 視窗最外層容器，包含定位與尺寸 |
| `.window-frame` | 視窗框架，套用背景/邊框等樣式 |
| `.window-frame-unstyled` | `useDefaultFrame: false` 時使用 |
| `.window-titlebar` | 標題列（拖曳區域） |
| `.window-actions` | 操作按鈕容器 |
| `.window-action-button` | 標題列按鈕（−、□、×） |
| `.window-content` | 視窗內容區域 |
| `.is-focused` | 當前聚焦視窗 |
| `.is-dragging` | 拖曳中 |

---

## 視窗狀態機

```
          ┌─── maximize ────┐
          │                 ▼
  ┌── normal ◄── restore ── maximized
  │       │                 │
  │       ├── minimize ─────┤
  │       │                 │
  │       ▼                 ▼
  │   minimized ───────────────┐
  │       │                    │
  │       └── focus/restore ───┘
  │              │
  │              ▼
  │       (恢復 stateBeforeMinimize)
  │
  └── close → closed (移除 DOM + 清除 bindings)
```

### 狀態說明

| 狀態 | 說明 |
|------|------|
| `normal` | 正常顯示，可拖曳、調整位置 |
| `minimized` | 隱藏（`display: none`），在工作列保留 icon |
| `maximized` | 佔據整個視窗區域（16px 內距，高度扣除工作列） |
| `closed` | 移除 DOM、清除事件綁定 |

### stateBeforeMinimize

最小化時記錄當下狀態（`normal` 或 `maximized`），存放在 `WindowDescriptor.stateBeforeMinimize`。

**還原邏輯**：
- `restoreWindow()`：若 `state === 'minimized'`，恢復 `stateBeforeMinimize`；否則設為 `normal`
- `focusWindow()`：若 `state === 'minimized'`，恢復 `stateBeforeMinimize`，顯示視窗並重新套用佈局

---

## 視窗拖曳

由 `enableDrag(titleBar, descriptor)` 在視窗建立時啟用。

### 實現方式

- 使用 Pointer Events（`pointerdown` / `pointermove` / `pointerup`）
- 呼叫 `setPointerCapture()` 確保游標移出視窗仍能追蹤

### 限制條件

- **最大化時禁止拖曳**：`if (descriptor.state === 'maximized') return`
- **操作按鈕不觸發**：`if (target.closest('.window-actions')) return`

### 拖曳過程

1. `pointerdown`：記錄起始游標位置與視窗位置
2. `pointermove`：計算位移差值，更新 `descriptor.bounds.x/y` 與 DOM `left/top`
3. `pointerup`：釋放 pointer capture，移除 `is-dragging` class

---

## Z-Index 設計

| 元素 | Z-Index 範圍 |
|------|-------------|
| 一般視窗 | 50 起，逐次 +1 |
| alwaysOnTop 視窗 | 一般 z-index + 500 |
| 開始選單面板 | 9000（固定） |

### 聚焦行為

每次 `focusWindow()` 或 `createWindow()` 會呼叫 `nextZIndex()`，將視窗提升到最高層。同時為舊的聚焦視窗移除 `.is-focused` class。

---

## UI Tree 渲染

### 節點型別

```typescript
type WindowUiNode = WindowLabelNode | WindowButtonNode | WindowPanelNode | WindowStackNode;
```

| 類型 | 說明 | 專有屬性 |
|------|------|---------|
| `label` | 文字標籤 | `text: string` |
| `button` | 按鈕（產生 UI 事件） | `text: string`, `eventType?: 'click'` |
| `panel` | 容器 | `children?: WindowUiNode[]` |
| `stack` | 堆疊容器（預設 `flex-direction: column`） | `children?: WindowUiNode[]` |

### 共用屬性

所有節點支援：
- `id?: string` — 用於事件識別（`event.controlId`）
- `style?: WindowUiStyle` — 內聯樣式

### WindowUiStyle

```typescript
interface WindowUiStyle {
  className?: string;
  background?: string;
  color?: string;
  padding?: string;
  gap?: string;
  borderRadius?: string;
  border?: string;
  fontSize?: string;
  justifyContent?: string;
  alignItems?: string;
  flexDirection?: 'row' | 'column';
}
```

### 事件綁定

每個 `button` 節點渲染時會：
1. 分配唯一 `eventId`（格式：`uievt_<timestamp>_<counter>`）
2. 建立 `WindowUiEvent` 綁定記錄
3. 附加 `click` 監聽器，觸發時呼叫 `uiEventHandler(binding)`

---

## WindowLifecycleEvent

視窗生命週期事件透過 `windowChangeListener` 回呼傳遞：

```typescript
interface WindowLifecycleEvent {
  type: 'created' | 'closed' | 'minimized' | 'maximized' | 'restored' | 'focused';
  windowId: string;
  processAppId: string;
  title: string;
  state: WindowState;
}
```

### Bootstrap 層的處理

在 `systemBootstrap.ts` 中：

- **所有事件**：呼叫 `syncOpenWindows()` 更新工作列
- **`closed` 事件**：檢查該程序是否還有其他視窗
  - 若無，呼叫 `destroyProcessRuntime(pid)` + `processManager.terminate()` 清理資源

---

## WindowDescriptor

內部使用的完整視窗描述物件：

```typescript
interface WindowDescriptor {
  id: string;
  processAppId: string;
  appDefId: string;
  title: string;
  state: WindowState;
  bounds: WindowBounds;        // { width, height, x, y }
  useDefaultFrame: boolean;
  alwaysOnTop: boolean;
  zIndex: number;
  root: HTMLDivElement;        // .window-shell
  frame: HTMLDivElement;       // .window-frame
  content: HTMLDivElement;     // .window-content
  titleLabel: HTMLDivElement;  // .window-title
  style?: WindowStyle;
  icon?: string;
  stateBeforeMinimize?: WindowState;
}
```

---

## 視窗佈局（applyWindowLayout）

| 狀態 | 定位規則 |
|------|---------|
| `normal` | `left: bounds.x`, `top: bounds.y`, `width: bounds.width`, `height: bounds.height` |
| `maximized` | `left: 16px`, `top: 16px`, `width: calc(100% - 32px)`, `height: calc(100% - 96px)` |
