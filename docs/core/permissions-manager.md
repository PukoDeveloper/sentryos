# PermissionsManager

**檔案**：`src/permissions/PermissionsManager.ts`

以萬用字元（wildcard）為基礎的權限系統。每個權限字串用 `.` 分隔階層，`*` 可匹配任何單一階段。

---

## 匹配規則

- `event.subscribe.*` 匹配 `event.subscribe.window.ui`
- `*` 匹配任何權限
- 已授予的節數不可超過被判定的節數

```
matchesPermission('event.subscribe.*', 'event.subscribe.window.ui')  → true
matchesPermission('*', 'anything.here')                               → true
matchesPermission('event.subscribe', 'event.subscribe.window.ui')     → false（節數不足）
```

---

## API

| 方法 | 簽章 | 說明 |
|------|------|------|
| `init()` | `() → PermissionResult` | 首次初始化，回傳 `systemAppId`（擁有 `*` 萬用權限） |
| `new()` | `(fromAppId, permissions[]) → PermissionResult` | 為新實例建立權限槽，回傳 `processAppId` |
| `has()` | `(appId, permission) → boolean` | 檢查是否擁有指定權限 |
| `grant()` | `(fromAppId, toAppId, permission) → PermissionResult` | 授予權限（需 `permission.manage-permissions`） |
| `revoke()` | `(fromAppId, toAppId, permission) → PermissionResult` | 撤銷權限 |
| `removeApp()` | `(fromAppId, targetAppId) → PermissionResult` | 移除整個權限槽（需 `permission.remove-app`） |
| `getPermissions()` | `(fromAppId, targetAppId) → PermissionResult` | 查詢目標應用的所有權限 |

---

## 初始化

`init()` 只能呼叫一次，會建立系統級 `systemAppId`，該憑證擁有 `*` 萬用權限。後續所有程序的權限槽都必須由擁有 `permission.new-app` 權限的憑證建立。

---

## 權限繼承

`new()` 在建立新權限槽時，會逐一檢查 `fromAppId` 是否擁有傳入的每項權限（透過 `has()` 的萬用字元匹配）。只有 `fromAppId` 實際擁有的權限才會被授予新槽。

---

## 常見權限字串

| 權限 | 用途 |
|------|------|
| `*` | 萬用，匹配所有權限（系統專用） |
| `permission.new-app` | 允許建立新權限槽 |
| `permission.remove-app` | 允許移除權限槽 |
| `permission.manage-permissions` | 允許 grant/revoke/getPermissions |
| `process.launch.<appDefId>` | 允許啟動指定應用 |
| `process.terminate` | 允許終止程序 |
| `process.list` | 允許列出所有程序 |
| `event.subscribe.<event>` | 允許訂閱指定事件 |
| `event.emit.<event>` | 允許發送指定事件 |
| `file.read.<tier>` | 允許讀取指定 tier |
| `file.write.<tier>` | 允許寫入指定 tier |
| `process.ipc.send-parent` | 允許 IPC 傳訊給父程序 |
| `process.ipc.send-child` | 允許 IPC 傳訊給子程序 |
| `window.create` | 允許建立視窗 |
| `console.write` | 允許 Console 輸出 |
| `console.read` | 允許 Console 輸入 |
| `env.read` | 允許讀取環境變數 |
| `env.write` | 允許寫入環境變數 |
| `env.autostart` | 允許管理自動啟動 |
| `env.library.load` | 允許載入程式庫 |
| `storage.usage` | 允許查詢儲存用量 |
| `notification.send` | 允許發送通知 |
| `monitor.read` | 允許讀取系統監控數據 |
| `shell.apps` | 允許列出已註冊應用 |
| `shell.launch` | 允許啟動應用 |
| `shell.windows` | 允許列出開啟中視窗 |
| `shell.sysinfo` | 允許取得系統資訊 |
| `service.publish-health` | 允許發送服務健康狀態 |
