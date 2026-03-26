# BIOS

**檔案**：`src/bootstrap/bios.ts`

開機分階段日誌系統。匯出 `bios` 單例、`BIOS` 類別與 `getAppDiv()` 輔助函式。

---

## API

| 方法 | 說明 |
|------|------|
| `log(source, level, message)` | 記錄日誌（同時輸出到 console 與 boot terminal） |
| `init()` | 初始化 BIOS（保留） |
| `createBootTerminal()` | 建立全螢幕黑底開機 terminal |
| `destroyBootTerminal()` | 移除開機 terminal |

---

## DangerLevel

```typescript
type DangerLevel = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
```

---

## 日誌格式

```
[YYYY-MM-DD HH:mm:ss.SSS] [SOURCE] [LEVEL] message
```

範例：

```
[2026-03-26 14:30:15.042] [BOOT] [INFO] Preparing core services
[2026-03-26 14:30:15.180] [PROC] [ERROR] Failed to launch MyApp: MaxInstancesReached
```

---

## 日誌顏色（Boot Terminal）

| Level | 顏色 |
|-------|------|
| `INFO` | `#9ef3c5`（綠色） |
| `WARN` | `#ffd166`（黃色） |
| `ERROR` | `#ff9f43`（橘色） |
| `CRITICAL` | `#ff5f56`（紅色） |

---

## Console 輸出

- `INFO` → `console.log()`
- `WARN` → `console.warn()`
- `ERROR` / `CRITICAL` → `console.error()`

---

## Boot Terminal

- 全螢幕黑底覆蓋層，等寬字體顯示
- 在 `bootstrapSystem()` 開頭建立，結尾銷毀
- 若 `#app` div 不存在，自動降級為純 console 輸出

---

## getAppDiv()

```typescript
function getAppDiv(): HTMLDivElement | null
```

取得 `document.getElementById('app')`，需同時滿足：
- 是 `HTMLDivElement` 實例
- `isConnected === true`

否則回傳 `null`。
