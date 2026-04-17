# SentryOS 型別定義檔

本資料夾集中管理所有 API 型別定義與宣告檔案，供插件開發者與應用程式開發者參考。

---

## 檔案索引

| 檔案 | 說明 |
|------|------|
| [sentryos-plugin.d.ts](./sentryos-plugin.d.ts) | 插件開發 SDK 型別宣告（`SentryPlugin`、`PluginContext`、`ServiceMap`、`ValueMap` 等） |

---

## 原始碼型別定義參考

以下型別定義位於 `src/` 目錄中，非獨立發佈檔案，但為系統的核心型別：

| 檔案 | 說明 |
|------|------|
| `src/kernel/types.ts` | 共用 Result / Error 型別（`Result`、`EventBusResult`、`PermissionResult`、`ProcessResult`） |
| `src/kernel/constants.ts` | 系統常數、權限字串（`Permissions`）、事件名稱（`Events`） |
| `src/kernel/permissions.ts` | 權限定義與預設使用者權限 |
| `src/window/types.ts` | 視窗系統型別（`WindowDescriptor`、`WindowInitOptions`、`WindowUiNode`、`WindowLifecycleEvent` 等） |
| `src/runtime/types.ts` | Runtime 型別（`RuntimeProcess`、`ProcessView`、`ApiFactory`、`Message` 等） |

---

## 使用方式

### 插件開發者

在插件 JavaScript 檔案中使用 JSDoc 型別標註：

```javascript
/** @type {import('./sentryos-plugin').SentryPlugin} */
export default {
  pluginName: 'my-plugin',
  pluginVersion: '1.0.0',
  setup(context) { /* ... */ },
  teardown(context) { /* ... */ },
};
```

### 應用程式開發者

應用程式在 QuickJS 沙箱中執行，透過 `OS` 全域物件存取 Host API。
詳見 [Host API 參考](../app-development/host-api.md)。
