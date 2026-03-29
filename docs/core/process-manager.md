# ProcessManager

**檔案**：`src/process/ProcessManager.ts`（程序模型：`src/process/Process.ts`）

程序（Process）的生命週期管理器。每次 `launch()` 會建立一個 `Process` 實例，具有獨立的 `processAppId`（權限憑證 ID）。支援父子程序關係與遞迴終止。

---

## API

| 方法 | 簽章 | 說明 |
|------|------|------|
| `launch()` | `(callerAppId, appDefId, options?) → ProcessResult` | 啟動新實例 |
| `terminate()` | `(callerAppId, pid) → ProcessResult` | 遞迴終止程序及所有子程序 |
| `suspend()` | `(callerAppId, pid) → ProcessResult` | 暫停程序 |
| `resume()` | `(callerAppId, pid) → ProcessResult` | 恢復程序 |
| `get()` | `(pid) → Process \| undefined` | 依 PID 查詢 |
| `getByProcessAppId()` | `(processAppId) → Process \| undefined` | 依權限憑證 ID 反查（用於視窗關閉時的清理） |
| `getByApp()` | `(appDefId) → Process[]` | 取得某應用所有執行中實例 |

---

## LaunchOptions

```typescript
interface LaunchOptions {
  type?: 'Service' | 'Window' | 'Console';  // 預設 'Service'
  parentPid?: number;                        // 指定父程序 PID
}
```

---

## Process 物件

| 屬性 | 型別 | 說明 |
|------|------|------|
| `pid` | `number` | 唯一 PID（從 1 遞增） |
| `appDefId` | `string` | 對應 ApplicationManager 的 appId |
| `processAppId` | `string` | 此實例在 Permissions/EventBus 中的唯一憑證 |
| `type` | `'Service' \| 'Window' \| 'Console'` | 程序類型 |
| `parentPid` | `number \| null` | 父程序 PID（null 表示根程序） |
| `status` | `'running' \| 'stopped' \| 'suspended'` | 當前狀態 |
| `children` | `Set<number>` | 直屬子程序 PID 集合 |

---

## Launch 流程

1. **權限檢查**：`callerAppId` 需有 `process.launch.<appDefId>` 權限
2. **應用定義查詢**：透過 `ApplicationManager.get()` 確認應用存在
3. **maxInstances 檢查**：若 `maxInstances > 0` 且當前實例數已達上限，回傳 `MaxInstancesReached`
4. **父程序驗證**：若指定 `parentPid`，確認其存在
5. **建立權限槽**：`PermissionsManager.new()` 為此實例建立獨立的 `processAppId`
6. **登記索引**：寫入 `processes`（PID → Process）與 `appProcesses`（appDefId → PIDs）
7. **父子關聯**：若有父程序，將新 PID 加入父程序的 `children` 集合

---

## Terminate 流程

1. **權限檢查**：`callerAppId` 需有 `process.terminate` 權限
2. **遞迴終止**：複製 `children` Set 後逐一遞迴呼叫 `_terminate(childPid)`
3. **標記停止**：`proc.markStopped()`
4. **清除訂閱**：`eventBus.removeApp(processAppId)`
5. **釋放權限**：`permissions.removeApp(systemAppId, processAppId)`
6. **移除索引**：從 `appProcesses` 和 `processes` 中刪除

---

## 錯誤代碼

| 錯誤 | 說明 |
|------|------|
| `PermissionDenied` | 缺少必要權限 |
| `AppNotFound` | appDefId 不存在於 ApplicationManager |
| `MaxInstancesReached` | 已達最大實例數限制 |
| `ParentNotFound` | 指定的 parentPid 不存在 |
| `NotFound` | PID 不存在 |
| `UnknownError` | 未知錯誤 |
