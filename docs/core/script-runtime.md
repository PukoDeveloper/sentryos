# ScriptRuntime

**檔案**：`src/runtime/ScriptRuntime.ts`（繼承 `BaseRuntime`，型別定義：`src/runtime/types.ts`）

基於 QuickJS-emscripten 的沙箱執行引擎。繼承 `BaseRuntime` 取得共用邏輯（IPC、事件訂閱、API 表面建構）。負責建立 QuickJS Runtime/Context、注入 OS API、Timer 函式、模組載入（`imports()`）以及程序資源釋放。

> Host API 的註冊與管理已移至 [RuntimeRegistry](runtime-registry.md)。`ScriptRuntime` 透過 `BaseRuntime.buildApiSurface()` 自動合併內建 API 與中央 API。

---

## API

| 方法 | 簽章 | 說明 |
|------|------|------|
| `execute()` | `(pid, code, timeoutMs?, entryPath?) → RuntimeResult<unknown>` | 在指定程序中執行程式碼 |
| `evaluateInContext()` | `(pid, code) → RuntimeResult<unknown>` | 在已有上下文中執行代碼（不重新注入 API），用於載入程式庫 |
| `destroyProcessRuntime()` | `(pid) → void` | 銷毀單一程序的 QuickJS runtime/context 並清理所有 timer |
| `destroyAll()` | `() → void` | 銷毀所有程序 |

---

## execute()

```typescript
execute(pid: number, code: string, timeoutMs?: number, entryPath?: string): RuntimeResult<unknown>
```

- `timeoutMs`：預設 `DEFAULT_EXECUTION_TIMEOUT_MS`（300ms），超時後透過 `shouldInterruptAfterDeadline` 中斷
- `entryPath`：首次指定時注入 `imports()` 全域函式與 ESModule loader
- 執行時間由 `SystemMonitor.recordExecution()` 記錄

---

## Timer 系統

注入四個全域函式：`setTimeout`、`setInterval`、`clearTimeout`、`clearInterval`。

### ID 回收機制

Timer guest ID（回傳給沙箱應用程式的 ID）使用 `timerFreeIds` 陣列回收。當 setTimeout 單次觸發完成或呼叫 clearTimeout/clearInterval 時，guest ID 會被推入 `timerFreeIds` 供後續重複使用，避免 ID 無限遞增。

```
新 Timer → 檢查 timerFreeIds.pop() → 有空閒 ID 則復用
                                     → 無空閒 ID 則 timerNextId++
```

### 清理流程

程序銷毀時（`destroyProcessRuntime`）：
1. 清除所有 host-side timers（`window.clearTimeout` / `window.clearInterval`）
2. 清空 `timerMap`
3. Dispose 所有 `timerCallbacks` 中的 QuickJS handle
4. Dispose context 與 runtime

---

## 模組載入（imports）

### import 語法（ESModule-like）

透過 QuickJS 的 `setModuleLoader` 實作：

```javascript
import { foo } from '@packageName/libName';  // @-prefix → 載入已註冊程式庫
import { bar } from './relative/path.js';    // 相對路徑 → 從 entryPath 解析
```

- `@` 前綴：從 `EnvironmentManager.getLibraryCode()` 取得已註冊程式庫
- 相對路徑：基於 `entryPath` 解析，支援 `.js`（直接執行）、`.json`（轉為 export）、其他格式（export default 字串）

### imports() 函式（CommonJS-like）

```javascript
const module = imports('./path/to/module.js');
```

以 IIFE 包裝提供 `module.exports` / `exports`，回傳值會被快取於 `moduleCache`（QuickJS handle 生命週期與程序綁定）。

---

## RuntimeProcess 狀態

```typescript
type RuntimeProcess = BaseProcessState & {
  runtime: QuickJSRuntime;
  context: QuickJSContext;
  moduleCache: Map<string, QuickJSHandle>;  // 已載入模組路徑 → 匯出值
  importsInjected?: boolean;
  timers: Set<number>;                       // host-side timer ID 集合
  timerMap: Map<number, number>;             // guest ID → host timer ID
  timerCallbacks: Map<number, QuickJSHandle>; // guest ID → callback handle
  timerNextId: number;
  timerFreeIds?: number[];                   // 已回收可復用的 guest ID
};
```

---

## 錯誤類型

| 錯誤 | 說明 |
|------|------|
| `ProcessNotFound` | pid 不存在 |
| `ProcessNotRunning` | 程序狀態非 running |
| `RuntimeError` | QuickJS 執行時錯誤（data 包含錯誤資訊） |
| `PermissionDenied` | 權限不足 |
| `InvalidTarget` | 無效目標 |
