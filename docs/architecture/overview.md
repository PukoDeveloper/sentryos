# 架構總覽

本文件描述 SentryOS 前端的目錄結構、啟動流程與分層架構。

---

## 目錄結構

```
index.html
package.json
tsconfig.json
vite.config.ts
public/
  app.json                         # 應用程式清單（路徑陣列）
  apps/
    stdlib/
      manifest.json                # 標準函式庫套件（math.js + string.js）
      math.js                      # MathUtils Library
      string.js                    # StringUtils Library
    example/
      main.js                      # 範例計數器 App（Window）
      console.js                   # Console Demo（Console）
      manifest.json                # 多應用套件 Manifest
      icon.svg                     # App 圖示
    terminal/
      main.js                      # 終端機 App 入口
      manifest.json
      icon.svg
    task-manager/
      main.js                      # 工作管理員（Service）
      manifest.json
src/
  main.ts                          # 唯一入口，呼叫 bootstrapSystem()
  style.css                        # 桌面外殼、視窗與 Console 樣式
  bootstrap/
    bios.ts                        # 開機日誌 & boot terminal
    systemBootstrap.ts             # 核心服務初始化 & 流程編排 & API 註冊
  core/
    App.ts                         # ApplicationManager + ProcessManager
    ApplicationCatalog.ts          # App Manifest 載入（支援 Package / Legacy 兩種格式）
    constants.ts                   # 系統常數、權限字串、事件名稱
    EnvironmentManager.ts          # 環境變數、程式庫快取、命令註冊表
    EventBus.ts                    # 權限門控事件匯流排
    PermissionsManager.ts          # 萬用字元權限系統
    ScriptRuntime.ts               # QuickJS 沙箱執行環境 & Host API 注入
    WindowSystem.ts                # WindowManager、UI tree 渲染、Console 視窗
    storage.ts                     # 虛擬檔案系統（WebFileSystemAdapter）
    types.ts                       # 共用型別（Result、EventBusResult、ProcessResult）
  ui/
    DesktopShell.ts                # 桌面外殼 DOM（工作列 / 開始選單 / 覆蓋層）
```

---

## 啟動流程

```
main.ts
  └─ bootstrapSystem()                          [systemBootstrap.ts]
       ├─ BIOS.createBootTerminal()              顯示開機日誌畫面
       ├─ initializeCore()                       初始化所有核心服務
       │    ├─ initializeQuickJS()               載入 QuickJS WASM
       │    ├─ PermissionsManager.init()         取得 systemAppId
       │    ├─ new EventBus(permissions)
       │    ├─ new ApplicationManager()
       │    ├─ new ProcessManager(...)
       │    ├─ new ScriptRuntime(...)
       │    ├─ new WebFileSystemAdapter(...)
       │    └─ new EnvironmentManager()
       ├─ loadApplicationCatalog()               取得 app.json → 各 manifest
       ├─ registerApplications()                 註冊進 ApplicationManager，產生 appId & iconMap
       ├─ DesktopShell.mount()                   渲染桌面 DOM
       ├─ DesktopShell.setApplications(filtered) 設定開始選單（排除 Service/Library）
       ├─ new WindowManager(host, uiHandler)     建立視窗管理器
       ├─ windowManager.setWindowChangeListener  綁定視窗生命週期（同步工作列 + 程序清理）
       ├─ 註冊 Host API
       │    ├─ runtime.registerApi('ui', …, 'window')       視窗建立 & UI tree
       │    ├─ runtime.registerApi('systemApi', …)          程序終止
       │    ├─ runtime.registerApi('storageApi', …)         儲存查詢
       │    ├─ runtime.registerApi('envApi', …)             環境變數 / Library / 命令註冊
       │    ├─ runtime.registerApi('consoleApi', …, 'console')  Console 輸出
       │    └─ runtime.registerApi('shellApi', …, 'console')    系統指令
       ├─ desktopShell.onTaskbarWindowClick      綁定工作列點擊 → focusWindow
       ├─ desktopShell.onLaunchRequest           綁定開始選單 → launchApplication
       ├─ 啟動應用（按優先順序）
       │    ├─ Library（全部）→ 快取 + init + 銷毀程序
       │    ├─ Service（autoStart）→ 背景執行
       │    └─ Window / Console（autoStart）→ 建立視窗 + 執行
       └─ BIOS.destroyBootTerminal()             移除開機畫面
```

### 應用啟動順序

1. **Library**（全部）：優先載入，執行 init 程式碼（註冊命令、匯出全域物件），然後銷毀程序
2. **Service**（autoStart = true）：背景服務
3. **Window / Console**（autoStart = true）：GUI / Console 介面應用

---

## 分層架構與責任邊界

| 層級 | 路徑 | 職責 |
|------|------|------|
| **Entry** | `src/main.ts` | 唯一入口，`import style.css` 並呼叫 `bootstrapSystem()` |
| **Bootstrap** | `src/bootstrap/` | 流程編排（初始化、接線、API 註冊、啟動），不持有業務狀態 |
| **Core** | `src/core/` | 可重用的系統能力與資料模型 |
| **UI** | `src/ui/` | 桌面 DOM 組裝與互動，不直接管理 Process 或 Runtime |
| **Public Apps** | `public/apps/` | 只透過 Host API 與系統溝通，不直接操作核心物件 |

### 層間互動原則

- **Bootstrap → Core**：建立與初始化所有 Core 服務，持有依賴關係引用
- **Bootstrap → UI**：建立 DesktopShell 並接線事件回呼
- **Core ↔ Core**：服務間可相互引用（如 ProcessManager 使用 PermissionsManager）
- **UI → Core**：透過 Bootstrap 提供的回呼間接呼叫
- **Public Apps → Core**：僅透過 Host API（ScriptRuntime 注入的全域物件）間接呼叫
