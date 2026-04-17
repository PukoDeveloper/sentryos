# PermissionsManager

**檔案**：`src/permissions/PermissionsManager.ts`

管理應用程式的權限。所有權限字串集中定義於 `src/kernel/permissions.ts`。

---

## API

| 方法 | 簽章 | 說明 |
|------|------|------|
| `init()` | `() → PermissionResult` | 初始化並建立 systemAppId（持有萬用字元權限） |
| `createUser()` | `(fromAppId, permissions) → PermissionResult` | 建立使用者權限實體，需 `MANAGE_PERMISSIONS` |
| `new()` | `(fromAppId, permissions) → PermissionResult` | 為新應用程式建立權限（子集繼承） |
| `registerAppId()` | `(fromAppId, appId, permissions) → PermissionResult` | 以指定 appId 直接註冊權限實體，需 `MANAGE_PERMISSIONS` |
| `has()` | `(appId, permission) → boolean` | 檢查是否持有某權限（支援萬用字元匹配） |
| `hasAnyUnder()` | `(appId, namespace) → boolean` | 檢查是否持有指定命名空間下的任一權限 |
| `grant()` | `(fromAppId, toAppId, permission) → PermissionResult` | 授予權限，需 `MANAGE_PERMISSIONS` |
| `revoke()` | `(fromAppId, toAppId, permission) → PermissionResult` | 撤銷權限，需 `MANAGE_PERMISSIONS` |
| `removeApp()` | `(fromAppId, targetAppId) → PermissionResult` | 移除整個應用程式的權限，需 `REMOVE_APP` |
| `getPermissions()` | `(fromAppId, targetAppId) → PermissionResult` | 取得目標的所有權限，需 `MANAGE_PERMISSIONS` |

---

## 權限匹配規則

`matchesPermission(granted, required)` 會依 `.` 分段比對，支援 `*` 萬用字元：

- `*` 匹配所有權限
- `file.*` 匹配 `file.read.sys`、`file.write.app` 等
- `file.read.sys` 僅匹配完全相同的權限

---

## ID 前綴

| 前綴 | 說明 |
|------|------|
| `sys_` | 系統 ID（init 時建立） |
| `user_` | 使用者 ID（createUser 建立） |
| `app_` | 應用程式實例 ID（new 建立） |

---

## createUser()

```typescript
createUser(fromAppId: string, permissions: string[]): PermissionResult
```

需要 `MANAGE_PERMISSIONS` 權限。建立 `user_` 前綴的使用者實體，權限由呼叫者明確指定（不做子集過濾）。

---

## registerAppId()

```typescript
registerAppId(fromAppId: string, appId: string, permissions: string[]): PermissionResult
```

以指定的 `appId` 直接註冊權限實體（用於插件等內部機制）。需要 `MANAGE_PERMISSIONS` 權限。若該 appId 已存在則回傳錯誤。

---

## hasAnyUnder()

```typescript
hasAnyUnder(appId: string, namespace: string): boolean
```

檢查 appId 是否持有 `namespace` 下的任一權限。例如 `hasAnyUnder(id, 'file')` 會檢查是否有 `file.*`、`file.read.sys` 等。

---

## 錯誤類型

| 錯誤 | 說明 |
|------|------|
| `PermissionDenied` | 呼叫者無足夠權限 |
| `InvalidPermission` | 無效權限 |
| `NotInitialized` | 尚未呼叫 init() |
| `UnknownError` | 目標 appId 不存在或已存在（registerAppId） |
