# SentryOS 技術文件

歡迎閱讀 SentryOS 的技術文件。本文件庫涵蓋系統架構、核心元件 API、視窗系統、應用程式開發指南等內容。

---

## 文件索引

### 架構總覽

| 文件 | 說明 |
|------|------|
| [架構總覽](./architecture/overview.md) | 目錄結構、啟動流程、分層架構與責任邊界 |

### 核心元件

| 文件 | 說明 |
|------|------|
| [PermissionsManager](./core/permissions-manager.md) | 萬用字元權限系統 |
| [EventBus](./core/event-bus.md) | 權限門控事件匯流排 |
| [ApplicationManager](./core/application-manager.md) | 應用程式定義登錄簿 |
| [ProcessManager](./core/process-manager.md) | 程序生命週期管理 |
| [ScriptRuntime](./core/script-runtime.md) | QuickJS 沙箱執行環境 & Host API 注入 |
| [WindowManager](./core/window-manager.md) | 視窗管理、UI tree 渲染、拖曳與焦點 |
| [EnvironmentManager](./core/environment-manager.md) | 環境變數、程式庫快取、命令註冊表 |
| [WebFileSystemAdapter](./core/file-system.md) | 虛擬檔案系統（分層容量管理） |
| [ApplicationCatalog](./core/application-catalog.md) | App Manifest 載入與解析（Package / Legacy 格式） || [NotificationManager](./core/notification-manager.md) | 全域通知系統（佇列、DOM 渲染、自動消失） |
| [NetworkManager](./core/network-manager.md) | 網路子系統（抽象介面 + 允許清單實作） |
| [SystemMonitor](./core/system-monitor.md) | 系統監控追蹤器（事件/API/權限/程序統計） || [共用型別](./core/types.md) | Result、EventBusResult、ProcessResult 等 |

### 視窗系統

| 文件 | 說明 |
|------|------|
| [視窗系統](./window-system/window-system.md) | DOM 結構、狀態機、拖曳、Z-Index、生命週期事件 |

### UI 層

| 文件 | 說明 |
|------|------|
| [DesktopShell](./ui/desktop-shell.md) | 桌面外殼（工作列、開始選單、覆蓋層） |
| [BIOS](./ui/bios.md) | 開機日誌系統 |

### 應用程式開發

| 文件 | 說明 |
|------|------|
| [Host API 參考](./app-development/host-api.md) | 沙箱內可用的全域 API（processApi、eventApi、ipcApi、ui、envApi、shellApi、consoleApi、notificationApi、monitorApi、networkApi） |
| [Manifest 格式](./app-development/manifest.md) | manifest.json 欄位規格（Package / Legacy 格式） |
| [開發指南](./app-development/guide.md) | 新增應用程式步驟、範本（Window / Service / Console / Library）、設計模式 |

### 資料流

| 文件 | 說明 |
|------|------|
| [資料流](./data-flow/data-flow.md) | 應用啟動、UI 事件、視窗關閉、工作列互動流程 |
