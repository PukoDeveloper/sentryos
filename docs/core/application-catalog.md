# ApplicationCatalog

**檔案**：`src/application/ApplicationCatalog.ts`

負責從 `/app.json` 載入應用程式清單，解析套件清單（PackageManifest）或舊格式清單（LegacyManifest），產生 `RegisteredApplication[]`。

---

## 載入流程

1. Fetch `/app.json` 取得 entry 路徑陣列
2. 對每個 entry，fetch 對應的 `manifest.json`
3. 依格式判斷為 PackageManifest 或 LegacyManifest
4. 轉換為 `RegisteredApplication` 陣列

---

## PackageManifest（套件清單）

```typescript
type PackageManifest = {
  name: string;
  version: string;
  description?: string;
  author?: string;
  permissions?: string[];     // 套件層級權限（所有 app 共用預設）
  apps: AppEntryManifest[];
};
```

---

## AppEntryManifest（單一應用程式）

```typescript
type AppEntryManifest = {
  id: string;
  name: string;
  main: string;
  type?: AppType;            // 'Window' | 'Service' | 'Console' | 'Library'，預設 'Window'
  icon?: string;
  permissions?: string[];    // 優先於套件層級權限
  maxInstances?: number;
  autoStart?: boolean;
  hidden?: boolean;          // 隱藏於啟動選單
  engine?: string;           // Runtime 引擎識別字串，預設 'quickjs'
  commands?: ManifestCommand[];  // Library 可靜態宣告命令
};

type ManifestCommand = {
  name: string;
  description: string;
  usage?: string;
};
```

---

## LegacyManifest（舊格式）

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

## RegisteredApplication

```typescript
type RegisteredApplication = Application & {
  packageName: string;
  manifestId?: string;       // manifest 中的 app id
  entryPath: string;         // 套件根目錄路徑
  mainPath: string;          // 完整主程式路徑
  description?: string;
  author?: string;
  icon?: string;
  runtimeType: AppType;
  autoStart: boolean;        // Service/Library 預設 true
  hidden: boolean;
  engine?: string;           // Runtime 引擎識別字串
  commands?: ManifestCommand[];
};
```

---

## 權限繼承

`permissions` 解析順序：`app.permissions ?? package.permissions ?? []`

---

## Icon 解析

- 若 icon 值含副檔名（`/\.[a-z0-9]+$/i`）→ 以 basePath 拼接
- 否則 → 使用預設圖示 `/default-app-icon.svg`

---

## 錯誤類型

| 錯誤 | 說明 |
|------|------|
| `ManifestNotFound` | manifest.json 載入失敗 |
| `InvalidManifest` | manifest 格式不正確 |
| `LoadFailed` | 載入過程異常 |
