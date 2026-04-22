# SentryOS

一個在瀏覽器中運行的微型作業系統，使用 TypeScript + Vite 構建，透過 QuickJS WASM 沙箱安全執行第三方應用程式。

![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)
![Vite](https://img.shields.io/badge/Vite-7.x-646CFF)
![QuickJS](https://img.shields.io/badge/QuickJS-WASM-orange)
![Python](https://img.shields.io/badge/Python-Pyodide-3776AB)
![License](https://img.shields.io/badge/license-MIT-green)

## AI 生成聲明

> 本專案的程式碼與文件大量使用 AI 輔助生成（GitHub Copilot）。所有內容均經過人工審查，但可能仍存在錯誤或不完善之處。使用前請自行評估。

## 特色

- **QuickJS WASM 沙箱** — 每個應用程式在獨立的 QuickJS 執行環境中運行，與主機完全隔離
- **多引擎支援** — 透過插件系統可擴充 Lua（Fengari）、**Python（Pyodide）** 等其他執行引擎，共用相同 Host API
- **細粒度權限系統** — 支援萬用字元匹配的階層式權限控制，應用程式只能存取被授權的 API
- **視窗管理系統** — 支援拖曳、縮放、最大化/最小化、Z-Index 管理、8 方向調整大小
- **程序生命週期** — 完整的程序管理（啟動、暫停、恢復、終止）與父子程序關係
- **事件匯流排** — 權限門控的事件訂閱/發射機制，支援跨程序通訊 (IPC)
- **虛擬檔案系統** — 分層儲存空間（系統/應用/使用者/快取），含容量限制
- **桌面環境** — 工作列、開始選單、通知系統、開機動畫
- **系統監控** — 內建 SystemMonitor 追蹤事件、API 呼叫、權限檢查與效能數據
- **剪貼簿與音訊** — 跨應用剪貼簿 API 與系統音訊播放支援
- **應用程式類型** — 支援 Window、Console、Service、Library 四種應用類型
- **插件系統** — 支援第三方插件擴充 Runtime 引擎、Host API、UI 元件

## 快速開始

### 環境需求

- Node.js 18+
- pnpm 10+（`npm install -g pnpm`）

### 安裝與開發

```bash
# 安裝依賴（Monorepo 根目錄）
pnpm install

# 啟動開發伺服器
pnpm dev

# 建置（先建置 SDK，再建置主應用）
pnpm build

# 只建置 SDK
pnpm build:sdk

# 預覽建置結果
pnpm preview
```

### 快速建立插件或應用程式

```bash
# 互動模式（詢問你要建立 Plugin 還是 App）
pnpm scaffold

# 直接建立 Plugin（TypeScript 套件）
pnpm scaffold:plugin

# 直接建立 App（JS / Lua / Python）
pnpm scaffold:app
```

詳見 [sentryos-create README](./packages/sentryos-create/README.md)。

## Monorepo 結構

本專案採用 **pnpm workspace** 管理，分為兩個套件：

```
sentryos/                          # Monorepo 根目錄
├── package.json                   # 根 package（scripts 入口）
├── pnpm-workspace.yaml            # pnpm workspace 設定
├── tsconfig.base.json             # 共用 TypeScript 設定
├── apps/
│   └── sentryos/                  # 主應用程式
│       ├── index.html
│       ├── package.json
│       ├── vite.config.ts
│       ├── src/                   # 核心原始碼（見下方詳細結構）
│       └── public/                # 靜態資源與內建應用
│           ├── app.json           # 應用程式目錄
│           ├── plugins.json       # 插件目錄
│           ├── apps/              # 內建應用程式
│           │   ├── system/        # 系統應用（terminal、task-manager 等）
│           │   ├── developer-tools/
│           │   ├── text-manager/
│           │   ├── utilities/
│           │   ├── pcode/         # 程式碼編輯器
│           │   ├── image-viewer/
│           │   └── stdlib/        # 標準函式庫
│           └── plugins/           # 插件（lua-runtime、python-runtime、monaco-editor 等）
└── packages/
    ├── sdk/                       # sentryos-sdk 套件
    │   ├── package.json
    │   ├── src/                   # SDK 型別定義與常數
    │   └── dist/                  # 建置產物（TypeScript declarations）
    ├── plugin-lua-runtime/        # Lua 5.3 runtime 插件（Fengari）
    │   ├── package.json
    │   └── src/index.ts
    └── plugin-python-runtime/     # Python 3 runtime 插件（Pyodide）
        ├── package.json
        └── src/index.ts
```

### apps/sentryos/src/ 詳細結構

```
src/
├── main.ts                    # 進入點
├── api/                       # Host API 模組（16 個，註冊到 RuntimeRegistry）
│   ├── index.ts               # registerAllHostApis
│   ├── uiApi.ts               # OS.ui.*
│   ├── systemApi.ts           # OS.system.*
│   ├── storageApi.ts          # OS.storage.*
│   ├── envApi.ts              # OS.env.*
│   ├── consoleApi.ts          # OS.console.*
│   ├── shellApi.ts            # OS.shell.*
│   ├── notificationApi.ts     # OS.notification.*
│   ├── monitorApi.ts          # OS.monitor.*
│   ├── settingsApi.ts         # OS.settings.*
│   ├── networkApi.ts          # OS.network.*
│   ├── registryApi.ts         # OS.registry.*
│   ├── dialogApi.ts           # OS.dialog.*
│   ├── installApi.ts          # OS.install.*
│   ├── clipboardApi.ts        # OS.clipboard.*
│   └── audioApi.ts            # OS.audio.*
├── application/               # 應用程式管理
│   ├── AppInstaller.ts        # 遠端安裝對話框
│   ├── ApplicationCatalog.ts  # Manifest 解析
│   ├── ApplicationLauncher.ts # 應用啟動/終止邏輯
│   └── ApplicationManager.ts  # 應用定義登錄簿
├── audio/
│   └── AudioManager.ts        # 系統音訊管理
├── auth/
│   └── AuthProvider.ts        # 使用者驗證
├── bootstrap/
│   └── systemBootstrap.ts     # 開機流程編排
├── clipboard/
│   └── ClipboardManager.ts    # 跨應用剪貼簿
├── console/
│   ├── AnsiParser.ts          # ANSI 色碼解析
│   └── KernelConsole.ts       # 核心主控台
├── dialog/
│   └── DialogManager.ts       # 對話框管理
├── environment/
│   └── EnvironmentManager.ts  # 環境變數、程式庫、命令
├── events/
│   └── EventBus.ts            # 權限門控事件匯流排
├── kernel/
│   ├── Kernel.ts              # Service Locator
│   ├── constants.ts           # 常數定義
│   ├── permissions.ts         # 權限/事件常數
│   └── types.ts               # 共用型別
├── language/
│   ├── LanguageManager.ts     # 多語言 i18n 管理
│   └── systemPacks.ts         # 內建語言包
├── monitor/
│   └── SystemMonitor.ts       # 系統監控追蹤器
├── network/
│   ├── AllowlistNetworkManager.ts
│   └── NetworkAdapter.ts      # 網路介面抽象
├── notification/
│   ├── NotificationManager.ts # 全域通知系統
│   └── SystemAlert.ts         # 系統警告彈窗
├── permissions/
│   └── PermissionsManager.ts  # 萬用字元權限管理
├── plugin/
│   ├── PluginContext.ts        # 插件執行上下文
│   └── PluginManager.ts       # 插件載入/卸載
├── process/
│   ├── Process.ts             # 程序資料模型
│   └── ProcessManager.ts      # 程序生命週期管理
├── registry/
│   └── SystemRegistry.ts      # 角色/檔案類型登錄表
├── runtime/
│   ├── AdapterRuntime.ts      # 插件引擎橋接適配器
│   ├── BaseRuntime.ts         # 引擎無關的共用邏輯（IPC、事件、API 建構）
│   ├── IRuntime.ts            # Runtime 介面定義
│   ├── QuickJsInit.ts         # QuickJS WASM 初始化
│   ├── RuntimeRegistry.ts     # 多引擎管理 + 中央 Host API 註冊表
│   ├── ScriptRuntime.ts       # QuickJS 沙箱執行引擎
│   └── types.ts               # Runtime 型別
├── storage/
│   └── FileSystem.ts          # 分層虛擬檔案系統（localStorage）
├── ui/
│   ├── Bios.ts                # 開機/錯誤畫面
│   └── DesktopShell.ts        # 工作列、開始選單、覆蓋層
└── window/
    ├── WindowManager.ts        # 視窗管理、拖曳、焦點
    ├── UiComponentRegistry.ts  # UI 元件 Registry
    ├── builtinComponents.ts    # 內建 UI 元件
    └── types.ts                # 視窗型別定義
```

## 架構概覽

```
┌─────────────────────────────────────────────────┐
│                     UI 層                        │
│     Bios · DesktopShell · WindowManager          │
├─────────────────────────────────────────────────┤
│                  Host API 層                      │
│  ui · system · storage · env · console · shell   │
│  notification · monitor · settings · network     │
│  registry · dialog · install · clipboard · audio │
│  ＊ 統一註冊至 RuntimeRegistry                    │
├─────────────────────────────────────────────────┤
│                  Runtime 層                       │
│  RuntimeRegistry（多引擎管理 + 中央 API 註冊）    │
│  ├── ScriptRuntime（QuickJS — 內建）              │
│  └── LuaRuntime（Wasmoon — 插件提供）             │
│  BaseRuntime（IPC · 事件 · API 表面建構）         │
├─────────────────────────────────────────────────┤
│                  核心服務層                        │
│  Kernel · PermissionsManager · EventBus          │
│  ProcessManager · ApplicationManager             │
│  ApplicationLauncher · FileSystem                │
│  EnvironmentManager · NotificationManager        │
│  SystemMonitor · NetworkAdapter · SystemRegistry │
│  DialogManager · AppInstaller · PluginManager    │
│  LanguageManager · ClipboardManager · AudioManager│
├─────────────────────────────────────────────────┤
│                  基礎設施層                        │
│  QuickJS-emscripten（WASM）  localStorage         │
│  fetch API（網路）  DOM（渲染）                   │
└─────────────────────────────────────────────────┘
```

應用程式透過 Host API（`OS.process`、`OS.event`、`OS.ui`、`OS.storage` 等）與系統互動，所有呼叫均受權限系統保護。

## 開發應用程式

1. 建立 `apps/sentryos/public/apps/<name>/` 目錄
2. 新增 `manifest.json`：
   ```json
   {
     "name": "我的應用",
     "version": "1.0.0",
     "apps": [{
       "id": "my-app",
       "name": "我的應用",
       "main": "main.js",
       "type": "Window",
       "permissions": ["window.create", "event.subscribe.window.ui", "event.emit.window.ui"]
     }]
   }
   ```
3. 新增 `main.js`：
   ```javascript
   var win = OS.ui.createWindow({ title: '我的應用', width: 400, height: 300 });
   OS.ui.initialize(win, [
     OS.ui.label('lbl', 'Hello, SentryOS!')
   ]);
   ```
4. 在 `apps/sentryos/public/app.json` 中加入 `"app/<name>"`

詳細說明請參閱 [開發指南](./docs/app-development/guide.md)。

## 使用 Python 開發應用程式

安裝 `python-runtime` 插件後，可在 manifest 中指定 `"engine": "python"` 來使用 Python 3：

1. 在 `plugins.json` 中加入插件路徑
2. 在 `manifest.json` 中設定 `"engine": "python"`：
   ```json
   {
     "name": "我的 Python 應用",
     "version": "1.0.0",
     "apps": [{
       "id": "my-python-app",
       "name": "我的 Python 應用",
       "main": "main.py",
       "engine": "python",
       "type": "Window",
       "permissions": ["window.create"]
     }]
   }
   ```
3. 撰寫 `main.py`：
   ```python
   win = OS.ui.createWindow({"title": "我的 Python 應用", "width": 400, "height": 300})
   OS.ui.initialize(win["data"], [
       OS.ui.label("lbl", "Hello from Python 3!")
   ])
   ```

詳細說明請參閱 [Python Runtime 開發指南](./docs/plugin-development/python-runtime.md)。

## 可用的 Host API

| API | 說明 | 權限 |
|-----|------|------|
| `OS.process` | 程序資訊、子程序、終止 | 依操作而異 |
| `OS.event` | 事件訂閱/發射 | `event.subscribe.*` / `event.emit.*` |
| `OS.ipc` | 跨程序通訊 | — |
| `OS.service` | Service 健康狀態發布 | — |
| `OS.ui` | 視窗建立與 UI 元件 | `window.create` |
| `OS.system` | 系統級操作（終止程序） | `process.terminate` |
| `OS.storage` | 分層儲存讀寫 | `file.read.*` / `file.write.*` |
| `OS.env` | 環境變數、程式庫、命令註冊 | `env.read` / `env.write` / `env.library.load` |
| `OS.console` | Console 輸出 | `console.write` |
| `OS.shell` | 系統指令（程序/應用/視窗/sysinfo） | `process.list` / `shell.*` |
| `OS.notification` | 通知系統（發送/關閉） | `notification.send` |
| `OS.monitor` | 系統監控統計（事件/API/權限/程序） | `monitor.read` |
| `OS.settings` | 系統設定（桌布、主題、工作列等） | `settings.read` / `settings.write` |
| `OS.network` | 網路請求（受允許清單控管） | `network.request` |
| `OS.registry` | 系統登錄表讀寫 | `registry.read` / `registry.write` |
| `OS.dialog` | 檔案選擇對話框 | — |
| `OS.install` | 應用程式安裝（遠端 manifest） | — |
| `OS.clipboard` | 跨應用剪貼簿讀寫 | `clipboard.read` / `clipboard.write` |
| `OS.audio` | 音訊播放 | `audio.play` |

## sentryos-sdk

`packages/sdk` 提供完整的 TypeScript 型別定義，供應用程式與插件開發使用：

```ts
import type { OsApi, AppManifest } from 'sentryos-sdk/app';
import type { SentryPlugin, PluginContext } from 'sentryos-sdk/plugin';
import { Permissions, Events } from 'sentryos-sdk';
```

詳見 [SDK README](./packages/sdk/README.md)。

## 技術文件

完整架構與 API 文件位於 [`docs/`](./docs/) 目錄，包含：

- [架構總覽](./docs/architecture/overview.md)
- [核心元件文件](./docs/core/)
- [視窗系統](./docs/window-system/window-system.md)
- [Host API 參考](./docs/app-development/host-api.md)
- [Manifest 規格](./docs/app-development/manifest.md)
- [插件開發指南](./docs/plugin-development/guide.md)
- [Python Runtime 開發指南](./docs/plugin-development/python-runtime.md)
- [資料流圖](./docs/data-flow/data-flow.md)

## 技術棧

- **TypeScript 5.9** — 型別安全的核心系統（strict 模式）
- **Vite 7** — 開發伺服器與建置工具
- **pnpm 10 + workspace** — Monorepo 套件管理
- **QuickJS (quickjs-emscripten)** — WASM 沙箱執行應用程式 JavaScript（預設 Runtime）
- **Pyodide 0.29** — CPython 編譯為 WASM，用於 Python 應用程式沙箱執行（插件 Runtime）
- **Fengari** — 純 JS 的 Lua 5.3 實作，用於 Lua 應用程式執行（插件 Runtime）
- **純 CSS** — 無框架依賴的桌面環境樣式


