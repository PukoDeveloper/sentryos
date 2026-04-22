# 架構概覽

SentryOS 是一個基於瀏覽器的作業系統模擬器，使用 Vite + TypeScript 建構，QuickJS-emscripten 作為預設沙箱執行引擎，支援透過插件擴充其他引擎（如 Lua）。

---

## 設計哲學

1. **沙箱隔離** — 所有應用程式在 WebAssembly 沙箱中執行，只能透過 `OS` 全域物件存取系統功能
2. **權限閘道** — 每個 API 呼叫都經過 `PermissionsManager.has()` 檢查
3. **事件驅動** — 跨模組通訊統一走 `EventBus`
4. **Service Locator** — `Kernel` 作為中央服務註冊表，所有模組透過 `kernel.resolve()` 取得依賴
5. **可擴充 Runtime** — 透過插件系統註冊新的執行引擎，共用相同的 Host API

---

## 系統分層架構

```
┌─────────────────────────────────────────────────────────────┐
│                        UI 層                                 │
│  Bios（啟動畫面）  DesktopShell（桌面環境）  WindowManager   │
├─────────────────────────────────────────────────────────────┤
│                     Host API 層                              │
│  ui · system · storage · env · console · shell              │
│  notification · monitor · settings · network · registry     │
│  dialog                                                      │
│  ＊ 所有 Host API 集中註冊在 RuntimeRegistry                  │
├─────────────────────────────────────────────────────────────┤
│                    Runtime 層                                 │
│  RuntimeRegistry（中央 API 註冊 + 多引擎管理）               │
│  ├── ScriptRuntime（QuickJS — 內建）                         │
│  └── LuaRuntime（Wasmoon — 插件提供）                        │
│  BaseRuntime（引擎無關的共用邏輯：IPC、事件、API 表面建構）    │
├─────────────────────────────────────────────────────────────┤
│                    核心服務層                                 │
│  Kernel · PermissionsManager · EventBus · ProcessManager    │
│  ApplicationManager · ApplicationLauncher · FileSystem       │
│  EnvironmentManager · NotificationManager · SystemMonitor   │
│  NetworkAdapter · SystemRegistry · DialogManager             │
│  PluginManager · LanguageManager                             │
├─────────────────────────────────────────────────────────────┤
│                    基礎設施層                                 │
│  QuickJS-emscripten（WASM）  localStorage（持久化）          │
│  fetch API（網路）  DOM（渲染）                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Kernel — Service Locator

`Kernel` 是系統核心的服務定位器，管理兩類資料：

### ServiceMap（服務）

透過 `kernel.register(key, service)` 註冊，`kernel.resolve(key)` 取得。每個 key 只能註冊一次。

| Key | 型別 | 說明 |
|-----|------|------|
| `permissions` | `PermissionsManager` | 權限管理 |
| `eventBus` | `EventBus` | 事件匯流排 |
| `appManager` | `ApplicationManager` | 應用定義登錄/查詢 |
| `processManager` | `ProcessManager` | 程序生命週期 |
| `runtime` | `IRuntime` | 預設 Runtime 引擎（ScriptRuntime） |
| `runtimeRegistry` | `RuntimeRegistry` | 多引擎管理 + 中央 Host API 註冊表 |
| `fileSystem` | `FileSystemAdapter` | 分層檔案系統 |
| `windowManager` | `WindowManager` | 視窗管理 |
| `environmentManager` | `EnvironmentManager` | 環境變數、程式庫、命令 |
| `notificationManager` | `NotificationManager` | 通知系統 |
| `systemMonitor` | `SystemMonitor` | 系統監控 |
| `desktopShell` | `DesktopShell` | 桌面環境 UI |
| `applicationLauncher` | `ApplicationLauncher` | 應用啟動邏輯 |
| `systemAlert` | `SystemAlert` | 系統警告彈窗 |
| `kernelConsole` | `KernelConsole` | 核心主控台 |
| `networkManager` | `NetworkAdapter` | 網路管理 |
| `systemRegistry` | `SystemRegistry` | 角色/檔案類型註冊表 |
| `dialogManager` | `DialogManager` | 對話框管理 |
| `appInstaller` | `AppInstaller` | 遠端應用程式安裝 |
| `pluginManager` | `PluginManager` | 插件管理 |
| `languageManager` | `LanguageManager` | 語系管理 |
| `clipboardManager` | `ClipboardManager` | 跨應用剪貼簿 |
| `audioManager` | `AudioManager` | 系統音訊管理 |

### ValueMap（值）

透過 `kernel.set(key, value)` 寫入，`kernel.get(key)` 取得。

| Key | 型別 | 說明 |
|-----|------|------|
| `systemAppId` | `string` | 系統 appId（`sys_` 前綴） |
| `userAppId` | `string` | 使用者 appId（`user_` 前綴） |
| `bootStartTime` | `number` | 開機時間戳 |
| `catalogApps` | `RegisteredApplication[]` | 所有已載入應用 |
| `iconMap` | `Map<string, string>` | appDefId → icon 路徑 |
| `loginUser` | `string` | 目前登入的使用者名稱 |
| `userKey` | `string` | 使用者識別金鑰 |

---

## 開機流程

系統啟動由 `bootstrapSystem()` 函式驅動，分為兩個階段：

### 階段 1：核心初始化（`initializeCore()`）

```
1. 載入 QuickJS WASM 模組
2. 建立 Kernel 實例
3. 初始化 PermissionsManager → 取得 systemAppId
4. 建立使用者權限實體 → 取得 userAppId
5. 依序建立並註冊核心服務：
   EventBus → ApplicationManager → ProcessManager →
   ScriptRuntime → RuntimeRegistry → FileSystem →
   EnvironmentManager → LanguageManager → NotificationManager →
   SystemAlert → NetworkManager → SystemRegistry →
   DesktopShell → SystemMonitor
```

### 階段 2：系統啟動（`bootstrapSystem()`）

```
 6. 載入應用程式目錄（fetch /app.json → 解析 manifest.json）
 7. 登錄所有應用到 ApplicationManager
 8. 掛載桌面環境（DesktopShell.mount()）
 9. 建立 ApplicationLauncher、DialogManager、WindowManager
10. 連接事件（視窗生命週期、鍵盤、工作列互動）
11. 註冊所有 Host API 到 RuntimeRegistry
12. 載入插件（NPM 套件實例 → PluginManager.loadPluginModules()；/plugins.json → loadPlugins()）
13. 啟動 Library 類應用（程式庫預載）
14. 啟動 autoStart 應用（Service 等自動啟動的應用）
15. 銷毀啟動畫面
```

### 關鍵順序

| 順序 | 動作 | 原因 |
|------|------|------|
| RuntimeRegistry 先於 Host API | 因為 Host API 需要 `runtimeRegistry.registerApi()` |
| Host API 先於插件載入 | 插件可能依賴 Host API 已就位 |
| 插件先於應用啟動 | 插件可能註冊新的 Runtime 引擎供應用使用 |
| Library 先於其他應用 | 其他應用可能透過 `OS.env.loadLibrary()` 依賴 Library |

---

## Runtime 架構

### 中央 API 管理

Host API 的生命週期由 `RuntimeRegistry` 統一管理，而非各個 Runtime 實例：

```
                     RuntimeRegistry
                    ┌─────────────────────────┐
                    │  hostApiEntries (Map)    │
                    │  ├── 'ui' → factory      │
                    │  ├── 'storageApi' → ...  │
  registerApi() ──→ │  ├── 'envApi' → ...      │ ←── getHostApiEntries()
                    │  └── ... (12 個)          │
                    └─────────────────────────┘

  buildApiSurface() 時合併：
    builtinApiEntries（引擎各自的內建 API）
    + hostApiEntries（全部 runtime 共用的 Host API）
```

### API 來源分類

| 來源 | 存放位置 | 範圍 | 內容 |
|------|---------|------|------|
| **引擎內建 API** | `BaseRuntime.builtinApiEntries` | 每個引擎各自獨立 | `process`, `event`, `ipc`, `serviceApi`, `windowApi`, `consoleApi` |
| **Host API** | `RuntimeRegistry.hostApiEntries` | 所有引擎共用 | `ui`, `systemApi`, `storageApi`, `envApi`, `consoleApi`, `shellApi`, `notificationApi`, `monitorApi`, `settingsApi`, `networkApi`, `registryApi`, `dialogApi` |
| **插件 API** | `RuntimeRegistry.hostApiEntries` | 所有引擎共用 | 插件透過 `ctx.registerApi()` 註冊 |

### 多引擎支援

```
RuntimeRegistry
├── 引擎管理：runtimes Map<engine, IRuntime>
│   ├── 'quickjs' → ScriptRuntime（內建）
│   └── 'lua' → LuaRuntime（插件提供）
│
├── 程序路由：pid/processAppId → engine
│   └── 用於查找負責特定程序的 Runtime
│
└── Host API：hostApiEntries Map
    └── 所有引擎在 buildApiSurface() 時共用
```

應用程式在 `manifest.json` 中透過 `engine` 欄位指定使用的引擎（預設 `'quickjs'`）。`ApplicationLauncher` 在啟動應用時，根據 `engine` 欄位路由到正確的 Runtime 實例。

### IRuntime 介面

所有 Runtime 引擎必須實作此介面：

```typescript
interface IRuntime {
    // 程式碼執行
    execute(pid, code, timeoutMs?, entryPath?): RuntimeResult<unknown>;
    evaluateInContext(pid, code): RuntimeResult<unknown>;

    // 程序生命週期
    destroyProcessRuntime(pid): void;
    destroyAll(): void;

    // 事件派發（系統呼叫引擎，在沙箱中執行回呼）
    dispatchUiEvent(processAppId, event): RuntimeResult<unknown>;
    dispatchConsoleInput(processAppId, line): RuntimeResult<unknown>;
    dispatchKeyboardEvent(processAppId, event): RuntimeResult<unknown>;
    dispatchFileOpen(processAppId, fileInfo): RuntimeResult<unknown>;
    dispatchDialogResult(processAppId, result): RuntimeResult<unknown>;
}
```

### BaseRuntime 抽象基底

提供引擎無關的共用邏輯，自訂引擎建議繼承此類別：

- **內建 API 註冊** — `process`, `event`, `ipc`, `serviceApi`, `windowApi`, `consoleApi`
- **API 表面建構** — `buildApiSurface()` 合併內建 + 中央 API
- **IPC 訊息路由** — `sendToParent`, `sendToChild`, `broadcastChildren`, `readInbox`
- **事件訂閱管理** — `subscribeProcessEvent`, `unsubscribeProcessEvent`
- **事件派發** — `dispatchUiEvent`, `dispatchConsoleInput` 等共用實作

---

## 插件系統

### 載入流程

插件透過兩種方式載入，均由 `PluginManager` 統一管理：

```
方式 A（推薦）：NPM 套件實例
createSentryOS({ pluginInstances: [htmlViewPlugin, luaRuntimePlugin, ...] })
    ↓
PluginManager.loadPluginModules(modules)

方式 B：動態 URL 路徑（自訂擴充）
/plugins.json → 路徑列表
    ↓
PluginManager.loadPlugins(paths) → fetch → blob URL import
```

兩種方式均執行：
```
Phase 1: 驗證 pluginName / setup / teardown
    ↓
Phase 2: 拓撲排序（Kahn's 算法，按 dependencies 依賴解析）
    ↓
Phase 3: 依序呼叫 setup(context)
```

### PluginContext

每個插件取得獨立的 `PluginContext`，提供：

| 功能 | 方法 | 說明 |
|------|------|------|
| Kernel 存取 | `resolve(key)`, `get(key)` | 存取所有核心服務 |
| 事件 | `on()`, `off()`, `emit()` | 以插件 appId 為範圍的事件 |
| API 註冊 | `registerApi()`, `unregisterApi()` | 註冊到中央 RuntimeRegistry |
| UI 元件 | `registerUiComponent()` | 擴充 UI 元件類型 |
| Runtime 引擎 | `registerRuntime()` | 註冊新執行引擎 |
| 日誌 | `log(level, message)` | 輸出到 KernelConsole |
| 清理 | `cleanup()` | 自動反註冊所有項目 |

### 卸載模式

| 模式 | 行為 |
|------|------|
| `soft` | 僅卸載該插件本身 |
| `root` | 卸載該插件 + 所有直接/間接依賴它的插件 |
| `force` | 強制卸載（忽略依賴關係） |

---

## 應用程式生命週期

### 啟動

```
DesktopShell 點擊 / API 呼叫
    ↓
ApplicationLauncher.launchApplication(context)
    ↓
ProcessManager.launch() → 建立 Process → 分配 processAppId
    ↓
PermissionsManager.registerAppId() → 分配權限
    ↓
RuntimeRegistry.bindProcess(pid, engine) → 綁定引擎
    ↓
fetch(mainPath) → 取得原始碼
    ↓
runtime.execute(pid, code, timeout, entryPath) → 沙箱執行
    ↓
程式碼透過 OS.* 呼叫 Host API
```

### 終止

```
使用者關閉視窗 / API 呼叫 / 系統終止
    ↓
ApplicationLauncher.terminateApplication(processAppId, reason)
    ↓
關閉所有視窗 → runtime.destroyProcessRuntime(pid) → 銷毀沙箱
    ↓
RuntimeRegistry.unbindProcess() → 解除引擎綁定
    ↓
ProcessManager.terminate() → 遞迴終止子程序
    ↓
EventBus.emit('process.stopped') → 通知其他模組
```

### 四種應用類型

| 類型 | 特性 | 生命週期 |
|------|------|---------|
| `Window` | 有 GUI 視窗 | 所有視窗關閉時自動終止 |
| `Console` | 系統自動建立文字終端視窗 | 終端關閉時終止 |
| `Service` | 無視窗，背景執行 | 預設 autoStart，手動終止 |
| `Library` | 程式庫 | 開機執行 init → 快取程式碼 → 程序銷毀 |

---

## 權限系統

### 權限層級

```
系統（sys_*）— 最高權限，可操作所有實體
    ↓
使用者（user_*）— USER_DEFAULT_PERMISSIONS 約束
    ↓
應用程式（app_*）— manifest.json 中宣告的權限
    ↓
插件（plugin_*）— 插件 permissions 宣告的權限
```

### 權限匹配規則

```
'*'             → 匹配所有權限
'file.*'        → 匹配 file.read.sys, file.write.app 等
'file.read.sys' → 精確匹配
```

### 動態權限

```
event.subscribe.<eventName>    例如 event.subscribe.process.started
event.emit.<eventName>         例如 event.emit.window.ui
process.launch.<appDefId>      限制可啟動的應用
file.<action>.<tier>           file.read.app, file.write.user 等
```

---

## 儲存系統

### 分層架構

| Tier | 容量 | 用途 | 典型內容 |
|------|-----|------|---------|
| `sys` | 256 | 系統設定 | 主題、語言、網路設定 |
| `app` | 384 | 應用資料 | 各 App 的持久化資料 |
| `user` | 256 | 使用者資料 | 使用者文件、偏好 |
| `cache` | 128 | 暫存 | 可隨時清除 |

### 路徑格式

```
[tier:][@namespace/]filename

範例：
  app:config.json           → tier=app, key=config.json
  user:notes/todo.txt       → tier=user, key=notes/todo.txt
  sys:theme-settings        → tier=sys, key=theme-settings
  @other-app/shared.json    → 跨應用存取（需 file.cross-app 權限）
```

### 底層實作

使用 `localStorage` 持久化，key 格式為 `sentryos:{ownerAppId}:{tier}:{key}`。

---

## 事件系統

### 內建事件

| 事件 | 觸發時機 | 載荷 |
|------|---------|------|
| `service.health` | Service 發布健康狀態 | `{ pid, health }` |
| `window.ui` | 視窗 UI 事件 | `{ pid, name, payload }` |
| `console.output` | Console 輸出 | `{ pid, message }` |
| `console.input` | Console 輸入 | `{ pid, input }` |
| `process.started` | 程序啟動 | `{ pid, appDefId, type }` |
| `process.stopped` | 程序終止 | `{ pid, appDefId, type }` |
| `notification` | 通知事件 | 通知資訊 |
| `keyboard` | 鍵盤事件（無焦點視窗時） | `KeyboardEvent 屬性` |
| `language.changed` | 語言變更 | `{ locale }` |
| `theme.changed` | 主題變更 | `ThemeSettings` |

### 權限控制

```
訂閱事件 → 需要 event.subscribe.<eventName> 權限
發射事件 → 需要 event.emit.<eventName> 權限
```

---

## 目錄結構

```
apps/sentryos/src/
├── main.ts                    # 進入點
├── api/                       # Host API 模組（註冊到 RuntimeRegistry）
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
│   ├── ApplicationCatalog.ts  # manifest 解析
│   ├── ApplicationManager.ts  # 應用定義登錄
│   └── ApplicationLauncher.ts # 應用啟動/終止邏輯
├── audio/
│   └── AudioManager.ts        # 系統音訊管理
├── auth/
│   └── AuthProvider.ts        # 使用者驗證
├── bootstrap/
│   └── systemBootstrap.ts     # 開機流程
├── clipboard/
│   └── ClipboardManager.ts    # 跨應用剪貼簿
├── console/
│   ├── KernelConsole.ts       # 核心主控台
│   └── AnsiParser.ts          # ANSI 色碼解析
├── dialog/
│   └── DialogManager.ts       # 對話框管理
├── environment/
│   └── EnvironmentManager.ts  # 環境變數、程式庫、命令
├── events/
│   └── EventBus.ts            # 事件匯流排
├── kernel/
│   ├── Kernel.ts              # Service Locator
│   ├── constants.ts           # 常數定義
│   ├── permissions.ts         # 權限/事件常數
│   └── types.ts               # 共用型別
├── language/
│   ├── LanguageManager.ts     # 語系管理
│   └── systemPacks.ts         # 內建翻譯包
├── monitor/
│   └── SystemMonitor.ts       # 系統監控
├── network/
│   ├── AllowlistNetworkManager.ts
│   └── NetworkAdapter.ts      # 網路介面
├── notification/
│   ├── NotificationManager.ts
│   └── SystemAlert.ts         # 系統警告彈窗
├── permissions/
│   └── PermissionsManager.ts
├── plugin/
│   ├── PluginManager.ts       # 插件載入/卸載
│   └── PluginContext.ts       # 插件上下文
├── process/
│   ├── Process.ts
│   └── ProcessManager.ts
├── registry/
│   └── SystemRegistry.ts      # 角色/檔案類型登錄表
├── runtime/
│   ├── AdapterRuntime.ts      # 插件引擎橋接適配器
│   ├── BaseRuntime.ts         # 引擎無關的共用邏輯
│   ├── IRuntime.ts            # Runtime 介面定義
│   ├── QuickJsInit.ts         # QuickJS WASM 初始化
│   ├── RuntimeRegistry.ts     # 多引擎 + 中央 API 管理
│   ├── ScriptRuntime.ts       # QuickJS 引擎實作
│   └── types.ts               # Runtime 型別
├── storage/
│   └── FileSystem.ts          # 分層檔案系統（localStorage）
├── ui/
│   ├── Bios.ts                # 啟動/錯誤畫面
│   └── DesktopShell.ts        # 桌面環境
└── window/
    ├── WindowManager.ts        # 視窗管理
    ├── UiComponentRegistry.ts  # UI 元件 Registry
    ├── builtinComponents.ts    # 內建 UI 元件
    └── types.ts                # 視窗型別
```

---

## 文件索引

### 核心模組
- [RuntimeRegistry](../core/runtime-registry.md) — 中央 API 管理 + 多引擎
- [ScriptRuntime](../core/script-runtime.md) — QuickJS 沙箱引擎
- [PermissionsManager](../core/permissions-manager.md) — 權限管理
- [EventBus](../core/event-bus.md) — 事件匯流排
- [ProcessManager](../core/process-manager.md) — 程序管理
- [ApplicationCatalog](../core/application-catalog.md) — 清單載入
- [ApplicationManager](../core/application-manager.md) — 應用登錄
- [FileSystem](../core/file-system.md) — 分層儲存
- [WindowManager](../core/window-manager.md) — 視窗管理
- [EnvironmentManager](../core/environment-manager.md) — 環境管理
- [NotificationManager](../core/notification-manager.md) — 通知系統
- [SystemMonitor](../core/system-monitor.md) — 系統監控
- [NetworkManager](../core/network-manager.md) — 網路管理
- [共用型別](../core/types.md) — Result / Error 型別

### 開發指南
- [應用程式開發](../app-development/guide.md)
- [插件開發](../plugin-development/guide.md)
- [Host API 參考](../app-development/host-api.md)
- [Manifest 格式](../app-development/manifest.md)

### UI
- [BIOS](../ui/bios.md) — 啟動/錯誤畫面
- [DesktopShell](../ui/desktop-shell.md) — 桌面環境
- [視窗系統型別](../window-system/window-system.md)

### 型別定義
- [sentryos-sdk](../../packages/sdk/README.md) — TypeScript 型別定義與常數
