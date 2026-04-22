# sentryos-create

SentryOS 開發環境快速建立工具。一個指令即可生成插件或應用程式的完整專案骨架。

## 安裝

```bash
npm install -g sentryos-create
# 或直接使用 npx
npx sentryos-create [plugin|app]
```

## 使用方式

在 Monorepo 根目錄執行：

```bash
# 互動模式（推薦）
pnpm scaffold

# 直接建立 Plugin
pnpm scaffold:plugin

# 直接建立 App
pnpm scaffold:app
```

或直接呼叫：

```bash
node packages/sentryos-create/index.js [plugin|app]
```

## 功能

### 建立 Plugin

產生一個完整的 TypeScript 插件套件，位於 `packages/sentryos-plugin-<name>/`。

生成的檔案：

```
packages/sentryos-plugin-<name>/
├── package.json            # 套件設定（含 sentryos-sdk 依賴）
├── tsconfig.json           # TypeScript 開發設定
├── tsconfig.build.json     # TypeScript 建置設定
└── src/
    └── index.ts            # 插件入口（含 SentryPlugin 範本）
```

**下一步：**

```bash
cd packages/sentryos-plugin-<name>
pnpm install
pnpm build
```

在宿主應用程式的 `createSentryOS({ pluginInstances: [...] })` 中加入此插件實例：

```typescript
import myPlugin from 'sentryos-plugin-<name>';

createSentryOS({
    container: document.getElementById('app')!,
    pluginInstances: [myPlugin],
});
```

### 建立 App

產生一個 SentryOS 應用程式骨架，預設位於 `apps/sentryos/public/apps/<id>/`。

支援的 App 類型：

| 類型 | 說明 |
|------|------|
| `Window` | 視窗 GUI 應用程式 |
| `Console` | 終端 / Console 應用程式 |
| `Service` | 背景服務 |
| `Library` | 共用函式庫 |

支援的執行引擎：

| 引擎 | 副檔名 | 需要插件 |
|------|--------|---------|
| JavaScript（預設）| `.js` | — |
| Lua | `.lua` | `sentryos-plugin-lua-runtime` |
| Python | `.py` | `sentryos-plugin-python-runtime` |

生成的檔案：

```
apps/sentryos/public/apps/<id>/
├── manifest.json    # App 描述與權限宣告
└── main.js          # 應用程式入口（或 .lua / .py）
```

**下一步：**

在 `apps/sentryos/public/app.json` 加入 `"apps/<id>"` 後，啟動開發伺服器即可看到應用程式。

## 詳細文件

- [App 開發指南](../../docs/app-development/guide.md)
- [Host API 參考](../../docs/app-development/host-api.md)
- [Manifest 規格](../../docs/app-development/manifest.md)
- [Plugin 開發指南](../../docs/plugin-development/guide.md)
