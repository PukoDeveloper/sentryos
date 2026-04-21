## 待辦事項

---

## 🔍 潛在錯誤掃描

### PermissionsManager

- **`init()` 錯誤碼語意不清**：重複呼叫 `init()` 時回傳 `error: 'UnknownError'`，應改為語意更明確的 `'AlreadyInitialized'` 錯誤碼，以便呼叫端正確區分錯誤類型。
- **原型污染風險**：`appPermissions` 使用普通物件（`{}`）作為儲存容器，若外部傳入 `__proto__`、`constructor`、`toString` 等特殊字串作為 `appId`，可能導致原型鏈污染。建議改用 `Map<string, Set<string>>` 取代。
- **`hasAnyUnder` 萬用字元處理不完整**：傳入 `'*'` 時雖能正確判斷，但對 `'*.sub'` 這類部分萬用字元格式缺乏匹配支援，可能導致命名空間查詢結果不一致。

### EventBus

- **`off()` 權限要求導致訂閱無法清除**：`off()` 與 `on()` 使用相同的 `eventSubscribe` 權限，若應用程式在訂閱後被撤銷該權限，將無法取消訂閱，造成 listener 記憶體洩漏。建議 `off()` 使用獨立的較低權限，或在程序終止時由系統強制清除。
- **單一事件的 listener 無上限**：`eventListeners` 對每個事件的監聽者數量無限制，大量訂閱可能造成記憶體壓力與執行效能下降。建議加入每事件的 listener 上限（例如 256）。

### FileSystem（WebFileSystemAdapter）

- **localStorage 容量與設計容量不符**：`STORAGE_TOTAL_CAPACITY` 設定為 16 MB，但多數瀏覽器 localStorage 上限為 5–10 MB。超出限制時 `flushTier` 只靜默跳過，資料將在頁面重載後遺失，且不會通知呼叫端。建議在寫入失敗後觸發警告事件，或改用 IndexedDB 作為後端。
- **`isValidKey` 過濾不足**：目前僅排除 `..`，未阻擋路徑分隔符號（`/`、`\`）、空白字元或 null byte，存在路徑遍歷風險。建議使用白名單正則（例如 `/^[\w\-.:]+$/`）來驗證鍵值。
- **`loadFromStorage` 未驗證資料結構**：從 localStorage 還原時直接 `JSON.parse`，若欄位型別不符（例如 `key` 不是字串、`tier` 是無效值）不會進行驗證，可能導致後續操作發生不可預期的錯誤。

### AllowlistNetworkManager

- **`matchPattern` 萬用字元邊界問題**：`*.example.com` 會透過 `host === pattern.slice(2)` 同時匹配 `example.com` 本身，可能超出預期的授權範圍。若需要嚴格子網域匹配，應移除該分支或加入明確說明。
- **allowlist 未持久化**：`AllowlistNetworkManager` 的狀態（`enabled`、`allowlist`）雖提供 `exportState`/`importState`，但需呼叫端主動處理持久化，若忘記呼叫則重載後設定消失。建議整合至 FileSystem 自動持久化。

### BaseRuntime / ScriptRuntime

- **執行逾時（300 ms）過短**：`DEFAULT_EXECUTION_TIMEOUT_MS = 300` 對需要計算或呼叫非同步 Host API 的應用程式來說過於嚴苛，可能導致正常程式被誤殺。建議讓 manifest 能覆寫逾時值，或依程序類型動態調整。
- **IPC inbox 滿時無通知機制**：`MAX_INBOX_SIZE = 256` 達到上限後回傳 `'InboxFull'`，但發送方無法知道訊息被丟棄，也不會觸發任何警告事件。建議在 inbox 快滿時（例如超過 80%）透過 EventBus 發出警告，或提供 inbox 清空 API。
- **`invokeHandler` 採用程式碼字串注入**：事件派發是透過動態組裝 JS 字串（`code = '...' + safePayload`）後呼叫 `execute()` 實現，雖然 `JSON.stringify` 對 JSON-safe 資料安全，但若 payload 包含特殊字元或極大物件，仍有效能與穩定性風險。非 JS 引擎子類別必須確實覆寫 `invokeHandler`。

### AuthProvider

- **本地模式硬編碼密碼**：`localAuthenticate` 接受任何使用者名稱搭配固定密碼 `"0000"`，屬於弱預設憑證。正式部署時應強制要求設定自訂密碼或改用遠端模式。
- **遠端驗證無 rate limiting**：`remoteAuthenticate` 對失敗嘗試無節流保護，攻擊者可對身分驗證端點進行暴力破解。建議在前端加入指數退避或鎖定機制。

### RuntimeRegistry

- **引擎名稱重複覆蓋無警告**：`register()` 直接以 `Map.set` 覆蓋同名引擎，若插件意外以相同名稱重複註冊會靜默取代既有引擎，建議加入重複檢查並拋出或記錄警告。

---

## 🚀 可擴展與更新方向

### 核心架構

- **IndexedDB 持久化後端**：以 IndexedDB 取代 localStorage，突破瀏覽器的 5–10 MB 儲存限制，並支援更大的 `StorageTier` 容量設定，同時改善並發寫入安全性。
- **多執行引擎支援**：RuntimeRegistry 已具備多引擎架構，可擴充支援 Lua（目前為插件形式）、Python（Pyodide）或 WebAssembly 原生模組，讓 manifest 的 `engine` 欄位有更多選擇。
- **程序快照與還原（Checkpoint/Restore）**：為 `Process` 加入狀態序列化能力，使長期執行的 Service 類型程序在頁面重載後可自動恢復，提升系統可靠性。
- **非同步 Host API 支援**：目前 Host API `factory` 回傳的函式以同步方式呼叫，需擴充 `BaseRuntime.buildApiSurface` 與 QuickJS 橋接層，以支援 `async/await` 式的 Host API，解除目前非同步操作需依賴 IPC 繞道的限制。

### 安全性

- **權限請求 UI（Permission Grant Dialog）**：仿照 Android/iOS 在應用程式首次請求未持有的權限時彈出確認對話框，讓使用者在執行期間動態授予或拒絕，而非僅靠 manifest 靜態宣告。
- **Content Security Policy（CSP）強化**：為插件載入的外部資源加入 CSP 標頭或 meta 設定，防止插件透過 `<script>` 注入或 `eval` 繞過沙箱。
- **SecretsManager 模組**：新增加密的秘鑰儲存層（基於 Web Crypto API），供需要持久化 API Token 或使用者敏感資料的應用程式使用，避免明文存放於 FileSystem。

### 使用者體驗

- **通知行動按鈕（Action Buttons）**：`NotificationManager` 的 `NotificationOptions` 加入 `actions` 欄位，讓通知可攜帶可點擊的快捷動作，增加互動性。
- **多語言（i18n）支援**：`LanguageManager` 目前僅管理系統語言設定，可擴充為完整的字串翻譯框架，讓內建應用程式與插件能載入語言包。
- **虛擬桌面（Virtual Desktops）**：`WindowManager` 可加入桌面（workspace）概念，允許視窗分群管理，並在工作列加入切換器 UI。

### 開發體驗

- **單元測試與整合測試**：為 `PermissionsManager`、`ProcessManager`、`EventBus`、`FileSystem` 等核心模組加入 Vitest 單元測試，防止重構時引入回歸。
- **TypeScript 嚴格模式**：啟用 `tsconfig` 的 `strict: true`（含 `noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`），消除潛在的 null/undefined 錯誤。
- **Host API 自動文件生成**：透過 TSDoc 或 typedoc 對 `api/` 目錄下的 16 個 Host API 模組自動生成 API 參考文件，降低 App / Plugin 開發者的學習成本。
- **插件熱重載（Hot Reload）**：`PluginManager` 加入 `reload(pluginId)` 方法，允許在不重啟系統的情況下更新單一插件，加速插件開發迭代。

### 網路與連線

- **WebSocket 支援**：`NetworkAdapter` 介面新增 `connect(url)`、`disconnect()`、`send()` 方法，讓沙箱應用程式可以建立持久化雙向連線，支援即時通訊類應用。
- **網路請求佇列與重試**：`AllowlistNetworkManager` 加入指數退避重試機制，並支援離線佇列（在網路恢復時自動重送請求）。

### 系統監控

- **效能儀表板應用**：基於 `SystemMonitor` 已收集的 API 呼叫、事件統計、記憶體用量等資料，開發內建的系統資源監控視窗應用，方便開發者即時診斷效能瓶頸。
- **結構化日誌（Structured Logging）**：`console` API 輸出改為結構化 JSON 格式，支援依程序、時間戳、層級（info/warn/error）篩選，並可匯出為診斷報告。