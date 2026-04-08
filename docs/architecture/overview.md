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
      manifest.json                # 多應用套件 Manifest
    terminal/
      main.js                      # 終端機 App 入口
      manifest.json
    task-manager/
      main.js                      # 工作管理員（Window）
      manifest.json
src/
  main.ts                          # 唯一入口，呼叫 bootstrapSystem()
  style.css                        # 桌面外殼、視窗與 Console 樣式
  api/                             # Host API 註冊層
    index.ts                       # 集中註冊入口（registerAllHostApis）
    consoleApi.ts                  # Console 輸出（覆寫內建版本）
    envApi.ts                      # 環境變數 / Library / 命令註冊
    monitorApi.ts                  # 系統監控統計
    notificationApi.ts             # 通知系統
    shellApi.ts                    # 系統指令（程序、應用、視窗、sysinfo）
    storageApi.ts                  # 儲存查詢
    systemApi.ts                   # 程序終止
    uiApi.ts                       # 視窗建立 & UI tree
    settingsApi.ts                 # 主題/通知設定
    networkApi.ts                  # 網路連線（允許清單 HTTP 代理）
  application/                     # 應用程式管理
    ApplicationCatalog.ts          # App Manifest 載入（Package / Legacy 格式）
    ApplicationLauncher.ts         # 程序生命週期 & 視窗管理（集中啟動邏輯）
    ApplicationManager.ts          # 應用定義登錄簿
  bootstrap/                       # 系統初始化
    systemBootstrap.ts             # 核心服務初始化 & 流程編排 & API 註冊
  environment/                     # 環境狀態
    EnvironmentManager.ts          # 環境變數、程式庫快取、命令註冊表
  events/                          # 事件系統
    EventBus.ts                    # 權限門控事件匯流排
  kernel/                          # 核心抽象
    Kernel.ts                      # 服務定位容器（Service Locator）
    constants.ts                   # 系統常數、權限字串、事件名稱
    types.ts                       # 共用型別（Result、各 Error 型別）
  monitor/                         # 系統監控
    SystemMonitor.ts               # 事件/API/權限/程序追蹤與統計
  notification/                    # 通知系統
    NotificationManager.ts         # 全域通知佇列與 DOM 渲染
  network/                         # 網路系統
    NetworkAdapter.ts              # 抽象網路介面
    AllowlistNetworkManager.ts     # 允許清單網路實作
  permissions/                     # 權限系統
    PermissionsManager.ts          # 萬用字元權限管理
  process/                         # 程序管理
    Process.ts                     # 程序資料模型
    ProcessManager.ts              # 程序生命週期（啟動、終止、暫停/恢復）
  runtime/                         # 腳本執行
    QuickJsInit.ts                 # QuickJS WASM 初始化
    ScriptRuntime.ts               # QuickJS 沙箱執行環境 & Host API 注入
    types.ts                       # Runtime 型別定義
  storage/                         # 檔案系統
    FileSystem.ts                  # 虛擬檔案系統（分層容量管理）
  ui/                              # 使用者介面
    Bios.ts                        # 開機日誌 & boot terminal & 錯誤畫面
    DesktopShell.ts                # 桌面外殼 DOM（工作列 / 開始選單 / 覆蓋層）
  window/                          # 視窗系統
    WindowManager.ts               # 視窗生命週期、UI tree 渲染、拖曳與焦點
    types.ts                       # 視窗相關型別定義
```

---

## 啟動流程

```
main.ts
  └─ bootstrapSystem()                          [systemBootstrap.ts]
       ├─ BIOS.createBootTerminal()              顯示開機日誌畫面
       ├─ BIOS.init()                            初始化日誌系統
       ├─ initializeCore()                       初始化所有核心服務
       │    ├─ initializeQuickJS()               載入 QuickJS WASM
       │    ├─ PermissionsManager.init()         取得 systemAppId
       │    ├─ new EventBus(kernel)
       │    ├─ new ApplicationManager()
       │    ├─ new ProcessManager(kernel)
       │    ├─ new ScriptRuntime(kernel)
       │    ├─ new WebFileSystemAdapter()
       │    ├─ new EnvironmentManager()
       │    ├─ new NotificationManager()
       │    ├─ new AllowlistNetworkManager()      允許清單網路管理
       │    ├─ new SystemMonitor(bootTime)
       │    ├─ new DesktopShell()
       │    └─ 註冊所有服務到 Kernel
       ├─ loadApplicationCatalog()               取得 app.json → 各 manifest
       ├─ registerApplications()                 註冊進 ApplicationManager，產生 appId & iconMap
       ├─ DesktopShell.mount()                   渲染桌面 DOM
       ├─ new WindowManager(host, uiHandler)     建立視窗管理器
       ├─ notificationManager.createContainer()  建立通知容器 → 註冊為桌面覆蓋層
       ├─ registerAllHostApis()                  註冊所有 Host API（10 個模組，扁平化至 OS 全域物件）
       │    ├─ registerUiApi(…, 'window')               視窗建立 & UI tree
       │    ├─ registerSystemApi(…)                     程序終止
       │    ├─ registerStorageApi(…)                    檔案儲存
       │    ├─ registerEnvApi(…)                        環境變數 / Library / 命令
       │    ├─ registerConsoleApi(…, 'console')         Console 輸出
       │    ├─ registerShellApi(…, 'console')           系統指令
       │    ├─ registerNotificationApi(…)               通知系統
       │    ├─ registerMonitorApi(…)                    系統監控
       │    ├─ registerSettingsApi(…)                   主題/通知設定
       │    └─ registerNetworkApi(…)                    網路連線
       ├─ DesktopShell 事件綁定
       │    ├─ onStartButtonClick → toggleStartPanel
       │    ├─ onLaunchRequest → ApplicationLauncher.launchApplication()
       │    └─ onTaskbarClick → WindowManager.focusWindow()
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

## Kernel（服務定位容器）

**檔案**：`src/kernel/Kernel.ts`

Kernel 是系統的核心服務容器，採用 **Service Locator** 模式，提供型別安全的服務註冊與解析：

- `register<K>(name, service)` — 註冊有狀態的服務（如 ProcessManager、EventBus）
- `resolve<K>(name)` — 解析已註冊的服務
- `set<K>(name, value)` — 設定組態值（如 systemAppId）
- `get<K>(name)` — 取得組態值

所有核心類別透過 **建構子注入** 接收 Kernel，而非全域存取。

---

## 分層架構與責任邊界

| 層級 | 路徑 | 職責 |
|------|------|------|
| **Entry** | `src/main.ts` | 唯一入口，`import style.css` 並呼叫 `bootstrapSystem()` |
| **Bootstrap** | `src/bootstrap/` | 流程編排（初始化、接線、API 註冊、啟動），不持有業務狀態 |
| **Kernel** | `src/kernel/` | 服務容器、共用型別與系統常數 |
| **API** | `src/api/` | Host API 註冊層，橋接核心服務與沙箱應用 |
| **Core Modules** | `src/application/`, `src/process/`, `src/runtime/`, `src/permissions/`, `src/events/`, `src/environment/`, `src/storage/`, `src/monitor/`, `src/notification/`, `src/network/`, `src/console/` | 各自獨立的系統模組 |
| **Window** | `src/window/` | 視窗系統，管理視窗生命週期與 UI 渲染 |
| **UI** | `src/ui/` | 桌面 DOM 組裝與互動（Bios、DesktopShell） |
| **Public Apps** | `public/apps/` | 只透過 Host API 與系統溝通，不直接操作核心物件 |

### 層間互動原則

- **Bootstrap → Kernel**：建立 Kernel 容器，逐一初始化核心服務並註冊
- **Bootstrap → UI**：建立 DesktopShell 並接線事件回呼
- **Core ↔ Core**：服務間透過 Kernel 解析依賴（如 ProcessManager 使用 PermissionsManager）
- **API → Core**：各 Host API 模組透過 Kernel 存取核心服務
- **UI → Core**：透過 Bootstrap 提供的回呼間接呼叫
- **Public Apps → Core**：僅透過 Host API（ScriptRuntime 注入的全域物件）間接呼叫
