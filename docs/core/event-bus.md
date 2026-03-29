# EventBus

**檔案**：`src/events/EventBus.ts`

權限門控的發布/訂閱（pub/sub）事件系統。所有 `on`/`emit` 操作皆需通過權限檢查。

---

## API

| 方法 | 簽章 | 說明 |
|------|------|------|
| `on()` | `(appId, event, listener) → EventBusResult` | 訂閱事件（需 `event.subscribe.<event>` 權限） |
| `off()` | `(appId, event, listener) → EventBusResult` | 取消訂閱 |
| `emit()` | `(appId, event, ...args) → EventBusResult` | 發送事件（需 `event.emit.<event>` 權限） |
| `removeApp()` | `(appId) → void` | 移除某 appId 的所有訂閱 |

---

## 內部索引

EventBus 維護兩套索引以支援不同的查詢場景：

- **按事件名稱**：`eventListeners: Map<string, ListenerEntry[]>`
  - 用於 `emit()` 時快速找到所有訂閱者
- **按應用 ID**：`appListeners: Map<string, Array<{event, listener}>>`
  - 用於 `removeApp()` 時快速清除該應用的所有訂閱

```typescript
interface ListenerEntry {
  appId: string;
  listener: (...args: any[]) => void;
}
```

---

## 權限要求

| 操作 | 所需權限 |
|------|---------|
| 訂閱 `window.ui` 事件 | `event.subscribe.window.ui` |
| 發送 `window.ui` 事件 | `event.emit.window.ui` |
| 訂閱任意事件 | `event.subscribe.*` |

---

## 錯誤代碼

| 錯誤 | 說明 |
|------|------|
| `PermissionDenied` | 缺少所需權限 |
| `EventNotFound` | emit 時無任何訂閱者 |
| `UnknownError` | 未知錯誤 |
