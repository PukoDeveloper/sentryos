// ── SentryOS UI Library (stdlib-ui) ─────────────────────────
// 提供 patch-based 狀態管理與高階元件建構器，簡化 Window 應用程式開發。
// 載入方式: envApi.loadLibrary('stdlib/UI Utils')
//
// 需要權限: env.library.load, window.create
// 若權限不足將在 globalThis.UI 上提供錯誤訊息而非正常 API。
(function () {
  // ── 前置權限檢查 ──────────────────────────────────────────
  if (typeof ui === 'undefined' || typeof ui.createWindow !== 'function') {
    globalThis.UI = {
      _error: 'stdlib/UI Utils: ui API not available. Ensure the app has "window.create" permission and is of type "Window".',
      createApp: function () {
        throw new Error(globalThis.UI._error);
      },
    };
    return;
  }
  var handlers = {};
  var handlerCounter = 0;

  function allocId() {
    return '__ui_' + (handlerCounter++);
  }

  // ── 事件派發 ────────────────────────────────────────────────
  var originalHandler = globalThis.onWindowEvent;
  globalThis.onWindowEvent = function (event) {
    var handler = handlers[event.controlId];
    if (handler) {
      handler(event);
      return;
    }
    if (originalHandler) {
      originalHandler(event);
    }
  };

  // ── 應用程式框架 ────────────────────────────────────────────
  // render() 只在初始化呼叫一次，後續所有變更透過 app.patch() 精確更新。
  function createApp(options) {
    var state = options.state || {};
    var winOptions = {
      title: options.title || 'App',
      width: options.width || 520,
      height: options.height || 400,
    };
    if (options.x !== undefined) winOptions.x = options.x;
    if (options.y !== undefined) winOptions.y = options.y;
    if (options.style) winOptions.style = options.style;
    if (options.useDefaultFrame !== undefined) winOptions.useDefaultFrame = options.useDefaultFrame;
    if (options.alwaysOnTop !== undefined) winOptions.alwaysOnTop = options.alwaysOnTop;
    if (options.resizable !== undefined) winOptions.resizable = options.resizable;

    var win = ui.createWindow(winOptions);
    if (!win.success) return null;
    var windowId = win.data;

    var app = {
      windowId: windowId,
      state: state,
      // 精確更新單一節點 (不重建整棵樹)
      patch: function (nodeId, patch) {
        return ui.update(windowId, nodeId, patch);
      },
      remove: function (nodeId) {
        return ui.remove(windowId, nodeId);
      },
      append: function (parentId, nodes) {
        return ui.append(windowId, parentId, Array.isArray(nodes) ? nodes : [nodes]);
      },
      // 完整重繪 (適用於需要大幅度改變 UI 結構的場景，如切換分頁)
      rerender: function () {
        handlers = {};
        handlerCounter = 0;
        var tree = options.render(state, app);
        ui.initialize(windowId, Array.isArray(tree) ? tree : [tree]);
      },
    };

    // 初始繪製 (僅此一次)
    var tree = options.render(state, app);
    ui.initialize(windowId, Array.isArray(tree) ? tree : [tree]);
    return app;
  }

  // ── 高階元件建構器 ──────────────────────────────────────────
  globalThis.UI = {
    createApp: createApp,

    // 佈局
    column: function (children, style, id) {
      var s = { flexDirection: 'column', gap: '8px' };
      if (style) for (var k in style) s[k] = style[k];
      return ui.stack(children, s, id);
    },
    row: function (children, style, id) {
      var s = { flexDirection: 'row', gap: '8px' };
      if (style) for (var k in style) s[k] = style[k];
      return ui.stack(children, s, id);
    },
    box: function (children, style, id) {
      return ui.panel(children, style, id);
    },

    // 基本顯示
    text: function (text, style, id) {
      return ui.label(text, style, id);
    },
    heading: function (text, style, id) {
      var s = { fontSize: '18px', fontWeight: 'bold' };
      if (style) for (var k in style) s[k] = style[k];
      return ui.label(text, s, id);
    },
    subheading: function (text, style, id) {
      var s = { fontSize: '14px', fontWeight: 'bold', color: 'rgba(216,232,255,0.7)' };
      if (style) for (var k in style) s[k] = style[k];
      return ui.label(text, s, id);
    },

    // 互動元件 (自動綁定回呼)
    button: function (text, options) {
      options = options || {};
      var id = options.id || allocId();
      if (options.onClick) {
        handlers[id] = function () { options.onClick(); };
      }
      return ui.button(text, options.style, id);
    },
    input: function (options) {
      options = options || {};
      var id = options.id || allocId();
      if (options.onChange || options.onSubmit) {
        handlers[id] = function (event) {
          if (event.type === 'change' && options.onChange) options.onChange(event.value, event);
          if (event.type === 'submit' && options.onSubmit) options.onSubmit(event.value, event);
        };
      }
      return ui.input(options.value, options.placeholder, options.style, id);
    },
    textarea: function (options) {
      options = options || {};
      var id = options.id || allocId();
      if (options.onChange) {
        handlers[id] = function (event) {
          if (event.type === 'change') options.onChange(event.value, event);
        };
      }
      return ui.textarea(options.value, options.placeholder, options.rows, options.style, id);
    },
    checkbox: function (options) {
      options = options || {};
      var id = options.id || allocId();
      if (options.onChange) {
        handlers[id] = function (event) { options.onChange(event.value, event); };
      }
      return ui.checkbox(options.checked, options.label, options.style, id);
    },
    select: function (options) {
      options = options || {};
      var id = options.id || allocId();
      if (options.onChange) {
        handlers[id] = function (event) { options.onChange(event.value, event); };
      }
      return ui.select(options.options || [], options.value, options.style, id);
    },

    // 顯示元件
    image: function (src, options) {
      options = options || {};
      return ui.image(src, options.alt, options.style, options.id);
    },
    separator: function (style, id) {
      return ui.separator(style, id);
    },
    progress: function (value, options) {
      options = options || {};
      return ui.progress(value, options.color, options.style, options.id);
    },
    list: function (children, style, id) {
      return ui.list(children, style, id);
    },

    // 複合元件
    card: function (children, style, id) {
      var s = {
        padding: '14px',
        borderRadius: '10px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
      };
      if (style) for (var k in style) s[k] = style[k];
      return ui.panel(children, s, id);
    },
    badge: function (text, style) {
      var s = {
        fontSize: '11px',
        padding: '2px 8px',
        borderRadius: '4px',
        background: 'rgba(255,255,255,0.05)',
      };
      if (style) for (var k in style) s[k] = style[k];
      return ui.label(text, s);
    },
  };
})();
