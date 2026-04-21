# html-view 元件

`html-view` 是由 `sentryos-html-view` 插件提供的 UI 元件。它允許應用程式以 HTML 字串描述視覺介面，同時讓所有邏輯繼續在應用程式的 Runtime（QuickJS / Lua 等）中執行。

**不使用 iframe 沙盒。** HTML 僅作為顯示層，互動行為可透過兩種方式實現：
1. `data-event` 屬性：宣告 DOM 事件，由 Runtime 的事件管道（`onWindowEvent`）統一處理。
2. `<script>` 標籤：腳本內容會被提取後送回沙箱 Runtime 執行，可呼叫 `OS.htmlView` API 動態操作 DOM。

---

## 架構

```
應用程式 Runtime（QuickJS / Lua）
  ↓  OS.ui.initialize() — 傳入含 <script> 的 html-view 節點
  ↓
Plugin renderer（主頁面 DOM）
  ↓  innerHTML 渲染（iframe / on* 屬性被剝除；<script> 被提取）
  ↓
  ├── DOM 事件監聽器（data-event 屬性驅動）
  │     ↓  ctx.bindEvent() + dispatch()
  │     ↓  onWindowEvent(event) — 回到 Runtime 執行
  │
  └── <script> 內容 → ctx.dispatchScript() → evaluateInContext(pid, code)
        ↓  在沙箱中執行，可呼叫 OS.htmlView.append() / OS.htmlView.remove()
        ↓  WindowManager 直接操作對應 html-view 的 DOM
```

---

## 使用方式

### 基本範例（data-event）

```javascript
// QuickJS 沙盒代碼
OS.ui.initialize(windowId, [{
    type: 'html-view',
    id: 'myView',
    html: `
        <h2>Hello, SentryOS!</h2>
        <button data-event="click" data-id="greetBtn" data-value="hello">
            Say Hello
        </button>
        <input data-event="input" data-id="nameInput" placeholder="Enter name" />
    `,
}]);

function onWindowEvent(e) {
    if (e.controlId === 'greetBtn') {
        OS.console.log('Button clicked, value: ' + e.value);
    }
    if (e.controlId === 'nameInput') {
        OS.console.log('Input changed: ' + e.value);
    }
}
```

### <script> 腳本執行與動態 DOM 操作

`<script>` 標籤的內容會被提取並在沙箱 Runtime 中執行，可使用 `OS.htmlView` API 動態建立或移除節點。

```javascript
OS.ui.initialize(windowId, [{
    type: 'html-view',
    id: 'dynamicView',
    html: `
        <ul id="item-list"></ul>
        <script>
            // 此程式碼在沙箱 Runtime（QuickJS）中執行
            var items = ['Apple', 'Banana', 'Cherry'];
            var html = items.map(function(item, i) {
                return '<li data-id="item-' + i + '">' + item +
                       ' <button data-event="click" data-id="del-' + i + '" data-value="' + i + '">✕</button></li>';
            }).join('');
            OS.htmlView.append(windowId, 'dynamicView', html);
        <\/script>
    `,
}]);

function onWindowEvent(e) {
    // 點擊刪除按鈕時移除對應的 <li>
    if (e.controlId && e.controlId.startsWith('del-')) {
        var index = e.value;
        OS.htmlView.remove(windowId, 'dynamicView', 'item-' + index);
    }
}
```

---

## html-view 節點介面

```typescript
interface WindowHtmlViewNode {
    type: 'html-view';
    id?: string;            // 此元件的識別碼
    html: string;           // 要渲染的 HTML 字串（可含 <script> 標籤）
    style?: WindowUiStyle;  // 套用至外層容器的樣式
}
```

---

## data-* 屬性參考

| 屬性 | 說明 |
|------|------|
| `data-event` | **必填。** 要監聽的 DOM 事件名稱，例如 `click`、`input`、`change`。 |
| `data-id` | 事件的 `controlId`，對應 `onWindowEvent(e)` 中的 `e.controlId`。 |
| `data-value` | 靜態值，觸發事件時傳入 `e.value`。適用於按鈕等非輸入型元素。 |

對於 `input` 和 `change` 事件，`e.value` 自動帶入當前輸入框的值（`el.value`），會優先於 `data-value`。

---

## OS.htmlView API

透過 `<script>` 標籤或任何沙箱代碼，均可呼叫以下 API 動態操作 html-view 的 DOM：

### `OS.htmlView.append(windowId, viewId, html)`

在指定 html-view 節點的末尾追加 HTML 片段。

- HTML 會先經過安全清理（移除 iframe、on* 屬性等）。
- 清理後的 HTML 中若包含新的 `<script>` 標籤，其內容也會在沙箱中執行。
- 追加的元素中若有 `data-event` 屬性，事件綁定會自動重新建立。

| 參數 | 說明 |
|------|------|
| `windowId` | 視窗 ID |
| `viewId` | html-view 節點的 `id` |
| `html` | 要追加的 HTML 字串 |

**回傳值：** `{ success: true }` 或 `{ success: false, error: 'NodeNotFound' }`

---

### `OS.htmlView.remove(windowId, viewId, elementId)`

移除 html-view 節點內帶有指定 `data-id` 屬性的第一個子元素。

| 參數 | 說明 |
|------|------|
| `windowId` | 視窗 ID |
| `viewId` | html-view 節點的 `id` |
| `elementId` | 要移除的子元素的 `data-id` 屬性值 |

**回傳值：** `{ success: true }` 或 `{ success: false, error: 'NodeNotFound' }`

---

## 安全性

渲染前，HTML 字串會經過以下靜態清理：

1. **提取 `<script>` 元素** — 腳本內容被提取後，在沙箱 Runtime 中執行，不在主頁面執行。
2. **移除 `<iframe>` 元素** — 防止嵌入外部內容。
3. **移除 `<object>`、`<embed>` 元素** — 防止嵌入插件內容。
4. **移除所有 `on*` 屬性** — 移除行內事件處理器（如 `onclick`、`onerror`）。

`<script>` 內容在沙箱（QuickJS / Lua 等）中執行，受 OS 的權限系統和執行逾時保護，與主頁面環境完全隔離。

---

## 動態更新 HTML

可透過 `OS.ui.update()` 的 `html` 欄位更新內容：

```javascript
OS.ui.update(windowId, 'myView', {
    html: `<p>Updated content</p>
           <button data-event="click" data-id="okBtn" data-value="ok">OK</button>`,
});
```

更新時，舊的 HTML 會被完全替換，新的 `data-event` 綁定會重新建立，新的 `<script>` 也會在沙箱中執行。

---

## CSS 樣式

元件的外層容器帶有 `window-ui-html-view` class，可在主題 CSS 中進行全域樣式調整。

```css
.window-ui-html-view {
    /* 全域預設樣式 */
}
```

也可在節點的 `style` 欄位提供行內樣式覆蓋。
