# SentryOS 型別定義檔

本資料夾集中管理所有 API 型別定義與宣告檔案，供插件開發者與應用程式開發者參考。

`sentryos-plugin.d.ts` 為自包含的型別宣告檔案，涵蓋插件開發與內核服務的完整型別，**無需查閱原始碼即可進行開發**。

---

## 檔案索引

| 檔案 | 說明 |
|------|------|
| [sentryos-plugin.d.ts](./sentryos-plugin.d.ts) | 完整 SDK 型別宣告 |

---

## sentryos-plugin.d.ts 內容概覽

### 插件開發

| 型別 | 說明 |
|------|------|
| `SentryPlugin` | 插件 default export 介面（含 `dependencies` 依賴宣告） |
| `PluginContext` | 插件上下文（事件、API/UI/Runtime 註冊、Kernel 存取） |

### Runtime API

| 型別 | 說明 |
|------|------|
| `ApiFactory` / `ApiFactoryContext` | Host API 工廠函式與程序資訊 |
| `ProcessView` / `HostApiValue` | 程序視圖、API 值型別 |
| `IRuntime` / `RuntimeResult` | Runtime 引擎介面（自訂語言引擎需實作） |

### UI 元件

| 型別 | 說明 |
|------|------|
| `WindowUiNode` / `WindowUiNodePatch` | UI 節點與更新描述 |
| `WindowUiStyle` / `WindowUiEvent` | 樣式與事件型別 |
| `UiComponentRenderer` / `RenderContext` | 自訂 UI 元件渲染介面 |
| `UiComponentApiBuilder` | QuickJS 端節點建構器 |

### 內核服務型別

| 型別 | 對應 `context.resolve()` 鍵值 |
|------|------|
| `PermissionsManager` | `permissions` |
| `EventBus` | `eventBus` |
| `ApplicationManager` | `appManager` |
| `ProcessManager` | `processManager` |
| `FileSystemAdapter` | `fileSystem` |
| `WindowManager` | `windowManager` |
| `EnvironmentManager` | `environmentManager` |
| `NotificationManager` | `notificationManager` |
| `SystemMonitor` | `systemMonitor` |
| `DesktopShell` | `desktopShell` |
| `ApplicationLauncher` | `applicationLauncher` |
| `NetworkAdapter` | `networkManager` |
| `SystemRegistry` | `systemRegistry` |
| `DialogManager` | `dialogManager` |
| `PluginManager` | `pluginManager` |
| `RuntimeRegistry` | `runtimeRegistry` |
| `LanguageManager` | `languageManager` |

### 常數

| 型別 | 說明 |
|------|------|
| `Permissions` | 所有權限字串常數（含動態權限函式） |
| `Events` | 系統內建事件名稱常數 |

### 共用型別

| 型別 | 說明 |
|------|------|
| `Result` / `EventBusResult` | 通用結果型別 |
| `StorageTier` / `StorageEntry` | 儲存系統型別 |
| `WindowState` / `WindowSystemResult` | 視窗系統型別 |
| `NetworkRequest` / `NetworkResponse` | 網路型別 |
| `DialogOptions` / `DialogResult` | 對話框型別 |
| `RegisteredApplication` | 已註冊應用程式完整資訊 |

---

## 原始碼型別定義參考

以下型別定義位於 `src/` 目錄中，為系統內部使用的完整型別（含實作細節）：

| 檔案 | 說明 |
|------|------|
| `src/kernel/types.ts` | 共用 Result / Error 型別 |
| `src/kernel/constants.ts` | 系統常數、視窗預設值、ID 前綴 |
| `src/kernel/permissions.ts` | 權限常數、事件名稱、使用者預設權限 |
| `src/window/types.ts` | 視窗系統完整型別（含 DOM 描述） |
| `src/runtime/types.ts` | Runtime 型別（含 QuickJS 內部狀態） |
| `src/runtime/IRuntime.ts` | Runtime 引擎公開介面 |

---

## 使用方式

### 插件開發者

在插件 JavaScript 檔案中使用 JSDoc 型別標註：

```javascript
/** @type {import('./sentryos-plugin').SentryPlugin} */
export default {
  pluginName: 'my-plugin',
  pluginVersion: '1.0.0',
  pluginDescription: 'My awesome plugin',
  permissions: ['event.*', 'ui.*'],
  dependencies: [],  // 依賴的其他插件名稱

  setup(context) {
    // 註冊 Host API
    context.registerApi('myApi', ({ pid, process }) => ({
      hello: () => `Hello from ${pid}`,
    }));

    // 註冊 UI 元件
    context.registerUiComponent('my-widget', renderer, apiBuilder);

    // 註冊 Runtime 引擎
    context.registerRuntime('lua', luaRuntime);

    // 訂閱事件
    context.on('process.started', (data) => {
      context.log('INFO', `Process started: ${JSON.stringify(data)}`);
    });

    // 存取內核服務
    const fs = context.resolve('fileSystem');
    const eventBus = context.resolve('eventBus');
  },

  teardown(context) {
    // 自動 cleanup，僅需處理插件內部狀態
  },
};
```

### 應用程式開發者

應用程式在 QuickJS 沙箱中執行，透過 `OS` 全域物件存取 Host API。
詳見 [Host API 參考](../app-development/host-api.md)。
