# DesktopShell

**檔案**：`src/ui/DesktopShell.ts`

桌面環境的 UI 層，包含工作列（taskbar）、開始選單（start menu）、桌布、視窗層、覆蓋層以及時鐘。

---

## API

| 方法 | 簽章 | 說明 |
|------|------|------|
| `mount()` | `(applications) → boolean` | 掛載桌面 DOM |
| `getWindowHost()` | `() → HTMLDivElement \| null` | 取得視窗層容器 |
| `setApplications()` | `(apps: RegisteredApplication[]) → void` | 設定應用程式列表 |
| `onLaunchRequest()` | `(handler) → void` | 註冊應用程式啟動回呼 |
| `onTaskbarWindowClick()` | `(handler) → void` | 註冊工作列視窗點擊回呼 |
| `syncOpenWindows()` | `(windows: WindowInfo[]) → void` | 同步開啟中的視窗到工作列 |
| `registerOverlay()` | `(registration) → void` | 註冊覆蓋層元素 |
| `removeOverlay()` | `(id) → void` | 移除覆蓋層 |
| `applyTheme()` | `(theme: ThemeSettings) → void` | 套用主題設定 |
| `getTheme()` | `() → ThemeSettings` | 取得當前主題 |
| `setTaskbarMode()` | `(mode: TaskbarMode) → void` | 切換工作列模式 |
| `getTaskbarMode()` | `() → TaskbarMode` | 取得當前工作列模式 |
| `onTaskbarModeChange()` | `(handler) → void` | 註冊工作列模式變更回呼 |
| `setLocale()` | `(locale, translator?) → void` | 設定語系與翻譯函式 |
| `destroy()` | `() → void` | 銷毀桌面 DOM 與所有計時器 |

---

## TaskbarMode

```typescript
type TaskbarMode = 'docked' | 'fullwidth' | 'floating-compact';
```

- **docked**：預設模式，固定在底部
- **fullwidth**：全寬工作列
- **floating-compact**：浮動精簡模式，顯示可拖曳的觸發按鈕，點擊展開/收合

---

## ThemeSettings

```typescript
type ThemeSettings = {
  wallpaper?: string;              // 桌布 CSS background
  tint?: string;                   // 桌布覆蓋色調
  accentPrimary?: string;          // 開始按鈕漸層起始色
  accentSecondary?: string;        // 開始按鈕漸層結束色
  taskbarOpacity?: number;         // 工作列不透明度 (0-1)
  taskbarMode?: TaskbarMode;
  startMenuWidth?: number;         // 開始選單寬度 (280-640)
  startMenuHeight?: number;        // 開始選單高度 (300-800)
  startMenuGroupByPackage?: boolean;
};
```

---

## 開始選單

開始選單包含兩個分頁：

### Folders 分頁
- 資料夾系統：可建立/重新命名/刪除資料夾
- 支援將應用程式拖放到資料夾中
- 釘選應用程式區域（pinnedAppIds）
- 資料夾與釘選資料儲存於 `localStorage`

### Search 分頁
- 搜尋輸入框過濾應用程式
- 當 `startMenuGroupByPackage` 啟用時按套件分組顯示
- 隱藏應用程式（`hidden: true`）不顯示

---

## 工作列

- 開啟中的視窗按 `appDefId` 分組顯示
- 多視窗時點擊顯示分組彈出選單
- 使用 fingerprint 比對避免不必要的重繪

---

## 語系支援

```typescript
setLocale(locale: string, translator?: (key: string) => string): void
```

透過外部注入的翻譯函式（`translator`）支援 UI 文字國際化。翻譯 key 包括：`tab.folders`、`tab.search`、`btn.addFolder`、`search.placeholder` 等。

---

## DOM 結構

```
.desktop-shell
├── .desktop-wallpaper
│   └── .desktop-wallpaper-tint
├── .desktop-overlay-layer
├── .desktop-window-layer
├── .desktop-start-panel
│   ├── .desktop-start-tabs
│   ├── .desktop-start-pane-folders
│   └── .desktop-start-pane-search
├── .desktop-taskbar
│   ├── .desktop-taskbar-start
│   ├── .desktop-taskbar-apps
│   └── .desktop-taskbar-clock
└── .desktop-taskbar-trigger (floating-compact mode)
```
