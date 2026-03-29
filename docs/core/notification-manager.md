# NotificationManager

**檔案**：`src/notification/NotificationManager.ts`

全域通知系統，管理通知佇列、DOM 渲染與自動消失。

---

## API

| 方法 | 簽章 | 說明 |
|------|------|------|
| `createContainer()` | `() → HTMLElement` | 建立通知容器 DOM 元素 |
| `notify()` | `(title, body?, type?, duration?) → string` | 發送通知，回傳通知 ID |
| `dismiss()` | `(id) → void` | 手動關閉指定通知 |

---

## 通知類型

| 類型 | 說明 |
|------|------|
| `info` | 一般資訊（預設） |
| `success` | 成功訊息 |
| `warning` | 警告訊息 |
| `error` | 錯誤訊息 |

---

## 特性

- **動畫顯示/隱藏**：通知以動畫方式出現與消失
- **自動消失**：可配置持續時間（毫秒），`0` 表示不自動消失
- **最大顯示數量**：同時最多顯示 5 則通知
- **覆蓋層整合**：通知容器透過 `DesktopShell.registerOverlay()` 註冊到桌面

---

## 與其他元件的關係

| 元件 | 互動方式 |
|------|---------|
| `systemBootstrap.ts` | 建立 NotificationManager 實例，`createContainer()` → `DesktopShell.registerOverlay()` |
| `notificationApi`（Host API） | 呼叫 `notify()` 與 `dismiss()` |
| `DesktopShell` | 通知容器作為桌面覆蓋層管理 |

---

## 權限

沙箱應用透過 `notificationApi` 使用通知功能，需要 `notification.send` 權限。
