# SentryOS

一個在瀏覽器中運行的微型作業系統，使用 TypeScript + Vite 構建，透過 QuickJS WASM 沙箱安全執行第三方應用程式。

![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)
![Vite](https://img.shields.io/badge/Vite-7.x-646CFF)
![QuickJS](https://img.shields.io/badge/QuickJS-WASM-orange)
![License](https://img.shields.io/badge/license-MIT-green)

## AI 生成聲明

> 本專案的程式碼與文件大量使用 AI 輔助生成（GitHub Copilot）。所有內容均經過人工審查，但可能仍存在錯誤或不完善之處。使用前請自行評估。

## 特色

- **QuickJS WASM 沙箱** — 每個應用程式在獨立的 QuickJS 執行環境中運行，與主機完全隔離
- **細粒度權限系統** — 支援萬用字元匹配的階層式權限控制，應用程式只能存取被授權的 API
- **視窗管理系統** — 支援拖曳、縮放、最大化/最小化、Z-Index 管理、8 方向調整大小
- **程序生命週期** — 完整的程序管理（啟動、暫停、恢復、終止）與父子程序關係
- **事件匯流排** — 權限門控的事件訂閱/發射機制，支援跨程序通訊 (IPC)
- **虛擬檔案系統** — 分層儲存空間（系統/應用/使用者/快取），含容量限制
- **桌面環境** — 工作列、開始選單、通知系統、開機動畫
- **系統監控** — 內建 SystemMonitor 追蹤事件、API 呼叫、權限檢查與效能數據
- **應用程式類型** — 支援 Window、Console、Service、Library 四種應用類型

## 快速開始

### 環境需求

- Node.js 18+
- npm

### 安裝與開發

```bash
# 安裝依賴
npm install

# 啟動開發伺服器
npm run dev

# 建置
npm run build

# 預覽建置結果
npm run preview
```

## 專案結構

```
sentryos/
├── index.html              # 入口 HTML
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── main.ts             # 應用程式入口
│   ├── style.css           # 全域樣式
│   ├── api/                # Host API 註冊層（13 個模組）
│   │   ├── index.ts        # 集中註冊入口
│   │   ├── consoleApi.ts   # Console 輸出
│   │   ├── dialogApi.ts    # 對話框
│   │   ├── envApi.ts       # 環境變數 / Library / 命令
│   │   ├── installApi.ts   # 應用程式安裝
│   │   ├── monitorApi.ts   # 系統監控統計
│   │   ├── networkApi.ts   # 網路請求
│   │   ├── notificationApi.ts # 通知系統
│   │   ├── registryApi.ts  # 系統登錄
│   │   ├── settingsApi.ts  # 系統設定
│   │   ├── shellApi.ts     # 系統指令
│   │   ├── storageApi.ts   # 儲存查詢
│   │   ├── systemApi.ts    # 程序終止
│   │   └── uiApi.ts        # 視窗 & UI tree
│   ├── application/        # 應用程式管理
│   │   ├── AppInstaller.ts        # 核心層安裝對話框
│   │   ├── ApplicationCatalog.ts  # Manifest 載入器
│   │   ├── ApplicationLauncher.ts # 集中啟動邏輯
│   │   └── ApplicationManager.ts  # 應用定義登錄簿
│   ├── auth/
│   │   └── AuthProvider.ts        # 使用者驗證
│   ├── bootstrap/
│   │   └── systemBootstrap.ts  # 系統初始化與 API 註冊
│   ├── console/
│   │   ├── AnsiParser.ts    # ANSI 控制碼解析
│   │   └── KernelConsole.ts # 核心層主控台
│   ├── dialog/
│   │   └── DialogManager.ts # 對話框管理
│   ├── environment/
│   │   └── EnvironmentManager.ts  # 環境變數、自動啟動、程式庫
│   ├── events/
│   │   └── EventBus.ts      # 權限門控事件匯流排
│   ├── kernel/              # 核心抽象
│   │   ├── Kernel.ts        # 服務定位容器
│   │   ├── constants.ts     # 權限字串、事件名稱、預設值
│   │   └── types.ts         # 共用型別定義
│   ├── language/
│   │   ├── LanguageManager.ts # 多語言 i18n 管理
│   │   └── systemPacks.ts   # 內建語言包
│   ├── monitor/
│   │   └── SystemMonitor.ts  # 系統監控追蹤器
│   ├── network/
│   │   ├── AllowlistNetworkManager.ts # 允許清單網路管理
│   │   └── NetworkAdapter.ts          # 網路介面卡抽象
│   ├── notification/
│   │   └── NotificationManager.ts # 全域通知系統
│   ├── permissions/
│   │   └── PermissionsManager.ts  # 萬用字元權限管理
│   ├── plugin/
│   │   ├── PluginContext.ts  # 插件執行上下文
│   │   └── PluginManager.ts  # 插件管理
│   ├── process/
│   │   ├── Process.ts       # 程序資料模型
│   │   └── ProcessManager.ts # 程序生命週期管理
│   ├── registry/
│   │   └── SystemRegistry.ts # 系統登錄表
│   ├── runtime/
│   │   ├── QuickJsInit.ts   # QuickJS WASM 初始化
│   │   ├── ScriptRuntime.ts # QuickJS 沙箱執行引擎
│   │   └── types.ts         # Runtime 型別定義
│   ├── storage/
│   │   └── FileSystem.ts    # 虛擬檔案系統
│   ├── ui/
│   │   ├── Bios.ts          # 開機日誌 & 錯誤畫面
│   │   └── DesktopShell.ts  # 工作列、開始選單、覆蓋層
│   └── window/
│       ├── WindowManager.ts # 視窗管理、拖曳、焦點
│       └── types.ts         # 視窗型別定義
├── public/
│   ├── app.json             # 應用程式目錄
│   ├── plugins.json         # 插件目錄
│   └── apps/                # 內建應用程式
│       ├── example/         # 範例應用
│       ├── stdlib/          # 標準函式庫
│       ├── terminal/        # 終端機
│       ├── task-manager/    # 工作管理員
│       ├── file-manager/    # 檔案管理器
│       ├── file-picker/     # 檔案選擇器
│       ├── text-manager/    # 文字編輯器
│       ├── utilities/       # 計算機、時鐘等實用工具
│       ├── settings/        # 系統設定
│       └── developer-tools/ # 開發者工具
└── docs/                    # 完整技術文件
```

## 架構概覽

```
┌─────────────────────────────────────────────┐
│                  Entry                       │
│                 main.ts                      │
├─────────────────────────────────────────────┤
│               Bootstrap                      │
│            systemBootstrap.ts                │
├─────────────────────────────────────────────┤
│          Kernel (Service Locator)            │
│         Kernel.ts │ constants │ types        │
├─────────────────────────────────────────────┤
│              Core Modules                    │
│  ScriptRuntime │ ProcessManager │ EventBus  │
│  Permissions   │ WindowManager  │ Storage   │
│  Environment   │ Notification   │ Monitor   │
│  ApplicationManager │ ApplicationLauncher    │
│  Network │ Registry │ Dialog │ AppInstaller  │
│  Auth │ Console │ Language │ Plugin         │
├─────────────────────────────────────────────┤
│                 API Layer                    │
│  ui │ system │ storage │ env │ console      │
│  shell │ notification │ monitor │ settings  │
│  network │ registry │ dialog │ install      │
├─────────────────────────────────────────────┤
│                   UI                         │
│          Bios │ DesktopShell                 │
├─────────────────────────────────────────────┤
│             Public Apps (沙箱)               │
│   example │ terminal │ task-manager │ stdlib │
│   file-manager │ file-picker │ text-manager  │
│   utilities │ settings │ developer-tools    │
└─────────────────────────────────────────────┘
```

應用程式透過 Host API（`OS.process`、`OS.event`、`OS.ui`、`OS.storage` 等）與系統互動，所有呼叫均受權限系統保護。

## 開發應用程式

1. 建立 `public/apps/<name>/` 目錄
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
   var win = ui.createWindow({ title: '我的應用', width: 400, height: 300 });
   ui.initialize(win.data, [
     ui.label('Hello, SentryOS!')
   ]);
   ```
4. 在 `public/app.json` 中加入 `"app/<name>"`

詳細說明請參閱 [開發指南](./docs/app-development/guide.md)。

## 可用的 Host API

| API | 說明 | 權限 |
|-----|------|------|
| `OS.process` | 程序資訊、子程序、終止 | 依操作而異 |
| `OS.event` | 事件訂閱/發射 | `event.subscribe.*` / `event.emit.*` |
| `OS.ipc` | 跨程序通訊 | — |
| `OS.ui` | 視窗建立與 UI 元件 | `window.create` |
| `OS.system` | 系統級操作 | `process.terminate` |
| `OS.storage` | 儲存空間查詢 | `storage.usage` |
| `OS.env` | 環境變數、程式庫、命令註冊 | `env.read` / `env.write` / `env.library.load` |
| `OS.console` | Console 輸出 | `console.write` |
| `OS.shell` | 系統指令（程序/應用/視窗/sysinfo） | `process.list` / `shell.*` |
| `OS.notification` | 通知系統（發送/關閉） | `notification.send` |
| `OS.monitor` | 系統監控統計（事件/API/權限/程序） | `monitor.read` |
| `OS.settings` | 系統設定（桌布、主題、工作列等） | `settings.read` / `settings.write` |
| `OS.network` | 網路請求（受允許清單控管） | `network.request` |
| `OS.registry` | 系統登錄表讀寫 | `registry.read` / `registry.write` |
| `OS.dialog` | 對話框（開啟/關閉/回呼） | — |
| `OS.install` | 應用程式安裝（遠端 manifest） | — |

## 技術文件

完整架構與 API 文件位於 [`docs/`](./docs/) 目錄，包含：

- [架構總覽](./docs/architecture/overview.md)
- [核心元件文件](./docs/core/)
- [視窗系統](./docs/window-system/window-system.md)
- [Host API 參考](./docs/app-development/host-api.md)
- [Manifest 規格](./docs/app-development/manifest.md)
- [資料流圖](./docs/data-flow/data-flow.md)

## 技術棧

- **TypeScript 5.9** — 型別安全的核心系統
- **Vite 7** — 開發伺服器與建置工具
- **QuickJS (quickjs-emscripten)** — WASM 沙箱執行應用程式 JavaScript
- **純 CSS** — 無框架依賴的桌面環境樣式


