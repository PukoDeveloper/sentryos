# NetworkAdapter / AllowlistNetworkManager

**介面**：`src/network/NetworkAdapter.ts`
**實作**：`src/network/AllowlistNetworkManager.ts`

網路子系統，為沙箱應用提供受控的 HTTP 連線能力。採用抽象介面設計，可替換不同的網路策略實作。

---

## 抽象介面（NetworkAdapter）

| 方法 | 簽章 | 說明 |
|------|------|------|
| `isEnabled()` | `() → boolean` | 查詢網路子系統是否啟用 |
| `setEnabled(enabled)` | `(boolean) → void` | 啟用或停用整個網路系統 |
| `request(appId, req)` | `(string, NetworkRequest) → Promise<NetworkResult<NetworkResponse>>` | 發送 HTTP 請求（受策略約束） |
| `isAllowed(url)` | `(string) → boolean` | 檢查 URL 是否符合目前策略 |
| `getAllowlist()` | `() → AllowlistEntry[]` | 取得完整允許清單 |
| `addAllowlistEntry(pattern, description?)` | `(string, string?) → NetworkResult<AllowlistEntry>` | 新增允許規則 |
| `removeAllowlistEntry(pattern)` | `(string) → NetworkResult<string>` | 移除允許規則 |
| `getStatus()` | `() → NetworkStatus` | 取得網路狀態摘要 |

---

## 型別定義

### NetworkRequest

| 欄位 | 型別 | 說明 |
|------|------|------|
| `url` | `string` | 請求目標 URL（必填） |
| `method` | `HttpMethod` | HTTP 方法，預設 `'GET'` |
| `headers` | `Record<string, string>` | 請求標頭（選填） |
| `body` | `string` | 請求主體（選填，GET/HEAD 忽略） |
| `timeout` | `number` | 逾時時間（毫秒），預設 10000 |

### NetworkResponse

| 欄位 | 型別 | 說明 |
|------|------|------|
| `status` | `number` | HTTP 狀態碼 |
| `statusText` | `string` | 狀態文字 |
| `headers` | `Record<string, string>` | 回應標頭 |
| `body` | `string` | 回應主體（文字） |

### AllowlistEntry

| 欄位 | 型別 | 說明 |
|------|------|------|
| `pattern` | `string` | 網域匹配規則 |
| `description` | `string?` | 規則說明（選填） |
| `createdAt` | `number` | 建立時間戳 |

### NetworkStatus

| 欄位 | 型別 | 說明 |
|------|------|------|
| `enabled` | `boolean` | 網路是否啟用 |
| `allowlistCount` | `number` | 允許規則數量 |
| `totalRequests` | `number` | 累計請求數 |
| `blockedRequests` | `number` | 被攔截的請求數 |

### NetworkError

| 錯誤碼 | 說明 |
|--------|------|
| `PermissionDenied` | 缺少網路權限 |
| `NotAllowed` | URL 不在允許清單中 |
| `ConnectionFailed` | 連線失敗 |
| `Timeout` | 請求逾時 |
| `InvalidUrl` | URL 格式無效 |
| `Disabled` | 網路功能已停用 |
| `UnknownError` | 未知錯誤 |

---

## AllowlistNetworkManager（預設實作）

預設拒絕所有連線，僅允許匹配 allowlist 的網域通過。

### 允許規則格式

| 格式 | 範例 | 匹配說明 |
|------|------|---------|
| 全域萬用字元 | `*` | 允許所有網域 |
| 萬用字元子網域 | `*.example.com` | 匹配 `a.example.com`、`b.c.example.com` 及 `example.com` |
| 精確匹配 | `api.github.com` | 僅匹配該網域 |

### 持久化

- `exportState()` — 匯出 `{ enabled, allowlist }` 供持久化
- `importState(data)` — 從已儲存的資料恢復狀態
- 系統開機時從 `sys:network-settings` 自動載入
- 透過 `networkApi` 變更時自動存回 FileSystem

---

## 與其他元件的關係

| 元件 | 互動方式 |
|------|---------|
| `systemBootstrap.ts` | 建立 `AllowlistNetworkManager` 實例，從 FileSystem 恢復設定 |
| `networkApi`（Host API） | 橋接沙箱應用與 NetworkAdapter，變更時自動持久化 |
| `FileSystem` | 設定儲存於 `sys` 層 `network-settings` 鍵 |
| Settings App | 網路設定頁面（開關、統計、允許清單管理） |

---

## 權限

| 權限字串 | 說明 |
|----------|------|
| `network.request` | 發送 HTTP 請求 |
| `network.status` | 查詢網路狀態與檢查 URL |
| `network.manage` | 管理允許清單與啟用/停用網路 |
