# SystemMonitor

**檔案**：`src/monitor/SystemMonitor.ts`

全域系統監控器，追蹤事件、API 呼叫、權限檢查、程序使用情況與執行效能。

---

## 記錄方法

| 方法 | 簽章 | 說明 |
|------|------|------|
| `recordEventEmit()` | `(appId, event) → void` | 記錄事件發射 |
| `recordEventSubscribe()` | `(event) → void` | 記錄事件訂閱 |
| `recordEventUnsubscribe()` | `(event) → void` | 記錄事件取消訂閱 |
| `recordApiCall()` | `(apiName, method, processAppId, pid, duration, success) → void` | 記錄 API 呼叫（含時長與成功/失敗） |
| `recordPermissionCheck()` | `(appId, permission, granted) → void` | 記錄權限檢查結果 |
| `recordProcessLaunch()` | `(pid, appDefId, processAppId, type) → void` | 記錄程序啟動 |
| `recordProcessTerminate()` | `(pid, appDefId) → void` | 記錄程序終止 |
| `recordExecution()` | `(pid, duration) → void` | 記錄程式碼執行時間 |

---

## 查詢方法

| 方法 | 簽章 | 說明 |
|------|------|------|
| `getSnapshot()` | `(activeProcessCount) → SystemSnapshot` | 取得完整系統快照 |

---

## SystemSnapshot

```typescript
interface SystemSnapshot {
  timestamp: number;
  uptime: number;
  events: {
    stats: EventStats[];
    recentEmits: EventRecord[];
    totalEmits: number;
    activeSubscriptions: number;
  };
  api: {
    stats: ApiStats[];
    recentCalls: ApiCallRecord[];
    totalCalls: number;
  };
  permissions: PermissionStats;
  processes: ProcessStats & {
    history: ProcessUsageRecord[];
  };
  performance: {
    avgExecutionTime: number;
    totalExecutions: number;
    recentExecutions: Array<{ pid: number; duration: number; timestamp: number }>;
  };
}
```

---

## 緩衝區限制

| 緩衝區 | 上限 |
|--------|------|
| 最近事件 | 200 筆 |
| 最近 API 呼叫 | 200 筆 |
| 最近執行紀錄 | 100 筆 |

---

## 統計類型

- **EventStats**：事件名稱、發射次數、訂閱者數、最後發射時間
- **ApiStats**：API 名稱+方法、呼叫次數、總/平均時長、最後呼叫時間
- **PermissionStats**：總檢查數、拒絕數、按 app/權限分類統計
- **ProcessStats**：總啟動/終止數、活躍程序數、按 app 分類統計
