# SentryOS 架構說明

完整技術文件請參閱 [`docs/`](./docs/README.md) 資料夾。以下為快速導覽。

---

## 文件索引

| 分類 | 文件 | 說明 |
|------|------|------|
| **架構總覽** | [overview](./docs/architecture/overview.md) | 目錄結構、啟動流程、分層架構、Runtime 架構 |
| **核心元件** | [RuntimeRegistry](./docs/core/runtime-registry.md) | 多引擎管理 + 中央 Host API 註冊 |
| | [ScriptRuntime](./docs/core/script-runtime.md) | QuickJS 沙箱執行引擎 |
| | [PermissionsManager](./docs/core/permissions-manager.md) | 萬用字元權限系統 |
| | [EventBus](./docs/core/event-bus.md) | 權限門控事件匯流排 |
| | [ApplicationManager](./docs/core/application-manager.md) | 應用定義登錄簿 |
| | [ProcessManager](./docs/core/process-manager.md) | 程序生命週期管理 |
| | [WindowManager](./docs/core/window-manager.md) | 視窗管理 |
| | [FileSystem](./docs/core/file-system.md) | 分層虛擬檔案系統 |
| | [ApplicationCatalog](./docs/core/application-catalog.md) | Manifest 載入 |
| | [EnvironmentManager](./docs/core/environment-manager.md) | 環境變數、程式庫快取、命令註冊表 |
| | [NotificationManager](./docs/core/notification-manager.md) | 全域通知系統 |
| | [SystemMonitor](./docs/core/system-monitor.md) | 系統監控追蹤器 |
| | [NetworkManager](./docs/core/network-manager.md) | 網路管理 |
| | [共用型別](./docs/core/types.md) | Result / Error 型別 |
| **視窗系統** | [視窗系統](./docs/window-system/window-system.md) | 狀態機、拖曳、Z-Index、DOM |
| **UI 層** | [DesktopShell](./docs/ui/desktop-shell.md) | 工作列、開始選單、覆蓋層 |
| | [BIOS](./docs/ui/bios.md) | 開機日誌系統 |
| **應用開發** | [Host API](./docs/app-development/host-api.md) | 沙箱內 `OS` 全域 API |
| | [Manifest](./docs/app-development/manifest.md) | manifest.json 規格 |
| | [開發指南](./docs/app-development/guide.md) | 新增 App 步驟與範本 |
| **插件開發** | [插件指南](./docs/plugin-development/guide.md) | 插件結構、PluginContext API、引擎擴充 |
| | [Python Runtime 指南](./docs/plugin-development/python-runtime.md) | Python 3 應用程式開發、Pyodide 沙箱、OS API 使用 |
| **資料流** | [資料流](./docs/data-flow/data-flow.md) | 啟動、事件、關閉、IPC 流程 |
| **型別定義** | [SDK README](./packages/sdk/README.md) | sentryos-sdk 型別定義與常數 |

---

## 快速架構概覽

### Monorepo 結構

| 套件 | 路徑 | 說明 |
|------|------|------|
| **主應用** | `apps/sentryos/` | Vite + TypeScript 主程式 |
| **SDK** | `packages/sdk/` | `sentryos-sdk` — 型別定義與常數，供 App / Plugin 開發使用 |
| **腳手架工具** | `packages/create-sentryos/` | `create-sentryos` — 互動式插件 / 應用程式骨架產生器 |
| **HTML View 插件** | `packages/plugin-html-view/` | `sentryos-plugin-html-view` — 沙箱 HTML 渲染元件 |
| **Code Editor 插件** | `packages/plugin-monaco-editor/` | `sentryos-plugin-code-editor` — Monaco Editor 程式碼編輯器 |
| **Lite Editor 插件** | `packages/plugin-codemirror-editor/` | `sentryos-plugin-lite-editor` — CodeMirror 輕量版編輯器 |
| **Lua Runtime 插件** | `packages/plugin-lua-runtime/` | `sentryos-plugin-lua-runtime` — Lua 5.3 引擎（Fengari） |
| **Python Runtime 插件** | `packages/plugin-python-runtime/` | `sentryos-plugin-python-runtime` — Python 3 引擎（Pyodide） |

### 分層

| 層級 | 路徑 | 職責 |
|------|------|------|
| **Entry** | `apps/sentryos/src/main.ts` | 唯一入口 |
| **Bootstrap** | `apps/sentryos/src/bootstrap/` | 流程編排，不持有業務狀態 |
| **Kernel** | `apps/sentryos/src/kernel/` | 服務容器、共用型別與系統常數 |
| **Runtime** | `apps/sentryos/src/runtime/` | RuntimeRegistry、BaseRuntime、ScriptRuntime（QuickJS）、IRuntime 介面 |
| **API** | `apps/sentryos/src/api/` | Host API 註冊層（16 個模組），橋接核心服務與沙箱 |
| **Core Modules** | `apps/sentryos/src/application/`, `src/process/`, `src/permissions/`, `src/events/`, `src/environment/`, `src/storage/`, `src/monitor/`, `src/notification/`, `src/network/`, `src/dialog/`, `src/registry/`, `src/language/`, `src/console/`, `src/plugin/`, `src/clipboard/`, `src/audio/` | 各自獨立的系統模組 |
| **Window** | `apps/sentryos/src/window/` | 視窗生命週期、UI 元件 Registry |
| **UI** | `apps/sentryos/src/ui/` | 桌面 DOM 組裝與互動 |
| **Public Apps** | `apps/sentryos/public/apps/` | 只透過 Host API 與系統溝通 |

### 啟動摘要

1. `main.ts` → `bootstrapSystem()`
2. 初始化 Core 服務（含 RuntimeRegistry）→ 載入 App Catalog → 掛載 DesktopShell
3. 建立 WindowManager → 註冊通知覆蓋層
4. `registerAllHostApis()` — 將 16 個 API 模組（ui、system、storage、env、console、shell、notification、monitor、settings、network、registry、dialog、install、clipboard、audio 等）注入 RuntimeRegistry
5. 載入插件（拓撲排序後依序 `setup(context)`）
6. 逐一啟動 App（Library → Service → Window/Console）

### 新增 App 速查

1. 建立 `apps/sentryos/public/apps/<name>/manifest.json` + `main.js`
2. 加入 `apps/sentryos/public/app.json`：`"app/<name>"`
3. 詳見 [開發指南](./docs/app-development/guide.md)
