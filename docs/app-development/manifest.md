# 應用程式 Manifest 格式

每個應用程式套件須在 `public/apps/<package-name>/` 目錄下提供 `manifest.json`。

系統支援兩種格式：**套件清單（Package Manifest）** 與 **單一應用清單（Legacy Manifest）**。

---

## 套件清單格式（Package Manifest）

一個套件可包含多個應用程式（Window、Service、Console、Library）。

### 範例

```json
{
  "name": "stdlib",
  "version": "0.1.0",
  "description": "SentryOS 標準函式庫",
  "author": "SentryOS Team",
  "apps": [
    {
      "id": "stdlib-math",
      "name": "Math Utils",
      "main": "math.js",
      "type": "Library",
      "permissions": ["env.read", "env.write"]
    },
    {
      "id": "stdlib-string",
      "name": "String Utils",
      "main": "string.js",
      "type": "Library",
      "permissions": ["env.read", "env.write"]
    }
  ]
}
```

### 套件層級欄位

| 欄位 | 必填 | 型別 | 說明 |
|------|------|------|------|
| `name` | ✅ | `string` | 套件名稱（作為 `packageName` 儲存） |
| `version` | ✅ | `string` | 套件版本號 |
| `description` | ❌ | `string` | 套件描述 |
| `author` | ❌ | `string` | 作者名稱 |
| `apps` | ✅ | `AppEntryManifest[]` | 應用程式陣列 |

### 應用項目欄位（AppEntryManifest）

| 欄位 | 必填 | 型別 | 說明 |
|------|------|------|------|
| `id` | ✅ | `string` | 套件內的唯一識別碼 |
| `name` | ✅ | `string` | 應用名稱（顯示在開始選單） |
| `main` | ✅ | `string` | 入口腳本檔名（相對於 manifest 目錄） |
| `type` | ❌ | `AppType` | 程序類型：`'Window'`（預設）、`'Service'`、`'Console'`、`'Library'` |
| `icon` | ❌ | `string` | 圖示檔案（相對路徑） |
| `permissions` | ❌ | `string[]` | 權限陣列 |
| `maxInstances` | ❌ | `number` | 最大同時執行實例數（`0` 或省略 = 不限；`1` = 單例模式） |
| `autoStart` | ❌ | `boolean` | 是否開機自動啟動（省略時依 type 決定預設值） |

### autoStart 預設值

| 類型 | 預設 autoStart |
|------|---------------|
| `Library` | `true` |
| `Service` | `true` |
| `Window` | `false` |
| `Console` | `false` |

---

## 單一應用清單格式（Legacy Manifest）

向下相容的格式，一個 manifest 對應一個應用。

### 範例

```json
{
  "name": "My App",
  "description": "App description",
  "version": "1.0.0",
  "author": "Author Name",
  "main": "main.js",
  "icon": "icon.svg",
  "type": "Window",
  "permissions": [
    "event.subscribe.window.ui",
    "event.emit.window.ui"
  ],
  "maxInstances": 1
}
```

### 欄位說明

| 欄位 | 必填 | 型別 | 說明 |
|------|------|------|------|
| `name` | ✅ | `string` | 應用名稱（同時作為 `packageName`） |
| `version` | ✅ | `string` | 版本號 |
| `main` | ✅ | `string` | 入口腳本檔名（相對於 manifest 目錄） |
| `description` | ❌ | `string` | 描述（顯示在開始選單項目下方） |
| `author` | ❌ | `string` | 作者名稱 |
| `icon` | ❌ | `string` | 圖示檔案（相對路徑，支援 SVG/PNG） |
| `type` | ❌ | `AppType` | 程序類型：`'Window'`（預設）、`'Service'`、`'Console'`、`'Library'` |
| `permissions` | ❌ | `string[]` | 權限陣列 |
| `maxInstances` | ❌ | `number` | 最大同時執行實例數 |

---

## 格式自動判別

系統透過以下規則區分格式：

- 若 JSON 物件包含 `apps` 陣列，且含 `name` 與 `version`，視為 **PackageManifest**
- 若 JSON 物件包含 `name`、`version`、`main`，視為 **LegacyManifest**

---

## 驗證規則

### PackageManifest

- `name`：必須是非空字串
- `version`：必須是非空字串
- `apps`：必須是陣列
- 每個 app entry 中的 `id`、`name`、`main`：必須是非空字串
- `permissions`：若存在，必須是陣列

### LegacyManifest

- `name`：必須是非空字串
- `version`：必須是非空字串
- `main`：必須是非空字串
- `permissions`：若存在，必須是陣列

---

## 路徑解析

### Manifest 路徑

在 `public/app.json` 中的條目會被自動解析：

| 輸入格式 | 解析結果 |
|---------|---------|
| `"app/my-app"` | `/apps/my-app/manifest.json` |
| `"apps/my-app"` | `/apps/my-app/manifest.json` |
| `"apps/my-app/manifest.json"` | `/apps/my-app/manifest.json` |

### Icon 路徑

`icon` 欄位的值會被拼接為完整路徑：`${manifest 目錄}/${icon}`

例如：`icon: "icon.svg"` → `/apps/my-app/icon.svg`

### Main 路徑

同理：`main: "main.js"` → `/apps/my-app/main.js`

---

## RegisteredApplication

載入後的應用會被解析為 `RegisteredApplication` 物件：

```typescript
type RegisteredApplication = Application & {
  packageName: string;      // 套件名稱（PackageManifest.name 或 LegacyManifest.name）
  entryPath: string;        // manifest 所在目錄（如 /apps/example）
  mainPath: string;         // main.js 完整路徑（如 /apps/example/main.js）
  description?: string;
  author?: string;
  icon?: string;            // 完整 icon 路徑
  runtimeType: AppType;     // 'Service' | 'Window' | 'Console' | 'Library'
  autoStart: boolean;       // 是否自動啟動
};
```

---

## 內建範例

### Example 套件（多應用）

```json
{
  "name": "example",
  "version": "1.0.0",
  "description": "Example applications for SentryOS",
  "author": "SentryOS Team",
  "apps": [
    {
      "id": "example-app",
      "name": "Example App",
      "main": "main.js",
      "type": "Window",
      "icon": "icon.svg",
      "permissions": ["event.subscribe.window.ui", "event.emit.window.ui"],
      "maxInstances": 1
    },
    {
      "id": "example-console",
      "name": "Console Demo",
      "main": "console.js",
      "type": "Console",
      "permissions": [
        "console.write", "console.read",
        "env.read", "env.write", "env.library.load",
        "process.list", "process.terminate",
        "shell.apps", "shell.launch", "shell.windows", "shell.sysinfo"
      ]
    }
  ]
}
```

### stdlib 套件（純 Library）

```json
{
  "name": "stdlib",
  "version": "0.1.0",
  "description": "SentryOS standard library",
  "author": "SentryOS Team",
  "apps": [
    {
      "id": "stdlib-math",
      "name": "Math Utils",
      "main": "math.js",
      "type": "Library",
      "permissions": ["env.read", "env.write"]
    },
    {
      "id": "stdlib-string",
      "name": "String Utils",
      "main": "string.js",
      "type": "Library",
      "permissions": ["env.read", "env.write"]
    }
  ]
}
```
