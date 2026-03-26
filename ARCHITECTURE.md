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
| **Core** | `src/core/` | 可重用的系統能力與資料模型 |
| **UI** | `src/ui/` | 桌面 DOM 組裝與互動 |
| **Public Apps** | `public/apps/` | 只透過 Host API 與系統溝通 |

### 啟動摘要

1. `main.ts` → `bootstrapSystem()`
2. 初始化 Core 服務 → 載入 App Catalog → 掛載 DesktopShell
3. 建立 WindowManager → 註冊 `ui` Host API → 綁定事件
4. 逐一啟動 App（fetch `main.js` → ScriptRuntime.execute）

### 新增 App 速查

1. 建立 `public/apps/<name>/manifest.json` + `main.js`
2. 加入 `public/app.json`：`"app/<name>"`
3. 詳見 [開發指南](./docs/app-development/guide.md)
