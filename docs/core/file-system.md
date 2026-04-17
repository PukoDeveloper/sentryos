# FileSystem

**檔案**：`src/storage/FileSystem.ts`

分層儲存系統，以 `StorageTier` 區分不同用途的儲存區域，使用 `localStorage` 持久化。

---

## StorageTier

| Tier | 預設容量 | 用途 |
|------|---------|------|
| `sys` | 256 | 系統設定 |
| `app` | 384 | 應用程式資料 |
| `user` | 256 | 使用者資料 |
| `cache` | 128 | 快取 |

總容量預設 `1024`（定義於 `STORAGE_TOTAL_CAPACITY`）。

---

## API（FileSystemAdapter）

| 方法 | 簽章 | 說明 |
|------|------|------|
| `read()` | `(appId, tier, key) → StorageResult<StorageEntry>` | 讀取 |
| `write()` | `(appId, tier, key, data, options?) → StorageResult<StorageEntry>` | 寫入 |
| `delete()` | `(appId, tier, key) → StorageResult<string>` | 刪除 |
| `list()` | `(appId, tier?) → StorageResult<StorageEntry[]>` | 列出（可指定 tier 或全部） |
| `listByPrefix()` | `(appId, tier, prefix) → StorageResult<StorageEntry[]>` | 以 key 前綴列出 |
| `exists()` | `(appId, tier, key) → StorageResult<boolean>` | 檢查是否存在 |
| `usage()` | `(appId) → StorageResult<StorageUsage>` | 查詢使用量 |
| `configureCapacity()` | `(appId, tier, capacity) → StorageResult<number>` | 調整容量，需 `FILE_ADMIN_CONFIGURE` 權限 |

---

## WriteOptions

```typescript
interface WriteOptions {
  metadata?: Record<string, string | number | boolean | null>;
  overwrite?: boolean;       // 預設 true；false 時若已存在回傳 AlreadyExists
  ownerLabel?: string;       // 若提供，寫入時以此作為 ownerAppId（穩定的擁有者識別）
}
```

---

## StorageEntry

```typescript
interface StorageEntry<TData extends StorageData = StorageData> {
  key: string;
  tier: StorageTier;
  ownerAppId: string;
  data: TData;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, string | number | boolean | null>;
}
```

---

## 權限模型

每個操作都需要對應的 tier 權限：
- `file.read.{tier}` / `file.write.{tier}` / `file.delete.{tier}` / `file.list.{tier}`
- `configureCapacity()` 需要 `file.admin.configure-capacity`

權限由 `Permissions.fileAction(action, tier)` 產生。

---

## 錯誤類型

| 錯誤 | 說明 |
|------|------|
| `PermissionDenied` | 無對應 tier 的操作權限 |
| `NotFound` | key 不存在 |
| `AlreadyExists` | `overwrite: false` 時 key 已存在 |
| `CapacityExceeded` | 超過 tier 容量 |
| `InvalidTier` | 無效的 tier 名稱 |
| `InvalidKey` | key 為空或包含 `..` |
| `UnknownError` | 其他錯誤 |
