# 資料流

本文件描述 SentryOS 中的主要資料流動路徑。

---

## 應用程式啟動流程（Window）

```
StartMenu click
  → DesktopShell.launchHandler(app)
    → ApplicationLauncher.launchApplication(app)
      → ProcessManager.launch(systemAppId, appDefId, { type })
        → PermissionsManager.new() → processAppId
        → 建立 Process 實例
      → fetch(app.mainPath) → code
      → ScriptRuntime.execute(pid, code)
        → ensureRuntimeProcess() → QuickJS Runtime/Context
        → injectApis() → 注入 OS.{pid, subscribe, emit, createWindow, ...}
        → evalCode(code) → app 主程式執行
          → OS.createWindow() → WindowManager.createWindow() → DOM 建立
          → OS.initialize(wid, tree) → WindowManager.initializeUi() → DOM 渲染
```

---

## Console 應用啟動流程

```
launchApplication(deps, { app, type: 'Console' })
  → ProcessManager.launch(systemAppId, appId, { type: 'Console' })
  → fetch(app.mainPath) → code
  → WindowManager.createConsoleWindow(context, title, inputHandler)
    → createWindow() → DOM 建立（含 .console-body、.console-output、.console-input）
    → 回傳 ConsoleWindowController { appendLine, appendText, clear }
  → consoleControllers.set(processAppId, controller)
  → ScriptRuntime.execute(pid, code)
    → app 初始化（輸出歡迎訊息等）
```

---

## Console 輸入/輸出流程

```
使用者在 Console 輸入框按 Enter
  → inputHandler(text)                    [WindowManager.ts]
    → ScriptRuntime.dispatchConsoleInput(processAppId, line)
      → evalCode: 'onConsoleInput("...")'
        → app 內 globalThis.onConsoleInput(line)
          → OS.writeLine(response)
            → controller.appendLine(text)   → DOM 更新 .console-output
```

---

## Library 載入流程

### 開機載入

```
bootstrapSystem
  → libraries = catalogApps.filter(type === 'Library')
  → for each lib:
       → ProcessManager.launch() → pid
       → fetch(lib.mainPath) → code
       → EnvironmentManager.registerLibrary(libraryId, code)   快取原始碼
       → ScriptRuntime.execute(pid, code)                      執行 init
         → OS.registerCommand(...)                             註冊 CLI 命令
         → globalThis.__commands['cmd'] = handler              設定命令處理函式
       → ScriptRuntime.destroyProcessRuntime(pid)              銷毀 Runtime
       → ProcessManager.terminate(systemAppId, pid)            終止程序
```

### 執行期載入（由其他程序呼叫）

```
consoleApp → OS.loadLibrary('stdlib/Math Utils')
  → EnvironmentManager.getLibraryCode(libraryId)
  → ScriptRuntime.evaluateInContext(pid, code)     在呼叫者的 Context 中執行
    → 程式庫的全域物件（MathUtils 等）與 __commands 載入到呼叫者 Context
```

---

## 命令自動分派流程

```
Console 使用者輸入 "factorial 5"（未識別的命令）
  → OS.resolveCommand('factorial')
    → EnvironmentManager.getCommand('factorial')
    → 回傳 { name, libraryId: 'stdlib/Math Utils', description, usage }
  → OS.loadLibrary('stdlib/Math Utils')
    → ScriptRuntime.evaluateInContext(pid, code)
    → MathUtils、__commands 載入成功
  → globalThis.__commands['factorial'](['5'])
    → 回傳 '120'
  → OS.writeLine('120')
```

---

## UI 事件回傳流程

```
使用者點擊 button
  → DOM click event
    → WindowManager eventBinding listener
      → uiEventHandler(WindowUiEvent)
        → onWindowUiEvent(event)              [ApplicationLauncher.ts]
          → ScriptRuntime.dispatchUiEvent(processAppId, event)
            → evalCode: 'onWindowEvent(${JSON.stringify(event)})'
              → app 內 globalThis.onWindowEvent(event)
                → 更新應用狀態
                → OS.initialize(wid, newTree)  // 重新渲染
                  → WindowManager.initializeUi()
                    → DOM replaceChildren()
```

---

## 視窗關閉 & 程序清理

```
使用者點擊 × 或 app 呼叫 close
  → WindowManager.closeWindow(processAppId, windowId)
    → 移除 DOM 節點
    → 清除 eventBindings（pruneBindings）
    → emitWindowChange('closed', descriptor)
      → windowChangeListener            [ApplicationLauncher.ts]
        ├─ syncOpenWindows()             更新工作列
        └─ 檢查 remainingWindows
           └─ if (remainingWindows === 0)
                ├─ consoleControllers.delete(processAppId)  清除 Console controller
                ├─ runtime.destroyProcessRuntime(pid)
                │    ├─ 清除事件訂閱
                │    └─ dispose Runtime + Context
                └─ processManager.terminate(systemAppId, pid)
                     ├─ 遞迴終止子程序
                     ├─ eventBus.removeApp(processAppId)
                     └─ permissions.removeApp(systemAppId, processAppId)
```

---

## 工作列互動流程

```
工作列 icon 點擊
  → DesktopShell.taskbarWindowClickHandler(windowId, processAppId)
    → WindowManager.focusWindow(processAppId, windowId)
      ├─ if (state === 'minimized')
      │    ├─ state = stateBeforeMinimize ?? 'normal'
      │    ├─ stateBeforeMinimize = undefined
      │    ├─ root.style.display = 'block'
      │    └─ applyWindowLayout(descriptor)
      ├─ zIndex = nextZIndex(alwaysOnTop)
      ├─ root.classList.add('is-focused')
      └─ emitWindowChange('focused', descriptor)
           → syncOpenWindows()   更新工作列狀態
```

---

## 開始選單啟動流程

```
使用者點擊開始按鈕
  → toggleStartPanel()
    → .desktop-start-panel.classList.toggle('is-hidden')
    → renderStartMenu()      依搜尋關鍵字篩選應用列表（僅顯示 Window / Console）

使用者點擊應用項目
  → launchHandler(app)       [由 onLaunchRequest 綁定]
    → launchApplication(deps, { app, type })
      → ProcessManager.launch() → pid
      → fetch(mainPath) → code
      → ScriptRuntime.execute(pid, code)
    → toggleStartPanel()     關閉開始選單
```

---

## 視窗最小化 / 還原流程

```
最小化：
  titlebar (−) click
    → minimizeWindow(processAppId, windowId)
      → stateBeforeMinimize = current.state   // 'normal' 或 'maximized'
      → state = 'minimized'
      → root.style.display = 'none'
      → emitWindowChange('minimized')

還原（從工作列點擊）：
  taskbar icon click
    → focusWindow(processAppId, windowId)
      → state = stateBeforeMinimize ?? 'normal'
      → stateBeforeMinimize = undefined
      → root.style.display = 'block'
```
