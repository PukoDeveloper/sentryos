# Python Runtime 插件開發指南

本文件說明如何使用 `sentryos-plugin-python-runtime` 插件，以及如何用 **Python 3** 撰寫 SentryOS 應用程式。

---

## 目錄

- [概述與安全模型](#概述與安全模型)
- [快速開始：Hello World](#快速開始hello-world)
- [應用類型範例](#應用類型範例)
  - [Window 應用](#window-應用)
  - [Console 應用](#console-應用)
  - [Service 應用](#service-應用)
- [OS API 使用方式](#os-api-使用方式)
- [事件處理器（Handler）](#事件處理器handler)
- [可用標準函式庫](#可用標準函式庫)
- [安全限制說明](#安全限制說明)
- [Manifest 設定](#manifest-設定)
- [載入插件](#載入插件)

---

## 概述與安全模型

`python-runtime` 插件以 **Pyodide**（CPython 編譯為 WebAssembly）驅動，提供與 QuickJS 等級相同的沙箱安全性：

| 安全層 | 說明 |
|--------|------|
| **獨立命名空間** | 每個應用程序擁有獨立的 Python `dict`（`globals`），程序之間完全隔離 |
| **限制 `__builtins__`** | 危險原語（`open`、`exec`、`eval`、`compile`、`__import__`、`input`、`breakpoint`）已移除 |
| **限制 `__import__`** | 自訂 import 函式阻止存取 OS 層模組（`os`、`sys`、`subprocess`、`socket`、`ctypes`、`threading` 等） |
| **JS/Python 邊界** | OS API 以 **JsProxy** 形式注入，Python 程式碼只能透過 `OS` 物件與主機溝通 |
| **WASM 沙箱** | Pyodide 本身在 WebAssembly 環境中執行，與主機 JS 引擎隔離 |

---

## 快速開始：Hello World

### 1. 啟用插件

在宿主應用程式中載入 `sentryos-plugin-python-runtime`：

```typescript
import { createSentryOS } from 'sentryos';
import pythonRuntimePlugin from 'sentryos-plugin-python-runtime';

createSentryOS({
    container: document.getElementById('app')!,
    pluginInstances: [pythonRuntimePlugin],
});
```

### 2. 建立應用目錄

```
public/apps/my-python-app/
├── manifest.json
└── main.py
```

### 3. 撰寫 manifest.json

```json
{
  "name": "我的 Python 應用",
  "version": "1.0.0",
  "apps": [{
    "id": "my-python-app",
    "name": "我的 Python 應用",
    "main": "main.py",
    "engine": "python",
    "type": "Window",
    "permissions": ["window.create"]
  }]
}
```

關鍵設定：`"engine": "python"` — 告知系統使用 Python runtime。

### 4. 撰寫 main.py

```python
win = OS.ui.createWindow({"title": "Hello Python", "width": 400, "height": 300})
OS.ui.initialize(win["data"], [
    OS.ui.label("lbl", "Hello from Python 3!")
])
```

### 5. 在 app.json 中登錄

```json
["app/my-python-app"]
```

---

## 應用類型範例

### Window 應用

```python
# main.py — Window 類型

# 建立視窗
win = OS.ui.createWindow({
    "title": "Python Counter",
    "width": 480,
    "height": 320
})

count = [0]  # 使用 list 讓閉包可修改

def render():
    if not win.get("success"):
        return
    OS.ui.initialize(win["data"], [
        OS.ui.stack([
            OS.ui.label("lbl-count", f"計數：{count[0]}"),
            OS.ui.button("btn-inc", "+1", "increment"),
            OS.ui.button("btn-dec", "-1", "decrement"),
        ], {"padding": "16px", "gap": "8px"})
    ], {"preserveScroll": True})

render()

# 視窗事件處理器
def onWindowEvent(event):
    action = event.get("action") if hasattr(event, "get") else None
    if action == "increment":
        count[0] += 1
        render()
    elif action == "decrement":
        count[0] -= 1
        render()
```

### Console 應用

```python
# main.py — Console 類型

OS.console.writeLine("=== Python Console App ===")
OS.console.writeLine("輸入 'help' 查看指令")

history = []

def onConsoleInput(line):
    line = str(line).strip()
    if line == "help":
        OS.console.writeLine("指令：hello / history / clear / quit")
    elif line == "hello":
        OS.console.writeLine("Hello from Python!")
    elif line == "history":
        if history:
            for i, h in enumerate(history):
                OS.console.writeLine(f"  {i+1}. {h}")
        else:
            OS.console.writeLine("（無歷史記錄）")
    elif line == "clear":
        history.clear()
        OS.console.writeLine("歷史記錄已清除")
    elif line == "quit":
        OS.process.exit(0)
    else:
        OS.console.writeLine(f"未知指令：{line}")
    history.append(line)
```

### Service 應用

```python
# main.py — Service 類型（背景服務）

OS.service.setHealth("healthy")
OS.console.writeLine("[python-service] 已啟動")

# 訂閱自訂事件
OS.event.subscribe("app.data-request", "onDataRequest")

def onDataRequest(data):
    # 處理來自其他應用的請求
    request_id = data.get("requestId") if hasattr(data, "get") else None
    OS.event.emit("app.data-response", {
        "requestId": request_id,
        "result": "Hello from Python Service!"
    })
```

---

## OS API 使用方式

Python 程式碼透過全域變數 `OS` 存取所有 Host API。`OS` 是一個 JsProxy 物件，支援屬性存取與函式呼叫。

### 基本呼叫模式

```python
# JS: OS.ui.createWindow({...})
# Python:
win = OS.ui.createWindow({"title": "視窗", "width": 400, "height": 300})

# JS: OS.storage.write("key", "value")
# Python:
OS.storage.write("user.name", "Alice")

# JS: OS.console.writeLine("Hello")
# Python:
OS.console.writeLine("Hello from Python")
```

### 常用 API 對照表

| Python 呼叫 | 對應的 JavaScript |
|------------|-----------------|
| `OS.ui.createWindow({"title": "..."})` | `OS.ui.createWindow({title: "..."})` |
| `OS.ui.initialize(win["data"], [...])` | `OS.ui.initialize(win.data, [...])` |
| `OS.ui.label("id", "text")` | `OS.ui.label("id", "text")` |
| `OS.ui.button("id", "label", "action")` | `OS.ui.button("id", "label", "action")` |
| `OS.storage.read("key")` | `OS.storage.read("key")` |
| `OS.storage.write("key", "val")` | `OS.storage.write("key", "val")` |
| `OS.console.writeLine("msg")` | `OS.console.writeLine("msg")` |
| `OS.event.subscribe("evt", "handler")` | `OS.event.subscribe("evt", "handler")` |
| `OS.event.emit("evt", {"data": ...})` | `OS.event.emit("evt", {data: ...})` |
| `OS.process.exit(0)` | `OS.process.exit(0)` |
| `OS.notification.send({"title": ...})` | `OS.notification.send({title: ...})` |

### 物件屬性存取

從 OS API 回傳的 JsProxy 物件支援 `[]` 和 `.` 存取方式：

```python
result = OS.storage.read("my-key")
# 使用 [] 存取（較安全，避免與 Python 保留字衝突）
if result["success"]:
    value = result["data"]

# 也可使用 . 存取（若屬性名稱非 Python 保留字）
win = OS.ui.createWindow({"title": "Test"})
if win.success:
    win_id = win.data
```

---

## 事件處理器（Handler）

系統透過 `callHandler` 呼叫 Python 全域函式，用於事件派發。處理器以字串名稱識別（與 JavaScript 版本相同）。

### 視窗事件

視窗 UI 事件（按鈕點擊、輸入等）透過 `onWindowEvent` 處理器分派：

```python
def onWindowEvent(event):
    action = event["action"]   # 或 event.get("action")
    node_id = event.get("nodeId")
    value = event.get("value")

    if action == "my-button":
        OS.console.writeLine(f"按鈕點擊，節點：{node_id}")
```

### Console 輸入

```python
def onConsoleInput(line):
    text = str(line)
    OS.console.writeLine(f"你輸入了：{text}")
```

### 鍵盤事件

```python
def onKeyboardEvent(event):
    key = event.get("key")
    ctrl = event.get("ctrlKey")
    if key == "s" and ctrl:
        OS.console.writeLine("Ctrl+S 觸發儲存")
```

### 對話框結果

```python
def onDialogResult(result):
    if result.get("confirmed"):
        file_path = result.get("path")
        OS.console.writeLine(f"使用者選擇了：{file_path}")
```

### 事件訂閱的 Handler

透過 `OS.event.subscribe("event.name", "handlerFunctionName")` 訂閱：

```python
OS.event.subscribe("process.started", "onProcessStarted")

def onProcessStarted(data):
    OS.console.writeLine(f"程序啟動：PID={data.get('pid')}")
```

---

## 可用標準函式庫

以下 Python 標準函式庫模組在沙箱中**可用**：

| 模組 | 說明 |
|------|------|
| `math` | 數學函式 |
| `random` | 亂數生成 |
| `json` | JSON 編解碼 |
| `re` | 正規表示式 |
| `datetime` | 日期時間 |
| `collections` | 資料結構（defaultdict、Counter 等） |
| `itertools` | 迭代工具 |
| `functools` | 函式工具 |
| `string` | 字串常數 |
| `textwrap` | 文字換行 |
| `hashlib` | 雜湊函式 |
| `base64` | Base64 編解碼 |
| `urllib.parse` | URL 解析（不含 request） |
| `struct` | 二進位資料封裝 |

```python
import math
import json
import random
from datetime import datetime
from collections import defaultdict

result = math.sqrt(2)
data = json.dumps({"value": result})
now = datetime.now().isoformat()
OS.console.writeLine(f"√2={result:.4f}, time={now}")
```

---

## 安全限制說明

### 已封鎖的內建函式

以下內建函式在沙箱中**不可用**：

| 函式 | 原因 |
|------|------|
| `open` | 阻止檔案系統直接存取（請使用 `OS.storage`） |
| `exec` / `eval` | 防止動態程式碼執行繞過沙箱 |
| `compile` | 防止位元組碼操作 |
| `__import__` | 由自訂限制版本取代 |
| `input` | 請使用 Console 應用的 `onConsoleInput` |
| `breakpoint` | 防止偵錯器掛接 |

### 已封鎖的模組

以下模組在沙箱中**不可 import**：

```
os, sys, subprocess, socket, ctypes,
importlib, pathlib, io, shutil, tempfile,
_thread, threading, multiprocessing, signal,
mmap, resource, gc, traceback, inspect,
ast, dis, code, codeop, ...
```

嘗試 import 這些模組會拋出 `ImportError`：

```python
import os  # ❌ ImportError: Module 'os' is blocked in the SentryOS sandbox
```

### 替代方案

| 被封鎖的操作 | 安全替代方案 |
|------------|------------|
| `open("file")` | `OS.storage.read("tier/key")` |
| `subprocess.run(...)` | 不支援（沙箱設計如此） |
| `socket.connect(...)` | `OS.network.request(...)` |
| `threading.Thread(...)` | 不支援（單執行緒沙箱） |
| `os.environ` | `OS.env.get("VAR_NAME")` |

---

## Manifest 設定

完整的 Python 應用 manifest 範例：

```json
{
  "name": "My Python App",
  "version": "1.0.0",
  "apps": [{
    "id": "my-python-app",
    "name": "Python 應用",
    "description": "使用 Python 3 撰寫的 SentryOS 應用",
    "main": "main.py",
    "engine": "python",
    "type": "Window",
    "icon": "icon.svg",
    "permissions": [
      "window.create",
      "file.read.app",
      "file.write.user",
      "console.write",
      "notification.send",
      "event.subscribe.process.*",
      "event.emit.app.*"
    ]
  }]
}
```

### `engine` 欄位

| 值 | 說明 |
|----|------|
| （未指定）| 使用 QuickJS（預設） |
| `"python"` | 使用 Pyodide Python 3 runtime |
| `"lua"` | 使用 Fengari Lua 5.3 runtime |

---

## 載入插件

安裝 `sentryos-plugin-python-runtime` 後，在宿主應用程式的 `pluginInstances` 中加入：

```typescript
import { createSentryOS } from 'sentryos';
import pythonRuntimePlugin from 'sentryos-plugin-python-runtime';

createSentryOS({
    container: document.getElementById('app')!,
    pluginInstances: [pythonRuntimePlugin],
});
```

### 注意事項

- Pyodide 首次載入需要從 CDN 下載約 **10–20 MB** 的 WASM 與標準函式庫，建議網路環境下使用。
- 第二次及後續載入會由瀏覽器快取加速。
- Pyodide 初始化是非同步的，插件 setup 採用非同步載入，系統啟動時插件會在背景初始化。
- 在 Pyodide 完成初始化前，嘗試啟動 `engine: "python"` 的應用程式將會失敗並顯示錯誤。

---

## 完整範例：Python 計算機

```python
# main.py
# 一個功能完整的計算機應用，展示 Python runtime 的各種特性

import math
import json

win = OS.ui.createWindow({
    "title": "Python 計算機",
    "width": 360,
    "height": 480,
    "style": {
        "background": "rgba(10, 14, 20, 0.96)",
        "color": "#ecf4ff"
    }
})

state = {"expression": "", "result": "", "error": False}

def evaluate(expr):
    """安全地評估數學表達式"""
    # 只允許數字、運算符和常用函式
    allowed_names = {
        "sqrt": math.sqrt,
        "sin": math.sin,
        "cos": math.cos,
        "tan": math.tan,
        "pi": math.pi,
        "e": math.e,
        "abs": abs,
        "round": round,
        "pow": pow,
    }
    # 不使用 eval（已被沙箱封鎖），改用 ast-free 方式
    # 真實實作應使用解析器；此處為示範
    return None

def render():
    if not win.get("success"):
        return

    display_style = {
        "background": "#1a1f2e" if not state["error"] else "#2e1a1a",
        "color": "#ff6b6b" if state["error"] else "#ecf4ff",
        "padding": "12px",
        "fontFamily": "monospace",
        "fontSize": "20px",
        "textAlign": "right",
        "borderRadius": "4px"
    }

    OS.ui.initialize(win["data"], [
        OS.ui.stack([
            OS.ui.label("display-expr",
                state["expression"] or "0",
                {"style": display_style}),
            OS.ui.grid(
                [
                    OS.ui.button("btn-7", "7", "digit:7"),
                    OS.ui.button("btn-8", "8", "digit:8"),
                    OS.ui.button("btn-9", "9", "digit:9"),
                    OS.ui.button("btn-div", "÷", "op:/"),
                    OS.ui.button("btn-4", "4", "digit:4"),
                    OS.ui.button("btn-5", "5", "digit:5"),
                    OS.ui.button("btn-6", "6", "digit:6"),
                    OS.ui.button("btn-mul", "×", "op:*"),
                    OS.ui.button("btn-1", "1", "digit:1"),
                    OS.ui.button("btn-2", "2", "digit:2"),
                    OS.ui.button("btn-3", "3", "digit:3"),
                    OS.ui.button("btn-sub", "−", "op:-"),
                    OS.ui.button("btn-0", "0", "digit:0"),
                    OS.ui.button("btn-dot", ".", "digit:."),
                    OS.ui.button("btn-eq", "=", "equals"),
                    OS.ui.button("btn-add", "+", "op:+"),
                ],
                {"columns": 4, "gap": "4px"}
            ),
            OS.ui.stack([
                OS.ui.button("btn-clear", "AC", "clear"),
                OS.ui.button("btn-sqrt", "√", "func:sqrt"),
            ], {"direction": "row", "gap": "4px"})
        ], {"padding": "12px", "gap": "8px"})
    ], {"preserveScroll": True})

render()

def onWindowEvent(event):
    action = str(event.get("action") or "")

    if action.startswith("digit:"):
        digit = action[6:]
        state["expression"] += digit
        state["error"] = False
    elif action.startswith("op:"):
        op = action[3:]
        state["expression"] += f" {op} "
        state["error"] = False
    elif action == "clear":
        state["expression"] = ""
        state["result"] = ""
        state["error"] = False
    elif action == "func:sqrt":
        try:
            val = float(state["expression"] or "0")
            state["expression"] = str(math.sqrt(val))
        except ValueError:
            state["error"] = True
            state["expression"] = "錯誤"
    # equals 按鈕：此沙箱版本顯示提示
    elif action == "equals":
        state["expression"] += " ="

    render()
```

---

## 型別參考

完整 API 型別定義請參考：
- [`sentryos-sdk/app`](../../packages/sdk/src/app.ts) — OsApi 型別
- [`sentryos-sdk/plugin`](../../packages/sdk/src/plugin.ts) — PluginContext 型別
- [`docs/app-development/host-api.md`](../app-development/host-api.md) — Host API 完整參考
