# ApplicationCatalog

**檔案**：`src/application/ApplicationCatalog.ts`

負責從 `public/app.json` 讀取應用清單，逐一 fetch 各 app 的 `manifest.json`，支援 **PackageManifest**（多應用套件）與 **LegacyManifest**（單一應用）兩種格式，解析為 `RegisteredApplication` 陣列。

---

## API

| 函式 | 簽章 | 說明 |
|------|------|------|
| `loadApplicationCatalog()` | `() → Promise<ApplicationCatalogResult<RegisteredApplication[]>>` | 載入並解析所有已註冊的應用 |

---

## 載入流程

1. `fetch('/app.json')` 取得應用路徑陣列（如 `["app/stdlib", "app/example"]`）
2. 對每個條目呼叫 `normalizeCatalogEntry()` 解析為 manifest 路徑
3. `fetch(manifestPath)` 取得各 manifest
4. 自動判別格式：
   - 若含 `apps` 陣列 → **PackageManifest**：逐一驗證 `isValidAppEntry()`，轉換為 `RegisteredApplication`
   - 否則 → **LegacyManifest**：驗證 `isLegacyManifest()`，轉換為 `RegisteredApplication`
5. 組合所有結果為 `RegisteredApplication[]`

---

## Manifest 格式

詳見 [Manifest 格式文件](../app-development/manifest.md)。

### PackageManifest（多應用套件）

```typescript
type PackageManifest = {
  name: string;           // 套件名稱
  version: string;
  description?: string;
  author?: string;
  apps: AppEntryManifest[];
};

type AppEntryManifest = {
  id: string;             // 套件內唯一 ID
  name: string;
  main: string;
  type?: AppType;         // 'Window' | 'Service' | 'Console' | 'Library'
  icon?: string;
  permissions?: string[];
  maxInstances?: number;
  autoStart?: boolean;
};
```

### LegacyManifest（單一應用，向下相容）

```typescript
type LegacyManifest = {
  name: string;
  description?: string;
  version: string;
  author?: string;
  main: string;
  icon?: string;
  type?: AppType;
  permissions?: string[];
  maxInstances?: number;
};
```

---

## 路徑解析規則

### Manifest 路徑

`app.json` 中的條目會經由 `normalizeCatalogEntry()` 轉換：

| 輸入 | 輸出 |
|------|------|
| `"app/example"` | `/apps/example/manifest.json` |
| `"apps/example"` | `/apps/example/manifest.json` |
| `"apps/example/manifest.json"` | `/apps/example/manifest.json` |

### Icon / Main 路徑

Icon 與 Main 路徑會自動拼接為完整路徑：`${basePath}/${filename}`
例如 `/apps/example/icon.svg`、`/apps/example/main.js`

---

## RegisteredApplication

繼承 `Application` 並擴展：

```typescript
type RegisteredApplication = Application & {
  packageName: string;      // 套件名稱
  entryPath: string;        // manifest 所在目錄（如 /apps/example）
  mainPath: string;         // 入口腳本完整路徑（如 /apps/example/main.js）
  description?: string;
  author?: string;
  icon?: string;            // 完整 icon 路徑
  runtimeType: AppType;     // 'Service' | 'Window' | 'Console' | 'Library'
  autoStart: boolean;       // 是否自動啟動
};
```

### autoStart 預設值

若 manifest 未指定 `autoStart`，依 `type` 自動設定：

| 類型 | 預設 autoStart |
|------|---------------|
| `Library` | `true` |
| `Service` | `true` |
| `Window` | `false` |
| `Console` | `false` |

---

## Manifest 驗證規則

### PackageManifest（`isPackageManifest`）

- 含 `apps` 陣列 + `name`（string）+ `version`（string）

### AppEntryManifest（`isValidAppEntry`）

- `id`：非空字串
- `name`：非空字串
- `main`：非空字串
- `permissions`：若存在必須是陣列

### LegacyManifest（`isLegacyManifest`）

- `name`：非空字串
- `version`：string
- `main`：非空字串

---

## 錯誤代碼

| 錯誤 | 說明 |
|------|------|
| `ManifestNotFound` | app.json 或個別 manifest 的 fetch 失敗 |
| `InvalidManifest` | manifest 格式驗證失敗 |
| `LoadFailed` | 載入過程發生例外 |
