# SystemMonitor

**檔案**：`src/monitor/SystemMonitor.ts`

系統監控追蹤器，記錄事件、API 呼叫、權限檢查與程序生命週期等統計數據。

---

## API

| 方法 | 簽章 | 說明 |
|------|------|------|
| `trackEvent()` | `(eventName, appId) → void` | 記錄事件發送 |
| `trackApiCall()` | `(apiName, method, duration, success) → void` | 記錄 API 呼叫 |
| `trackPermissionCheck()` | `(appId, permission, granted) → void` | 記錄權限檢查 |
| `trackProcessLaunch()` | `(pid, appDefId) → void` | 記錄程序啟動 |
| `trackProcessTerminate()` | `(pid) → void` | 記錄程序終止 |
| `snapshot()` | `() → MonitorSnapshot` | 取得完整統計快照 |
| `eventStats()` | `() → EventStats` | 取得事件統計 |
| `apiStats()` | `() → ApiStats` | 取得 API 呼叫統計 |
| `permissionStats()` | `() → PermissionStats` | 取得權限統計 |
| `recentEvents()` | `(limit?) → RecentEvent[]` | 取得最近事件記錄 |
| `recentApiCalls()` | `(limit?) → RecentApiCall[]` | 取得最近 API 呼叫記錄 |
| `processHistory()` | `() → ProcessHistoryEntry[]` | 取得程序歷史記錄 |

---

## 追蹤項目

### 事件追蹤

記錄 EventBus 的事件發送與訂閱：

- 事件名稱
- 發送者 appId
- 發送時間戳

### API 呼叫追蹤

記錄 Host API 的呼叫：

- API 名稱與方法名
- 呼叫持續時間（毫秒）
- 是否成功

### 權限檢查追蹤

記錄 PermissionsManager 的權限檢查：

- 每個 appId 的檢查次數（granted / denied）
- 每個權限字串的檢查次數
- 整體通過/拒絕比率

### 程序追蹤

記錄程序的啟動與終止：

- 啟動/終止計數
- 啟動歷史（pid、appDefId、時間戳）

---

## 注入機制

SystemMonitor 在 Bootstrap 階段建立後，透過 setter 注入到其他核心服務：

```
eventBus.setMonitor(systemMonitor)
runtime.setMonitor(systemMonitor)
permissions.setMonitor(systemMonitor)
```

這使得核心服務在操作時能自動將統計數據匯報給 SystemMonitor。

---

## 與其他元件的關係

| 元件 | 互動方式 |
|------|---------|
| `systemBootstrap.ts` | 建立 SystemMonitor 實例，注入到 EventBus、ScriptRuntime、PermissionsManager |
| `EventBus` | 回報事件發送/訂閱統計 |
| `ScriptRuntime` | 回報 API 呼叫統計 |
| `PermissionsManager` | 回報權限檢查統計 |
| `monitorApi`（Host API） | 呼叫 `snapshot()`、`eventStats()` 等方法供沙箱應用查詢 |

---

## 權限

沙箱應用透過 `monitorApi` 查詢監控數據，需要 `monitor.read` 權限。
