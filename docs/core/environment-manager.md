# EnvironmentManager

**檔案**：`src/environment/EnvironmentManager.ts`

管理系統執行期環境狀態，包含四個功能區：

1. **自動啟動註冊** — 記錄哪些應用在開機時自動啟動
2. **環境變數** — 全域鍵值對儲存
3. **程式庫快取** — Library 原始碼的記憶體快取
4. **命令註冊表** — CLI 命令名稱 → 程式庫的對應關係

---

## 自動啟動（Auto-start）

| 方法 | 簽章 | 說明 |
|------|------|------|
| `registerAutoStart()` | `(appDefId: string) → void` | 將應用加入自動啟動集合 |
| `unregisterAutoStart()` | `(appDefId: string) → void` | 從自動啟動集合移除 |
| `isAutoStart()` | `(appDefId: string) → boolean` | 檢查是否為自動啟動 |
| `getAutoStartApps()` | `() → string[]` | 取得所有自動啟動的 appDefId |

---

## 環境變數（Environment Variables）

| 方法 | 簽章 | 說明 |
|------|------|------|
| `setVariable()` | `(key: string, value: string) → void` | 設定環境變數 |
| `getVariable()` | `(key: string) → string \| undefined` | 讀取環境變數 |
| `removeVariable()` | `(key: string) → boolean` | 刪除環境變數 |
| `getAllVariables()` | `() → Record<string, string>` | 取得所有環境變數 |

---

## 程式庫快取（Library Code Cache）

| 方法 | 簽章 | 說明 |
|------|------|------|
| `registerLibrary()` | `(libraryId: string, code: string) → void` | 快取程式庫原始碼 |
| `getLibraryCode()` | `(libraryId: string) → string \| undefined` | 取得快取的程式碼 |
| `hasLibrary()` | `(libraryId: string) → boolean` | 檢查程式庫是否已註冊 |
| `getLibraryIds()` | `() → string[]` | 列出所有已註冊的 libraryId |

### libraryId 格式

`libraryId` 為 `"packageName/appName"`，例如 `"stdlib/Math Utils"`。

---

## 命令註冊表（Command Registry）

| 方法 | 簽章 | 說明 |
|------|------|------|
| `registerCommand()` | `(name: string, entry: Omit<CommandEntry, 'name'>) → void` | 註冊 CLI 命令 |
| `getCommand()` | `(name: string) → CommandEntry \| undefined` | 查詢命令 |
| `hasCommand()` | `(name: string) → boolean` | 檢查命令是否存在 |
| `getAllCommands()` | `() → CommandEntry[]` | 列出所有已註冊命令 |

### CommandEntry

```typescript
interface CommandEntry {
  name: string;           // 命令名稱（如 'factorial'）
  libraryId: string;      // 所屬程式庫 ID（如 'stdlib/Math Utils'）
  description: string;    // 命令描述
  usage?: string;         // 用法說明（如 'factorial <n>'）
}
```

### 命令分派流程

1. Library 在 init 階段透過 `envApi.registerCommand()` 註冊命令
2. Console 應用收到未識別的使用者輸入時，呼叫 `shellApi.resolveCommand(name)`
3. 若命令存在，以 `envApi.loadLibrary(cmd.libraryId)` 載入對應程式庫
4. 呼叫 `globalThis.__commands[name](args)` 執行命令處理函式

---

## 與其他元件的關係

| 元件 | 互動方式 |
|------|---------|
| `systemBootstrap.ts` | 建立 EnvironmentManager 實例；透過 `envApi` / `shellApi` 暴露功能給沙箱程式 |
| `envApi`（Host API） | 呼叫 EnvironmentManager 的環境變數、自動啟動、程式庫載入方法 |
| `shellApi`（Host API） | 呼叫 `getAllCommands()`、`getCommand()` 提供命令查詢功能 |
| Library 應用 | 開機時由 Bootstrap 執行 init，快取程式碼到 EnvironmentManager |
| Console 應用 | 透過 `envApi.loadLibrary()` 載入程式庫，透過 `shellApi.resolveCommand()` 查詢命令 |
