# 架構概覽

SentryOS 是一個基於瀏覽器的作業系統模擬器，使用 Vite + TypeScript 建構，QuickJS-emscripten 作為沙箱執行引擎。

---

## 目錄結構

```
src/
├── main.ts                    # 進入點
├── style.css                  # 全域樣式
├── api/                       # Host API 模組（注入到沙箱的 OS 全域物件）
│   ├── index.ts               # registerAllHostApis
│   ├── uiApi.ts               # UI/視窗 API
│   ├── systemApi.ts           # 程序管理 API
│   ├── storageApi.ts          # 檔案系統 API
│   ├── envApi.ts              # 環境變數 API
│   ├── consoleApi.ts          # 主控台 API
│   ├── shellApi.ts            # Shell 指令 API
│   ├── notificationApi.ts     # 通知 API
│   ├── monitorApi.ts          # 系統監控 API
│   ├── settingsApi.ts         # 設定 API
│   ├── networkApi.ts          # 網路請求 API
│   ├── registryApi.ts         # 註冊表 API
│   └── dialogApi.ts           # 對話框 API
├── application/               # 應用程式管理
│   ├── ApplicationCatalog.ts  # 清單載入與解析
│   ├── ApplicationManager.ts  # 應用程式登錄/查詢
│   └── ApplicationLauncher.ts # 應用程式啟動邏輯
├── bootstrap/                 # 系統啟動
│   └── systemBootstrap.ts
├── console/                   # 核心主控台
│   ├── KernelConsole.ts
│   └── AnsiParser.ts
├── dialog/                    # 對話框系統
│   └── DialogManager.ts
├── environment/               # 環境變數
│   └── EnvironmentManager.ts
├── events/                    # 事件匯流排
│   └── EventBus.ts
├── kernel/                    # 核心
│   ├── Kernel.ts              # Service Locator
│   ├── constants.ts           # 常數定義
│   ├── permissions.ts         # 權限常數
│   └── types.ts               # 共用型別
├── language/                  # 語系管理
│   ├── LanguageManager.ts
│   └── systemPacks.ts
├── monitor/                   # 系統監控
│   └── SystemMonitor.ts
├── network/                   # 網路管理
│   ├── AllowlistNetworkManager.ts
│   └── NetworkAdapter.ts
├── notification/              # 通知系統
│   ├── NotificationManager.ts
│   └── SystemAlert.ts
├── permissions/               # 權限管理
│   └── PermissionsManager.ts
├── plugin/                    # 插件系統
│   ├── PluginManager.ts
│   └── PluginContext.ts
├── process/                   # 程序管理
│   ├── Process.ts
│   └── ProcessManager.ts
├── registry/                  # 系統註冊表
│   └── SystemRegistry.ts
├── runtime/                   # 沙箱執行引擎
│   ├── ScriptRuntime.ts       # QuickJS 實作
│   ├── BaseRuntime.ts         # 引擎無關的共用邏輯
│   ├── IRuntime.ts            # Runtime 介面
│   ├── RuntimeRegistry.ts     # 多引擎 Registry
│   ├── QuickJsInit.ts         # QuickJS 初始化
│   └── types.ts               # Runtime 型別
├── storage/                   # 檔案系統
│   └── FileSystem.ts
├── ui/                        # UI 層
│   ├── Bios.ts                # 啟動畫面 / 錯誤畫面
│   └── DesktopShell.ts        # 桌面環境
└── window/                    # 視窗系統
    ├── WindowManager.ts       # 視窗管理
    ├── types.ts               # 視窗型別定義
    ├── UiComponentRegistry.ts # UI 元件 Registry
    └── builtinComponents.ts   # 內建 UI 元件
```

---

## 核心架構模式

### Service Locator（Kernel）

`Kernel.ts` 作為 Service Locator，所有子系統透過 `kernel.resolve('serviceName')` 取得依賴。

### 權限閘道

所有 API 呼叫都經過 `PermissionsManager.has()` 檢查，權限字串格式為 `domain.action.target`。

### 沙箱隔離

應用程式在 QuickJS WebAssembly 沙箱中執行，只能透過注入的 `OS` 全域物件與系統互動。

### 事件驅動

`EventBus` 負責跨模組通訊，所有事件訂閱/發射需要對應權限。

---

## 文件索引

### 核心模組
- [WindowManager](../core/window-manager.md)
- [ScriptRuntime](../core/script-runtime.md)
- [PermissionsManager](../core/permissions-manager.md)
- [ApplicationCatalog](../core/application-catalog.md)
- [ApplicationManager](../core/application-manager.md)
- [FileSystem](../core/file-system.md)
- [EventBus](../core/event-bus.md)
- [NotificationManager](../core/notification-manager.md)
- [SystemMonitor](../core/system-monitor.md)
- [ProcessManager](../core/process-manager.md)
- [NetworkManager](../core/network-manager.md)
- [EnvironmentManager](../core/environment-manager.md)
- [共用型別](../core/types.md)

### UI
- [BIOS](../ui/bios.md)
- [DesktopShell](../ui/desktop-shell.md)

### 視窗系統
- [視窗系統型別](../window-system/window-system.md)

### 應用程式開發
- [開發指南](../app-development/guide.md)
- [Host API](../app-development/host-api.md)
- [Manifest 格式](../app-development/manifest.md)

### 型別定義
- [types/](../types/README.md) — Plugin SDK 型別定義檔
