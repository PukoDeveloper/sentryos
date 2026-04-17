# Manifest 格式

應用程式透過 `manifest.json` 描述套件資訊與包含的應用程式。系統支援兩種格式。

---

## PackageManifest（推薦格式）

```json
{
  "name": "my-package",
  "version": "1.0.0",
  "description": "套件說明",
  "author": "Author Name",
  "permissions": ["file.read.app", "file.write.app"],
  "apps": [
    {
      "id": "my-app",
      "name": "My App",
      "main": "main.js",
      "type": "Window",
      "icon": "icon.svg",
      "permissions": ["window.create"],
      "maxInstances": 0,
      "autoStart": false,
      "hidden": false,
      "engine": "quickjs",
      "commands": [
        {
          "name": "mycommand",
          "description": "執行某個功能",
          "usage": "mycommand [args]"
        }
      ]
    }
  ]
}
```

### 欄位說明

**套件層級：**

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `name` | string | ✓ | 套件名稱 |
| `version` | string | ✓ | 版本號 |
| `description` | string | | 套件說明 |
| `author` | string | | 作者 |
| `permissions` | string[] | | 套件層級預設權限（各 app 未定義時繼承） |
| `apps` | AppEntry[] | ✓ | 包含的應用程式列表 |

**應用程式層級：**

| 欄位 | 型別 | 必填 | 預設值 | 說明 |
|------|------|------|--------|------|
| `id` | string | ✓ | | 應用程式 ID（manifest 內唯一） |
| `name` | string | ✓ | | 顯示名稱 |
| `main` | string | ✓ | | 主程式檔案路徑 |
| `type` | AppType | | `'Window'` | 應用程式類型 |
| `icon` | string | | | 圖示檔案路徑 |
| `permissions` | string[] | | 繼承套件 | 應用程式專屬權限 |
| `maxInstances` | number | | 不限 | 最大實例數（1 = 單例） |
| `autoStart` | boolean | | Service/Library: true | 是否自動啟動 |
| `hidden` | boolean | | `false` | 隱藏於啟動選單 |
| `engine` | string | | `'quickjs'` | Runtime 引擎識別字串 |
| `commands` | Command[] | | | 靜態宣告命令（Library 用） |

---

## LegacyManifest（舊格式，向下相容）

```json
{
  "name": "Legacy App",
  "version": "1.0.0",
  "main": "main.js",
  "description": "說明",
  "author": "Author",
  "icon": "icon.svg",
  "type": "Window",
  "permissions": ["window.create"],
  "maxInstances": 0
}
```

舊格式會自動轉換為單一 app 的 `RegisteredApplication`。

---

## AppType

```typescript
type AppType = 'Service' | 'Window' | 'Console' | 'Library';
```

- **Window**：有視窗的圖形應用程式
- **Service**：背景服務（自動啟動）
- **Console**：主控台應用程式
- **Library**：程式庫（自動啟動，可宣告命令）

---

## 權限繼承

解析順序：`app.permissions` → `package.permissions` → `[]`

若 app 層級有定義 `permissions`，則忽略套件層級。
