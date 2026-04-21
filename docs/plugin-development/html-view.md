# html-view 元件

`html-view` 是由 `sentryos-html-view` 插件提供的 UI 元件。它允許應用程式以 HTML 字串描述視覺介面，同時讓所有邏輯繼續在應用程式的 Runtime（QuickJS / Lua 等）中執行。

**不使用 iframe 沙盒。** HTML 僅作為顯示層，透過 `data-event` 屬性宣告互動行為，由 Runtime 的事件管道（`onWindowEvent`）統一處理。

---

## 架構

```
應用程式 Runtime（QuickJS / Lua）
  ↓  OS.ui.initializeUi() — 傳入 html-view 節點
  ↓
Plugin renderer（主頁面 DOM）
  ↓  innerHTML 渲染（script / iframe / on* 屬性被剝除）
  ↓
DOM 事件監聽器（data-event 屬性驅動）
  ↓  ctx.bindEvent() + dispatch()
  ↓
onWindowEvent(event) — 回到 Runtime 執行
```

---

## 使用方式

### 基本範例

```javascript
// QuickJS 沙盒代碼
OS.ui.initializeUi(windowId, {
    type: 'html-view',
    id: 'myView',
    html: `
        <h2>Hello, SentryOS!</h2>
        <button data-event="click" data-id="greetBtn" data-value="hello">
            Say Hello
        </button>
        <input data-event="input" data-id="nameInput" placeholder="Enter name" />
    `,
});

function onWindowEvent(e) {
    if (e.controlId === 'greetBtn') {
        OS.console.log('Button clicked, value: ' + e.value);
    }
    if (e.controlId === 'nameInput') {
        OS.console.log('Input changed: ' + e.value);
    }
}
```

---

## html-view 節點介面

```typescript
interface WindowHtmlViewNode {
    type: 'html-view';
    id?: string;            // 此元件的識別碼
    html: string;           // 要渲染的 HTML 字串
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

## 安全性

渲染前，HTML 字串會經過以下靜態清理：

1. **移除 `<script>` 元素** — 防止任意 JavaScript 執行。
2. **移除 `<iframe>` 元素** — 防止嵌入外部內容。
3. **移除所有 `on*` 屬性** — 移除行內事件處理器（如 `onclick`、`onerror`）。

清理後的 HTML 透過 `innerHTML` 渲染至主頁面 DOM，所有互動邏輯均由 `data-event` 宣告，並透過現有 Runtime 事件管道執行，**沒有任何代碼在 HTML 字串裡執行**。

---

## 動態更新 HTML

可透過 `OS.ui.patchNode()` 的 `html` 欄位更新內容：

```javascript
OS.ui.patchNode(windowId, 'myView', {
    html: `<p>Updated content</p>
           <button data-event="click" data-id="okBtn" data-value="ok">OK</button>`,
});
```

更新時，舊的 HTML 會被完全替換，新的 `data-event` 綁定會重新建立。

---

## CSS 樣式

元件的外層容器帶有 `window-ui-html-view` class，可在主題 CSS 中進行全域樣式調整。

```css
.window-ui-html-view {
    /* 全域預設樣式 */
}
```

也可在節點的 `style` 欄位提供行內樣式覆蓋。
