# NotificationManager

**檔案**：`src/notification/NotificationManager.ts`

全域通知系統，管理 toast 通知的建立、顯示、消失動畫與自動移除。

---

## API

| 方法 | 簽章 | 說明 |
|------|------|------|
| `createContainer()` | `() → HTMLDivElement` | 建立通知容器，回傳 DOM 供 overlay 註冊 |
| `notify()` | `(options) → string` | 發送通知，回傳 notificationId |
| `dismiss()` | `(id) → void` | 手動關閉通知 |
| `destroy()` | `() → void` | 銷毀所有通知與容器 |

---

## NotificationOptions

```typescript
interface NotificationOptions {
  title: string;
  body?: string;
  type?: NotificationType;  // 'info' | 'success' | 'warning' | 'error'，預設 'info'
  duration?: number;        // ms，0 = 不自動消失，預設 NOTIFICATION_DEFAULT_DURATION_MS (4000)
  source?: string;          // 來源 app 名稱
}
```

---

## 組態屬性

| 屬性 | 型別 | 預設值 | 說明 |
|------|------|--------|------|
| `doNotDisturb` | `boolean` | `false` | 啟用時 `notify()` 不產生通知 |
| `defaultDuration` | `number` | `4000` | 預設通知顯示時長（ms） |
| `maxVisible` | `number` | `5` | 同時可見的最大通知數量 |

---

## 行為

- 通知超過 `maxVisible` 時自動移除最舊的
- 關閉動畫使用 CSS transition（`is-visible` → `is-dismissed`），transition 結束後移除 DOM
- `doNotDisturb` 啟用時 `notify()` 直接回傳空字串
