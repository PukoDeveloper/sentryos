# WebFileSystemAdapter

**檔案**：`src/core/storage.ts`

記憶體內的虛擬檔案系統，以 Storage Tier 劃分容量。所有操作皆需通過權限檢查。

---

## Storage Tiers

| Tier | 預設容量（條目數） | 用途 |
|------|-------------------|------|
| `sys` | 256 | 系統資料 |
| `app` | 384 | 應用資料 |
| `user` | 256 | 使用者資料 |
| `cache` | 128 | 快取 |

總容量預設 1024 條目。

---

## API

| 方法 | 簽章 | 說明 |
|------|------|------|
| `read()` | `(appId, tier, key) → StorageResult<StorageEntry>` | 讀取條目 |
| `write()` | `(appId, tier, key, data, options?) → StorageResult<StorageEntry>` | 寫入條目 |
| `delete()` | `(appId, tier, key) → StorageResult<string>` | 刪除條目 |
| `list()` | `(appId, tier?) → StorageResult<StorageEntry[]>` | 列出條目（tier 可省略以列出所有可讀 tier） |
| `exists()` | `(appId, tier, key) → StorageResult<boolean>` | 檢查是否存在 |
| `usage()` | `(appId) → StorageResult<StorageUsage>` | 查詢各 tier 用量與容量 |
| `configureCapacity()` | `(tier, capacity) → StorageResult<number>` | 調整 tier 容量上限 |

---

## 權限要求

每個操作會檢查 `file.<action>.<tier>` 權限：

| 操作 | 所需權限範例 |
|------|-------------|
| 讀取 app tier | `file.read.app` |
| 寫入 user tier | `file.write.user` |
| 刪除 cache tier | `file.delete.cache` |
| 列出 sys tier | `file.list.sys` |

---

## StorageEntry

```typescript
interface StorageEntry<TData extends StorageData = StorageData> {
  key: string;
  tier: StorageTier;
  ownerAppId: string;
  data: TData;
  createdAt: number;    // timestamp
  updatedAt: number;    // timestamp
  metadata?: Record<string, string | number | boolean | null>;
}
```

---

## WriteOptions

```typescript
interface WriteOptions {
  metadata?: Record<string, string | number | boolean | null>;
  overwrite?: boolean;  // false 時，若 key 已存在會回傳 AlreadyExists
}
```

---

## StorageData 型別

```typescript
type StoragePrimitive = string | number | boolean | null;
type StorageData =
  | StoragePrimitive
  | StoragePrimitive[]
  | { [key: string]: StoragePrimitive | StoragePrimitive[] | StorageRecord };
```

---

## StorageUsage

```typescript
interface StorageUsage {
  totalEntries: number;
  totalCapacity: number;
  tiers: Record<StorageTier, { used: number; capacity: number }>;
}
```

---

## 錯誤代碼

| 錯誤 | 說明 |
|------|------|
| `PermissionDenied` | 缺少所需權限 |
| `NotFound` | key 不存在 |
| `AlreadyExists` | 寫入時 key 已存在且 `overwrite: false` |
| `CapacityExceeded` | tier 容量已滿 |
| `InvalidTier` | 無效的 tier 名稱 |
| `InvalidKey` | key 為空或包含 `..` |
| `UnknownError` | 未知錯誤 |
