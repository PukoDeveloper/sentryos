## 待辦事項

---

### 🔴 已發現的 Bug / 需立即修復

- [ ] **[Critical]** `ScriptRuntime.syncFetch` 使用同步 XHR 阻塞主線程，多模組載入時 UI 完全凍結（ScriptRuntime.ts ~L457）
- [x] **[Critical]** `BaseRuntime.invokeHandler` 以字串拼接方式產生程式碼，存在潛在注入風險；已改用 JSON.stringify 安全參數傳遞
- [x] **[High]** `EventBus.emit()` 中 listener 拋出例外會中斷後續所有 listener 執行；已用 try-catch 隔離每個 listener
- [x] **[High]** `KernelConsole.dispatchDynamicCommand` 字串拼接注入風險；已改用 JSON.stringify 安全參數傳遞
- [x] **[High]** `PermissionsManager` ID 碰撞；已加入遞增計數器 + 重複檢查的 `generateId()` 方法
- [x] **[High]** `ScriptRuntime.injectTimerFunctions` typeof 檢查邏輯無效；已修正為正確的 `context.typeof() !== 'function'` 檢查並提前 return
- [x] **[High]** `ApplicationCatalog.loadApplicationCatalog` 序列 fetch；已改用 `Promise.allSettled` 並行載入，個別失敗不阻斷其他 App
- [x] **[High]** Timer callback handle 洩漏；已在 interval 回呼出錯時清理 timer 並 dispose callbackDup
- [x] **[Medium]** `example/monitor-demo.js` 存取不存在的屬性；已修正為正確遍歷 `EventStats[]` 陣列計算統計
- [x] **[Medium]** `file-manager/manifest.json` 缺少 `icon.svg`；已建立 icon.svg 檔案
- [x] **[Medium]** `developer-tools/luatest.lua` manifest type 錯誤；已從 `Console` 改為 `Window`
- [x] **[Medium]** `DesktopShell` 搜尋/釘選右鍵選單及資料夾計數有硬編碼中文；已改用 `this.t()` 並新增 3 組 i18n key
- [x] **[Medium]** `EventBus.emit()` 對無 listener 的事件回傳 error；已改為回傳 `{ success: true }`
- [ ] **[Medium]** `WindowManager.closeWindow` 先刪除 descriptor 但 DOM 延遲 220ms 移除（設計上為避免工作管理員關閉自身時異常）
- [x] **[Medium]** `AllowlistNetworkManager.request` 將網路錯誤計入 `blockedRequests`；已修正為僅在真正攔截時計數
- [x] **[Medium]** `BaseRuntime` 內建 `consoleApi` 與中央 Host API 同名衝突；已移除死碼的內建版
- [x] **[Medium]** `envApi.loadLibrary` export 正規表達式不完整；已新增 `export { }` 和 `export *` 的處理
- [x] **[Medium]** `ScriptRuntime.injectImportCommand` JSON.parse 無 try-catch；已加入 try-catch 並回傳錯誤訊息

---

### 🟡 安全與穩定性隱患

- [x] `process.spawnChild` 無子程序數量限制；已加入 `MAX_CHILDREN = 32` 上限
- [x] IPC `pushMessage` 的 inbox 無容量上限；已加入 `MAX_INBOX_SIZE = 256` 上限並回傳 `InboxFull` 錯誤
- [x] `getQuickJSInstance()` 在初始化前回傳 undefined；已加入 null guard 拋出明確錯誤
- [x] `BaseRuntime.pushMessage` 中 `JSON.stringify` 對循環引用 payload 拋出未捕獲 TypeError；已用 try-catch 包裝

---

### 🔧 效能優化

- [x] Manifest 載入從序列 fetch 改為 `Promise.allSettled` 並行（已在 Bug 修復中一併完成）
- [ ] Auto-start apps 中 Services 可並行啟動（systemBootstrap.ts ~L312）
- [ ] `FileSystem.checkCapacity` 每次寫入遍歷所有 entry 計算用量，應改用增量計數器（FileSystem.ts ~L307）
- [ ] `FileSystem.persistTier` 每次寫入/刪除序列化整個 tier 到 localStorage，高頻寫入需節流（FileSystem.ts ~L244）
- [ ] `SystemMonitor` 的 `recentEvents.shift()` 是 O(n)，建議改用環形緩衝區（SystemMonitor.ts ~L149）
- [ ] `PermissionsManager.has()` 每次將 Set 轉為 Array 再遍歷，可直接迭代 Set（PermissionsManager.ts ~L67）
- [ ] `BaseRuntime.dispatchToHandler` 線性掃描所有 process 查找 processAppId，應建立反向索引（BaseRuntime.ts ~L72）
- [ ] 多層 `backdrop-filter: blur()` 疊加（taskbar + start panel + context menu + notifications），低階設備效能差（style.css）

---

### 🧹 程式碼品質 / 死碼清理

- [ ] `Process.resource: any` 從未被讀寫，為殘留死碼（Process.ts ~L15）
- [ ] `Kernel.ValueMap.consoleControllers` 宣告但從未使用（Kernel.ts ~L53）
- [x] `ScriptRuntime` timer typeof 檢查 if-block 為空 body（已在 Bug 修復中一併移除）
- [ ] `toIterable()` 在 WindowManager 和 builtinComponents 中重複定義，應提取共用模組
- [ ] `KernelConsole.padRight()` 可直接用 `String.prototype.padEnd()` 替代
- [ ] `settingsApi` 中 `applyTheme`/`saveTheme` 有大量重複驗證邏輯（settingsApi.ts ~L40-77）
- [ ] `RuntimeResult<T>` 應改為 discriminated union 以獲得型別安全（runtime/types.ts ~L18）
- [ ] `networkApi.request` 宣告為 async 但 QuickJS 同步環境無法處理 Promise 回傳（networkApi.ts ~L28）
- [ ] `plugins/dev.js` 存在於磁碟但未被 `plugins.json` 引用（孤立插件）
- [ ] `vite-plugin-wasm` 在 devDependencies 中但未被 vite.config.ts 引用（未使用依賴）
- [ ] `developer-tools/manifest.json` 中 App ID 使用 PascalCase（`Console`/`Catch`），與專案 kebab-case 慣例不一致
- [ ] 部分互動元素缺少 `:focus-visible` 樣式，影響鍵盤無障礙

---

### 🧩 記憶體洩漏

- [ ] `WindowManager.windowCreationTimes` Map 在程序終止時不清除對應 key，長期累積（WindowManager.ts ~L381）
- [ ] `SystemMonitor.processHistory` 陣列無限增長，已終止程序紀錄永不移除（SystemMonitor.ts ~L175）
- [ ] `ScriptRuntime.ensureRuntimeProcess` 中 `injectApis` 若拋錯，已建立的 context 不會被釋放（ScriptRuntime.ts ~L175）
- [ ] `ScriptRuntime.execute` 中 global handle 在 inject 過程拋錯時不會 dispose（ScriptRuntime.ts ~L38-49）
- [ ] `NotificationManager.dismiss` 的 setTimeout 在 transitionend 已觸發後仍執行，timer 未清除（NotificationManager.ts ~L80）
- [ ] Context menu 掛載在 `document.body`，window destroy 時可能殘留未清理（WindowManager.ts ~L553）

---

### 🔧 核心功能

- [ ] 開發者模式（支援 APP 熱重載）
- [ ] 實作外部程式安裝功能（App 商店/安裝器）
- [ ] 全域鍵盤快捷鍵系統（Alt+F4 關閉、Alt+Tab 切換、Win+D 顯示桌面）
- [ ] 程序暫停 / 恢復功能（權限已定義，缺少實作）
- [ ] 視窗自動吸附（拖曳到邊緣半屏、四角四分屏）
- [ ] 剪貼簿 API（跨 App 複製 / 貼上）
- [ ] 音訊 API（系統音效、App 音訊播放）
- [ ] 多桌面 / 虛擬工作區
- [ ] 使用者身份認證（登入畫面、多使用者）

### 🖥️ 應用程式

- [ ] 圖片檢視器
- [ ] 「關於此系統」獨立資訊面板
- [ ] 互動展示 App（小遊戲等）

### 💅 UI / UX 品質提升

- [ ] 主題系統進化（暗色 / 亮色模式、字型設定）
- [ ] 無回應程序的使用者提示（QuickJS 超時偵測 UI）
- [ ] 視窗標題列雙擊切換最大化
- [ ] 新增開機前動畫
- [ ] 對不同設備的樣式自適應

---

### ✅ 已完成

- [x] 修正無限迴圈和大量製造視窗造成的錯誤
- [x] 修正 setTimeout 在數千次後自動停機且無提示的錯誤
- [x] 右鍵選單新增和優化支援（桌面空白處、工作列圖示、視窗標題列）
- [x] Library 庫的 import 支援
- [x] 支援 Plugin 插入
- [x] 修正多處錯誤使用 appDefId
- [x] 檔案管理器（GUI 瀏覽虛擬檔案系統）
- [x] 新增工作列收合模式（及真全螢幕視窗）
- [x] 多語言 i18n 支援
- [x] 新增使用者權限等級和內核級控制台
- [x] 系統警示彈窗（SystemAlert）
- [x] 開始選單現代化（分頁、資料夾、右鍵釘選、拖曳、內頁導覽）
- [x] UI 組件擴展（input、checkbox、select 等 12 種控制項）
- [x] 虛擬儲存空間完善化、持久化
- [x] 系統設定面板（桌布、主題色、工作列透明度、開始選單大小）
- [x] 同應用程式在工作列中合併為分頁
- [x] 修正錯誤訊息被處理為 [Object object] 的錯誤
- [x] 更新專案說明文件
- [x] 工作管理員功能追加（EventBus 追蹤、權限管理和查看、效能追蹤）
- [x] 視窗動畫、大小調整
- [x] 全域通知系統
- [x] 系統設定：通知設定（勿擾模式、顯示時長、最大數量）
- [x] 系統設定：應用程式管理（折疊分類、權限檢視）
- [x] 網路 API（抽象介面 + 允許清單實作 + 設定頁面）