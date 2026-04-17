# 插件開發指南

本文件說明如何開發 SentryOS 插件。插件可以擴充系統功能，包括：新增 Host API、註冊自訂 Runtime 引擎、擴充 UI 元件、監聽系統事件等。

---

## 快速開始

### 最小可行插件

```javascript
// /plugins/my-plugin.js

function setup(context) {
    context.log('INFO', 'My Plugin loaded');
}

function teardown(context) {
    context.log('INFO', 'My Plugin unloaded');
}

export default {
    pluginName: 'my-plugin',
    pluginVersion: '1.0.0',
    pluginDescription: '最小範例插件',
    setup,
    teardown,
};
```

### 註冊插件

在 `public/plugins.json` 中加入路徑：

```json
[
    "/plugins/dev.js",
    "/plugins/my-plugin.js"
]
```

系統開機時會自動按順序載入所有插件。

---

## PluginModule 介面

每個插件必須匯出（default export 或具名匯出）一個符合以下結構的物件：

```typescript
interface PluginModule {
    /** 插件唯一名稱（用於依賴解析和去重） */
    pluginName: string;

    /** 語義化版本號 */
    pluginVersion: string;

    /** 人類可讀的描述 */
    pluginDescription?: string;

    /** 作者資訊 */
    author?: string;

    /** 所需權限列表。未指定時預設為 ['*']（全權限） */
    permissions?: string[];

    /** 依賴的其他插件名稱（必須先載入） */
    dependencies?: string[];

    /** 初始化函式，接收 PluginContext */
    setup: (context: PluginContext) => void | Promise<void>;

    /** 清理函式，接收同一個 PluginContext */
    teardown: (context: PluginContext) => void | Promise<void>;
}
```

### 權限

`permissions` 欄位宣告插件需要的系統權限。如果不指定，預設授予 `['*']` 萬用字元。如需限縮權限：

```javascript
export default {
    pluginName: 'restricted-plugin',
    pluginVersion: '1.0.0',
    permissions: [
        'event.subscribe.process.started',
        'event.subscribe.process.stopped',
        'file.read.app',
    ],
    setup(ctx) { /* ... */ },
    teardown(ctx) { /* ... */ },
};
```

### 依賴

`dependencies` 欄位指定此插件依賴的其他插件。`PluginManager` 在載入時會：

1. 並行 fetch 所有插件模組
2. 使用 Kahn's 算法進行拓撲排序
3. 按依賴順序呼叫 `setup()`

```javascript
export default {
    pluginName: 'extended-editor',
    pluginVersion: '1.0.0',
    dependencies: ['sentryos-monaco-editor'],
    setup(ctx) {
        // 此時 sentryos-monaco-editor 已載入
    },
    teardown(ctx) { /* ... */ },
};
```

若依賴未載入或形成循環，該插件會被標記為 failed。

---

## PluginContext API

`setup()` 和 `teardown()` 接收到的 `context` 物件提供以下功能：

### 屬性

| 屬性 | 型別 | 說明 |
|------|------|------|
| `pluginName` | `string` | 插件名稱 |
| `pluginAppId` | `string` | 插件的 appId（`plugin_` + pluginName） |

### Kernel 存取

```javascript
// 取得核心服務（ServiceMap 的 key）
const processManager = context.resolve('processManager');
const fileSystem = context.resolve('fileSystem');
const eventBus = context.resolve('eventBus');

// 取得核心值（ValueMap 的 key）
const systemAppId = context.get('systemAppId');
const catalogApps = context.get('catalogApps');
```

可用的 ServiceMap key 和 ValueMap key 請參考[架構概覽](../architecture/overview.md#kernel--service-locator)。

### 事件系統

事件以插件的 `pluginAppId` 為範圍進行權限檢查。

```javascript
// 監聽事件
const result = context.on('process.started', (data) => {
    context.log('INFO', `Process started: PID ${data.pid}`);
});

// 取消監聽
context.off('process.started', myListener);

// 發射事件
context.emit('my-plugin.custom-event', { key: 'value' });
```

需要對應的 `event.subscribe.<eventName>` 和 `event.emit.<eventName>` 權限。

### Host API 註冊

透過 `registerApi()` 將自訂 API 注入沙箱中的 `OS` 全域物件：

```javascript
function setup(context) {
    context.registerApi(
        'myApi',        // API 名稱（對應 OS.myApi.*）
        (ctx) => ({     // ApiFactory 函式
            hello: () => `Hello from PID ${ctx.pid}`,
            add: (a, b) => a + b,
        }),
        [],             // 權限閘門（空 = 無需額外權限）
        'myPlugin'      // 分組名稱（可選，用於 OS 命名空間組織）
    );
}

function teardown(context) {
    // cleanup() 會自動反註冊，通常不需手動呼叫
}
```

#### ApiFactory 簽名

```typescript
type ApiFactoryContext = {
    pid: number;           // 程序 PID
    process: ProcessView;  // 程序資訊快照
};

type ApiFactory = (ctx: ApiFactoryContext) => Record<string, HostApiValue>;
```

`ApiFactory` 在每個程序首次呼叫該 API 時執行，回傳的物件會被注入到 `OS.{group ?? name}` 命名空間下。

#### 權限閘門

`gates` 參數指定呼叫此 API 所需的額外權限：

```javascript
context.registerApi(
    'adminApi',
    (ctx) => ({
        shutdown: () => { /* ... */ },
    }),
    ['system.admin'],    // 應用 manifest 必須包含此權限才能使用
);
```

#### 在沙箱中使用

註冊後，所有應用程式（所有 Runtime 引擎）都可以透過 `OS` 物件存取：

```javascript
// 在應用程式沙箱中
const result = OS.myApi.hello();   // "Hello from PID 42"
const sum = OS.myApi.add(1, 2);    // 3
```

### UI 元件註冊

擴充視窗系統的 UI 元件：

```javascript
context.registerUiComponent(
    'custom-chart',     // 元件類型名稱
    {
        // UiComponentRenderer — 負責將 node 轉為 DOM 元素
        render(node, ctx) {
            const el = document.createElement('canvas');
            ctx.applyStyle(el, node.style);
            ctx.registerNode(node.id, el);
            // 繪製圖表邏輯...
            return el;
        },
        // 可選：差量更新
        patch(element, patch, ctx) {
            // 處理更新...
            return true; // 已處理
        },
    },
    // UiComponentApiBuilder — 為沙箱提供建構 API
    (windowId, processAppId) => ({
        create: (props) => ({
            type: 'custom-chart',
            props,
        }),
    }),
);
```

註冊後，應用程式可在 UI 樹中使用此元件類型。

### Runtime 引擎註冊

SentryOS 提供兩種方式建立自訂 Runtime 引擎：

#### 方式 A：Adapter 模式（推薦）

使用 `context.createRuntime(adapter)` 工廠函式，只需提供沙箱的 4 個核心操作。IPC、事件訂閱、API 表面建構等引擎無關的邏輯由系統自動處理。

```javascript
function setup(context) {
    const runtime = context.createRuntime({
        createSandbox(pid) {
            // 建立 VM 實例（例如 Lua VM）
            return new LuaVM();
        },
        injectGlobals(vm, apiSurface) {
            // 將 OS API 注入沙箱的全域空間
            // apiSurface 是完整的 { ui: {...}, storage: {...}, ... } 物件
            vm.global.set('OS', apiSurface);
        },
        execute(vm, code, timeoutMs) {
            // 在沙箱中執行程式碼
            return vm.doString(code);
        },
        destroy(vm) {
            // 釋放 VM 資源
            vm.close();
        },
    });
    context.registerRuntime('lua', runtime);
}
```

**RuntimeAdapter 介面：**

```typescript
interface RuntimeAdapter {
    createSandbox(pid: number): unknown;
    injectGlobals(sandbox: unknown, apiSurface: Record<string, HostApiValue>): void;
    execute(sandbox: unknown, code: string, timeoutMs?: number): unknown;
    destroy(sandbox: unknown): void;
}
```

#### 方式 B：繼承 BaseRuntime（進階）

適用於需要深度定製的場景（自訂 IPC 行為、module loader 等）。透過 `context.BaseRuntime` 取得類別參考並繼承：

```javascript
function setup(context) {
    class MyRuntime extends context.BaseRuntime {
        #sandboxes = new Map();

        execute(pid, code, timeoutMs, entryPath) {
            const proc = this.getProcess(pid);
            if (!proc) return { success: false, error: 'ProcessNotFound' };
            if (proc.status !== 'running') return { success: false, error: 'ProcessNotRunning' };

            if (!this.#sandboxes.has(pid)) {
                const vm = createMyVM();
                this.#sandboxes.set(pid, vm);
                this.processStates.set(pid, {
                    inbox: [], eventSubscriptions: new Map(), entryPath: entryPath ?? null,
                });
                // buildApiSurface() 自動合併內建 API + 中央 Host API
                const api = this.buildApiSurface(proc);
                injectIntoVM(vm, api);
            }

            try {
                const result = this.#sandboxes.get(pid).eval(code);
                return { success: true, data: this.normalizeReturnValue(result) };
            } catch (err) {
                return { success: false, error: 'RuntimeError', data: String(err) };
            }
        }

        evaluateInContext(pid, code) { /* 類似 execute 但不重新注入 API */ }

        destroyProcessRuntime(pid) {
            const vm = this.#sandboxes.get(pid);
            if (vm) { vm.close(); this.#sandboxes.delete(pid); }
            // 清理事件訂閱
            const state = this.processStates.get(pid);
            if (state) {
                const proc = this.getProcess(pid);
                if (proc) {
                    for (const [event, listener] of state.eventSubscriptions) {
                        this.eventBus.off(proc.processAppId, event, listener);
                    }
                }
                this.processStates.delete(pid);
            }
        }

        destroyAll() {
            for (const pid of [...this.#sandboxes.keys()]) this.destroyProcessRuntime(pid);
        }
    }

    // 注意：BaseRuntime 建構子需要 Kernel 實例
    // 但 context.resolve() 回傳的是各個服務，不是 Kernel 本身
    // 使用方式：透過 resolve 取得需要的服務手動組裝
    context.registerRuntime('my-engine', new MyRuntime(/* kernel */));
}
```

**BaseRuntime 提供的受保護方法：**

| 方法 | 說明 |
|------|------|
| `buildApiSurface(process)` | 建構完整 OS API 物件（內建 + Host API） |
| `normalizeReturnValue(value)` | 正規化回傳值為可序列化格式 |
| `getProcess(pid)` | 取得程序資訊 |
| `subscribeProcessEvent(pid, appId, event)` | 為程序訂閱事件 |
| `unsubscribeProcessEvent(pid, appId, event)` | 取消程序事件訂閱 |
| `pushMessage(from, to, channel, payload)` | 推送 IPC 訊息 |
| `readInbox(pid)` | 讀取並清空程序收件箱 |

**兩種方式的對比：**

| | Adapter 模式 | 繼承 BaseRuntime |
|---|---|---|
| 複雜度 | 低（4 個方法） | 高（4 個抽象方法 + 狀態管理） |
| 彈性 | 標準流程 | 完全自訂 |
| 適用場景 | 一般語言引擎 | 需要自訂 IPC、module loader 等 |
| 事件/IPC | 自動處理 | 需自行管理清理 |

註冊後，應用程式可在 `manifest.json` 中指定 `"engine": "my-engine"` 來使用此引擎。

### 日誌

```javascript
context.log('INFO', 'Something happened');
context.log('WARN', 'Something suspicious');
context.log('ERROR', 'Something went wrong');
```

日誌會同時輸出到瀏覽器 console 和 KernelConsole（如果可用）。

---

## 自動清理

`PluginContext` 會追蹤所有透過它進行的註冊：

- `registerApi()` → 追蹤 API 名稱
- `registerUiComponent()` → 追蹤 UI 元件類型
- `registerRuntime()` / `createRuntime()` → 追蹤引擎名稱
- `on()` → 追蹤事件監聽器

當插件被卸載時，`PluginManager` 會呼叫 `teardown()` 然後 `context.cleanup()`，自動反註冊所有項目。你的 `teardown()` 只需清理 context 追蹤範圍外的資源。

---

## 插件卸載

`PluginManager` 支援三種卸載模式：

| 模式 | 行為 | 使用場景 |
|------|------|---------|
| `soft` | 僅卸載該插件本身 | 安全移除無依賴者的插件 |
| `root` | 卸載該插件 + 所有直接/間接依賴它的插件 | 按依賴樹移除 |
| `force` | 強制卸載（忽略依賴關係） | 緊急移除或除錯 |

---

## 完整範例：自訂 API 插件

```javascript
// /plugins/math-api.js

function setup(context) {
    // 註冊 OS.math.* API
    context.registerApi(
        'mathApi',
        (ctx) => ({
            fibonacci: (n) => {
                if (n <= 1) return n;
                let a = 0, b = 1;
                for (let i = 2; i <= n; i++) {
                    [a, b] = [b, a + b];
                }
                return b;
            },
            isPrime: (n) => {
                if (n < 2) return false;
                for (let i = 2; i <= Math.sqrt(n); i++) {
                    if (n % i === 0) return false;
                }
                return true;
            },
        }),
        [],       // 無額外權限要求
        'math'    // 掛載到 OS.math.*
    );

    // 監聽程序啟動事件
    context.on('process.started', (data) => {
        context.log('INFO', `Math API available for PID ${data.pid}`);
    });

    context.log('INFO', 'Math API plugin loaded');
}

function teardown(context) {
    context.log('INFO', 'Math API plugin unloading');
    // registerApi 和 on 的清理由 context.cleanup() 自動處理
}

export default {
    pluginName: 'math-api',
    pluginVersion: '1.0.0',
    pluginDescription: '提供數學運算 API',
    author: 'SentryOS',
    permissions: ['event.subscribe.process.started'],
    setup,
    teardown,
};
```

應用程式使用方式：

```javascript
// 在任意應用程式沙箱中
const fib10 = OS.math.fibonacci(10);  // 55
const prime = OS.math.isPrime(17);     // true
```

---

## 完整範例：Runtime 引擎插件

以下是使用 **Adapter 模式**（推薦）的 Lua Runtime 插件範例：

```javascript
// /plugins/lua-runtime.js
import { LuaFactory } from 'wasmoon';

let factory;

async function setup(context) {
    factory = await new LuaFactory();

    const runtime = context.createRuntime({
        createSandbox(pid) {
            return factory.createEngine();
        },
        injectGlobals(lua, apiSurface) {
            // 將整個 OS API 表面注入 Lua 全域空間
            for (const [ns, methods] of Object.entries(apiSurface)) {
                lua.global.set(ns, methods);
            }
        },
        execute(lua, code, timeoutMs) {
            return lua.doString(code);
        },
        destroy(lua) {
            lua.global.close();
        },
    });

    context.registerRuntime('lua', runtime);
    context.log('INFO', 'Lua runtime engine registered (adapter mode)');
}

function teardown(context) {
    context.log('INFO', 'Lua runtime engine unregistered');
}

export default {
    pluginName: 'lua-runtime',
    pluginVersion: '1.0.0',
    pluginDescription: 'Lua 5.4 runtime engine (Wasmoon)',
    dependencies: [],
    setup,
    teardown,
};
```

使用 Adapter 模式時，IPC 路由、事件訂閱/取消、API 表面建構（buildApiSurface）等全部由 `AdapterRuntime` 自動處理，插件只需專注於沙箱本身的操作。

---

## 常見問題

### 插件載入失敗

常見原因：
- 未匯出 `setup` 或 `teardown` 函式
- `pluginName` 為空或非字串
- 依賴的插件不存在或形成循環

### API 名稱衝突

若多個插件或系統模組註冊相同 API 名稱，後者會覆蓋前者。建議使用有識別性的前綴。

### 存取 Kernel 服務

`context.resolve()` 和 `context.get()` 與 Kernel 的同名方法行為一致。取得服務後可直接呼叫其方法，但請注意權限檢查仍以插件的 `pluginAppId` 進行。

---

## 型別參考

完整的型別定義請參考 [sentryos-plugin.d.ts](../types/sentryos-plugin.d.ts)。
