# sentryos-sdk

SentryOS 的應用程式與插件開發 SDK，提供完整的型別定義和常數。

## 安裝

```bash
npm install sentryos-sdk
```

## 使用方式

### Plugin 開發

```js
/** @type {import('sentryos-sdk/plugin').SentryPlugin} */
export default {
  pluginName: 'my-plugin',
  pluginVersion: '1.0.0',
  permissions: ['event.*', 'ui.*'],

  setup(context) {
    context.registerApi('myApi', ({ pid }) => ({
      hello: () => `Hello from process ${pid}`,
    }));
  },

  teardown() {},
};
```

### App 開發

SDK 提供 `OS.*` 全域 API 的型別定義，可在 JSDoc 中引用：

```js
/** @type {import('sentryos-sdk').OsApi} */
const os = OS;
os.ui.createWindow({ title: 'My App', width: 400, height: 300 });
```

### 型別匯入

```ts
import type { SentryPlugin, PluginContext } from 'sentryos-sdk/plugin';
import type { OsApi, AppManifest } from 'sentryos-sdk/app';
import { Permissions, Events } from 'sentryos-sdk';
```

## 模組結構

| 路徑 | 說明 |
|------|------|
| `sentryos-sdk` | 完整匯出（所有型別 + 常數） |
| `sentryos-sdk/plugin` | Plugin 開發專用型別 (`SentryPlugin`, `PluginContext`) |
| `sentryos-sdk/app` | App 開發專用型別 (`OsApi`, `AppManifest`, `AppGlobals`) |
