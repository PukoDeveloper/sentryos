# DesktopShell

**檔案**：`src/ui/DesktopShell.ts`

建構整個桌面的 DOM，包含桌布、覆蓋層、視窗宿主、工作列與開始選單。

---

## DOM 層級

```
.desktop-shell
  ├── .desktop-wallpaper
  │     └── .desktop-wallpaper-tint
  ├── .desktop-overlay-layer    # 覆蓋層（可動態註冊）
  ├── .desktop-window-layer     # 視窗宿主（由 WindowManager 管理）
  ├── .desktop-start-panel      # 開始選單（z-index 9000）
  │     ├── .desktop-start-search
  │     └── .desktop-start-list
  └── .desktop-taskbar
        ├── .desktop-taskbar-start   # 「開始」按鈕
        ├── .desktop-taskbar-apps    # 圖示按鈕區
        └── .desktop-taskbar-clock   # 時鐘
```

---

## API

| 方法 | 說明 |
|------|------|
| `mount(applications)` | 建立桌面 DOM，啟動時鐘（不影響開始選單內容） |
| `destroy()` | 銷毀桌面 DOM、清除計時器與狀態 |
| `getWindowHost()` | 回傳 `.desktop-window-layer` 供 WindowManager 使用 |
| `setApplications(apps)` | 更新開始選單的應用清單 |
| `onLaunchRequest(handler)` | 綁定開始選單點擊 → `handler(RegisteredApplication)` |
| `onTaskbarWindowClick(handler)` | 綁定工作列 icon 點擊 → `handler(windowId, processAppId)` |
| `syncOpenWindows(windows)` | 同步開啟中視窗到工作列（接收陣列含 windowId、title、state、processAppId、icon） |
| `registerOverlay(registration)` | 新增覆蓋層元素（`{ id, element, order? }`） |
| `removeOverlay(id)` | 移除覆蓋層元素 |

---

## 工作列（Taskbar）

### 結構

工作列由三部分組成：
1. **開始按鈕**：切換開始選單顯示/隱藏
2. **應用圖示區**：顯示所有開啟中視窗的 icon
3. **時鐘**：每秒更新

### 圖示按鈕

每個開啟中的視窗在工作列顯示為 44×44 的圖示按鈕：

- 若有 `icon`（SVG/PNG）：顯示 `<img>` 元素
- 若圖片載入失敗（`error` 事件）或無 icon：顯示標題首字母大寫
- 點擊觸發 `taskbarWindowClickHandler`，最終呼叫 `WindowManager.focusWindow()`
- `data-window-state` 屬性反映視窗當前狀態

---

## 開始選單（Start Menu）

- **搜尋框**：`input[type=search]`，即時篩選（依名稱與描述）
- **應用列表**：每項顯示 icon + 名稱 + 描述
- **點擊行為**：觸發 `launchHandler(app)` 並關閉面板
- **z-index**：9000（確保在所有視窗之上）

> **注意**：開始選單只顯示由 `setApplications()` 傳入的應用。Bootstrap 階段會過濾掉 `Service` 和 `Library` 類型的應用，因此它們不會出現在開始選單中。

### 開始選單項目

```
.desktop-start-item
  ├── .desktop-start-item-icon   # icon img 或首字母
  └── .desktop-start-item-info
        ├── .desktop-start-item-name
        └── .desktop-start-item-desc  # 描述（若有）
```

---

## 覆蓋層（Overlay）

透過 `registerOverlay()` / `removeOverlay()` 動態管理覆蓋層元素。支援排序（`order` 屬性）。

```typescript
type DesktopOverlayRegistration = {
  id: string;
  element: HTMLElement;
  order?: number;
};
```

---

## 時鐘

- 格式：`HH:mm:ss`
- 每秒更新（`setInterval(1000)`）
- `destroy()` 時自動清除計時器
