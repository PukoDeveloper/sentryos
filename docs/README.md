# SentryOS 文件

## 目錄

### 架構
- [架構概覽](architecture/overview.md) — 系統分層、Kernel、開機流程、Runtime 架構（多引擎）、權限系統

### 核心模組
- [RuntimeRegistry](core/runtime-registry.md) — 多引擎管理 + 中央 Host API 註冊表
- [ScriptRuntime](core/script-runtime.md) — QuickJS 沙箱執行引擎
- [WindowManager](core/window-manager.md) — 視窗管理
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

### 開發指南
- [應用程式開發](app-development/guide.md) — 四種應用類型的開發方式
- [插件開發](plugin-development/guide.md) — 插件結構、PluginContext API、Runtime 引擎擴充、範例
- [Host API 參考](app-development/host-api.md) — 沙箱中 OS.* 所有方法
- [Manifest 格式](app-development/manifest.md) — manifest.json 欄位說明

### SDK
- [sentryos-sdk](../packages/sdk/README.md) — TypeScript 型別定義與常數（`sentryos-sdk` npm 套件）

### 資料流
- [資料流](data-flow/data-flow.md)
