# SentryOS 文件

## 目錄

### 架構
- [架構概覽](architecture/overview.md)

### 核心模組
- [WindowManager](core/window-manager.md) — 視窗管理
- [ScriptRuntime](core/script-runtime.md) — QuickJS 沙箱執行引擎
- [PermissionsManager](core/permissions-manager.md) — 權限管理
- [ApplicationCatalog](core/application-catalog.md) — 應用程式清單載入
- [ApplicationManager](core/application-manager.md) — 應用程式登錄
- [FileSystem](core/file-system.md) — 分層檔案系統
- [EventBus](core/event-bus.md) — 事件匯流排
- [NotificationManager](core/notification-manager.md) — 通知系統
- [SystemMonitor](core/system-monitor.md) — 系統監控
- [ProcessManager](core/process-manager.md) — 程序管理
- [NetworkManager](core/network-manager.md) — 網路管理
- [EnvironmentManager](core/environment-manager.md) — 環境變數管理
- [共用型別](core/types.md) — Result / Error 型別

### UI
- [BIOS](ui/bios.md) — 啟動畫面與錯誤畫面
- [DesktopShell](ui/desktop-shell.md) — 桌面環境

### 視窗系統
- [視窗系統型別](window-system/window-system.md)

### 應用程式開發
- [開發指南](app-development/guide.md)
- [Host API](app-development/host-api.md)
- [Manifest 格式](app-development/manifest.md)

### 型別定義
- [types/](types/README.md) — Plugin SDK 型別定義檔（`sentryos-plugin.d.ts`）

### 資料流
- [資料流](data-flow/data-flow.md)
