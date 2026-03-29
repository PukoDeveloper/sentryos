# SentryOS 架構說明

完整技術文件請參閱 [`docs/`](./docs/README.md) 資料夾。以下為快速導覽。

---

## 文件索引

| 分類 | 文件 | 說明 |
|------|------|------|
| **架構總覽** | [overview](./docs/architecture/overview.md) | 目錄結構、啟動流程、分層架構 |
| **核心元件** | [PermissionsManager](./docs/core/permissions-manager.md) | 萬用字元權限系統 |
| | [EventBus](./docs/core/event-bus.md) | 權限門控事件匯流排 |
| | [ApplicationManager](./docs/core/application-manager.md) | 應用定義登錄簿 |
| | [ProcessManager](./docs/core/process-manager.md) | 程序生命週期管理 |
| | [ScriptRuntime](./docs/core/script-runtime.md) | QuickJS 沙箱 & Host API |
| | [WindowManager](./docs/core/window-manager.md) | 視窗管理 |
| | [WebFileSystemAdapter](./docs/core/file-system.md) | 虛擬檔案系統 |
| | [ApplicationCatalog](./docs/core/application-catalog.md) | Manifest 載入 |
| | [EnvironmentManager](./docs/core/environment-manager.md) | 環境變數、程式庫快取、命令註冊表 |
| | [NotificationManager](./docs/core/notification-manager.md) | 全域通知系統 |
| | [SystemMonitor](./docs/core/system-monitor.md) | 系統監控追蹤器 |
| | [共用型別](./docs/core/types.md) | Result / Error 型別 |
| **視窗系統** | [視窗系統](./docs/window-system/window-system.md) | 狀態機、拖曳、Z-Index、DOM |
| **UI 層** | [DesktopShell](./docs/ui/desktop-shell.md) | 工作列、開始選單、覆蓋層 |
| | [BIOS](./docs/ui/bios.md) | 開機日誌系統 |
| **應用開發** | [Host API](./docs/app-development/host-api.md) | 沙箱內全域 API |
| | [Manifest](./docs/app-development/manifest.md) | manifest.json 規格 |
| | [開發指南](./docs/app-development/guide.md) | 新增 App 步驟與範本 |
| **資料流** | [資料流](./docs/data-flow/data-flow.md) | 啟動、事件、關閉、IPC 流程 |

---

## 快速架構概覽

### 分層

| 層級 | 路徑 | 職責 |
|------|------|------|
| **Entry** | `src/main.ts` | 唯一入口 |
| **Bootstrap** | `src/bootstrap/` | 流程編排，不持有業務狀態 |
| **Kernel** | `src/kernel/` | 服務容器、共用型別與系統常數 |
| **API** | `src/api/` | Host API 註冊層，橋接核心服務與沙箱 |
| **Core Modules** | `src/application/`, `src/process/`, `src/runtime/`, `src/permissions/`, `src/events/`, `src/environment/`, `src/storage/`, `src/monitor/`, `src/notification/` | 各自獨立的系統模組 |
| **Window** | `src/window/` | 視窗生命週期、UI 渲染 |
| **UI** | `src/ui/` | 桌面 DOM 組裝與互動 |
| **Public Apps** | `public/apps/` | 只透過 Host API 與系統溝通 |

### 啟動摘要

1. `main.ts` → `bootstrapSystem()`
2. 初始化 Core 服務 → 載入 App Catalog → 掛載 DesktopShell
3. 建立 WindowManager → 註冊通知覆蓋層
4. `registerAllHostApis()` — 註冊 8 個 API 模組（ui、system、storage、env、console、shell、notification、monitor）
5. 逐一啟動 App（Library → Service → Window/Console）

### 新增 App 速查

1. 建立 `public/apps/<name>/manifest.json` + `main.js`
2. 加入 `public/app.json`：`"app/<name>"`
3. 詳見 [開發指南](./docs/app-development/guide.md)
