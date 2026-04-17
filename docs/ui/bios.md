# BIOS

**檔案**：`src/ui/Bios.ts`

系統啟動畫面與錯誤畫面。提供開機終端機（boot terminal）顯示啟動日誌，以及全螢幕錯誤畫面。

---

## API

| 方法 | 簽章 | 說明 |
|------|------|------|
| `init()` | `() → void` | 初始化 BIOS |
| `log()` | `(source, level, message) → void` | 記錄日誌（同時輸出至 console 與 boot terminal） |
| `createBootTerminal()` | `() → void` | 建立開機終端機覆蓋層 |
| `destroyBootTerminal()` | `() → void` | 移除開機終端機 |
| `showErrorScreen()` | `(title, details, actions?) → void` | 顯示全螢幕錯誤畫面 |
| `hideErrorScreen()` | `() → void` | 隱藏錯誤畫面 |

---

## DangerLevel

```typescript
type DangerLevel = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
```

日誌顏色：
- `CRITICAL`：`#ff5f56`
- `ERROR`：`#ff9f43`
- `WARN`：`#ffd166`
- `INFO`：`#9ef3c5`

---

## ErrorScreenAction

```typescript
interface ErrorScreenAction {
  label: string;
  handler: () => void;
}
```

錯誤畫面可附帶動作按鈕（例如「重新啟動」），點擊時執行 `handler`。

---

## Z-Index

| 畫面 | Z-Index |
|------|---------|
| Boot Terminal | `Z_INDEX_BOOT_TERMINAL` (9999) |
| Error Screen | `Z_INDEX_ERROR_SCREEN` (10000) |

---

## 日誌格式

```
[YYYY-MM-DD HH:MM:SS.mmm] [SOURCE] [LEVEL] message
```
