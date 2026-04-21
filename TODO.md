## 待辦事項

---

### 🔴 Bug 修復

- [ ] **[Critical]** `ScriptRuntime.syncFetch` 使用同步 XHR 阻塞主線程，多模組載入時 UI 完全凍結（ScriptRuntime.ts ~L516）
- [ ] **[Medium]** `WindowManager.closeWindow` 先刪除 descriptor 但 DOM 延遲 220ms 移除（設計上為避免工作管理員關閉自身時異常，需評估是否有更優解）

---

### 🔧 效能優化

- [ ] Auto-start apps 中 Services 可並行啟動（systemBootstrap.ts ~L460）
- [ ] `FileSystem.persistTier` 每次寫入/刪除序列化整個 tier 到 localStorage，高頻寫入需節流（FileSystem.ts ~L430）
- [ ] `SystemMonitor` 的 `recentEvents.shift()` 是 O(n)，建議改用環形緩衝區（SystemMonitor.ts ~L176）
- [ ] 多層 `backdrop-filter: blur()` 疊加（taskbar + start panel + context menu + notifications），低階設備效能差（style.css）

---

### 🧹 程式碼品質

- [ ] `RuntimeResult<T>` 應改為 discriminated union 以獲得型別安全（runtime/types.ts ~L18）
- [ ] `networkApi.request` 宣告為 async 但 QuickJS 同步環境無法處理 Promise 回傳（networkApi.ts ~L28）
- [ ] 部分互動元素缺少 `:focus-visible` 樣式，影響鍵盤無障礙

---

### 🔩 核心功能

- [ ] 開發者模式（支援 App 熱重載，無需重新整頁）
- [ ] 全域鍵盤快捷鍵系統（Alt+F4 關閉、Alt+Tab 切換、Win+D 顯示桌面）
- [ ] 程序暫停 / 恢復功能（權限已定義，缺少實作）
- [ ] 視窗自動吸附（拖曳到邊緣半屏、四角四分屏）
- [x] 剪貼簿 API（跨 App 複製 / 貼上）
- [x] 音訊 API（系統音效、App 音訊播放）
- [ ] 多桌面 / 虛擬工作區
- [ ] 使用者身份認證（登入畫面、多使用者）

---

### 🖥️ 應用程式

- [ ] 「關於此系統」獨立資訊面板
- [ ] 互動展示 App（小遊戲等）

---

### 💅 UI / UX 品質提升

- [ ] 主題系統進化（暗色 / 亮色模式、字型設定）
- [ ] 無回應程序的使用者提示（QuickJS 超時偵測 UI）
- [ ] 視窗標題列雙擊切換最大化
- [ ] 新增開機前動畫
- [ ] 對不同設備的樣式自適應

---

### 💡 開發建議

- [ ] **建立測試基礎設施**：目前缺乏任何自動化測試。建議為 Kernel、EventBus、FileSystem、PermissionsManager 等核心模組撰寫單元測試（e.g. Vitest），可大幅降低回歸風險。
- [ ] **加強 TypeScript 嚴格模式**：在 `tsconfig.json` 中啟用 `strict: true`（目前未啟用），並逐步消除 `any` 型別，提升整體型別安全性。
- [ ] **ScriptRuntime 改用非同步載入**：以 Worker 或非同步 fetch 取代 `syncFetch` 同步 XHR，解決 UI 凍結問題，也為未來多執行緒執行奠定基礎。
- [ ] **建立 App 開發 SDK 與範例文件**：整理 Host API 介面、IPC 協定、權限清單，讓第三方開發者能更容易撰寫 SentryOS App。
- [ ] **錯誤追蹤與結構化 logging**：在 Kernel 層統一收集未捕獲錯誤並寫入虛擬 log 檔，方便開發者事後排查問題，也可串接系統監視器顯示。
- [ ] **LocalStorage 抽象化**：將 `FileSystem.persistTier` 對 localStorage 的直接依賴抽象為 StorageAdapter 介面，未來可替換為 IndexedDB 或其他後端，並簡化節流邏輯的實作。
- [ ] **沙箱安全審計**：定期審查 QuickJS 沙箱對 Host API 的暴露面，確認每項 API 均經過權限檢查，並評估是否需要資源配額（CPU 時間、記憶體上限）。
- [ ] **CI/CD 流程**：在 GitHub Actions 中加入自動 build + lint + test pipeline，確保每次 PR 合併前程式碼品質維持一定水準。