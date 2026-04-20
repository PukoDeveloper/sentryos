// ── SentryOS UI Library (stdlib-ui) ─────────────────────────
// 提供 patch-based 狀態管理與高階元件建構器，簡化 Window 應用程式開發。
// 載入方式: OS.loadLibrary('stdlib/UI Utils')
//
// 需要權限: env.library.load, window.create
// 若權限不足將在 globalThis.UI 上提供錯誤訊息而非正常 API。
(function () {
  // ── 前置權限檢查 ──────────────────────────────────────────
  if (typeof OS === 'undefined' || !OS.ui || typeof OS.ui.createWindow !== 'function') {
    globalThis.UI = {
      _error: 'stdlib/UI Utils: ui API not available. Ensure the app has "window.create" permission and is of type "Window".',
      createApp: function () {
        throw new Error(globalThis.UI._error);
      },
    };
    return;
  }

  // ── 事件派發 ────────────────────────────────────────────────
  var originalHandler = globalThis.onWindowEvent;
  globalThis.onWindowEvent = function (event) {
    // Route to the correct app's handler registry
    for (var i = 0; i < _apps.length; i++) {
      var handler = _apps[i].handlers[event.controlId];
      if (handler) {
        handler(event);
        return;
      }
    }
    if (originalHandler) {
      originalHandler(event);
    }
  };

  // Track all created apps so event routing works across multiple apps
  var _apps = [];

  // ── 事件選項偵測 ────────────────────────────────────────────
  function hasEventHandlers(obj) {
    return obj && (obj.onClick || obj.onDblClick || obj.onContextMenu);
  }

  function bindEvents(id, opts, handlers) {
    var events = [];
    if (opts.onClick) events.push('click');
    if (opts.onDblClick) events.push('dblclick');
    if (opts.onContextMenu) events.push('contextmenu');
    handlers[id] = function (event) {
      if (event.type === 'click' && opts.onClick) opts.onClick(event);
      if (event.type === 'dblclick' && opts.onDblClick) opts.onDblClick(event);
      if (event.type === 'contextmenu' && opts.onContextMenu) opts.onContextMenu(event);
    };
    return events;
  }

  function makeAllocId() {
    var counter = 0;
    return function() { return '__ui_' + (counter++); };
  }

  // ── 應用程式框架 ────────────────────────────────────────────
  function createApp(options) {
    var state = options.state || {};

    // Support both flat options and nested options.window sub-object
    var winCfg = options.window || options;
    var winOptions = {
      title: String(winCfg.title || options.title || 'App'),
      width: Number(winCfg.width || options.width || 520),
      height: Number(winCfg.height || options.height || 400),
    };
    if (winCfg.x !== undefined) winOptions.x = winCfg.x;
    if (winCfg.y !== undefined) winOptions.y = winCfg.y;
    if (winCfg.style) winOptions.style = winCfg.style;
    if (winCfg.useDefaultFrame !== undefined) winOptions.useDefaultFrame = winCfg.useDefaultFrame;
    if (winCfg.alwaysOnTop !== undefined) winOptions.alwaysOnTop = winCfg.alwaysOnTop;
    if (winCfg.resizable !== undefined) winOptions.resizable = winCfg.resizable;

    var win = OS.ui.createWindow(winOptions);
    if (!win.success) return null;
    var windowId = win.data;

    // Per-app handler registry and ID allocator (avoids cross-app interference)
    var handlers = {};
    var allocId = makeAllocId();

    var appEntry = { handlers: handlers };
    _apps.push(appEntry);

    var app = {
      windowId: windowId,
      state: state,

      // ── 精確更新 ─────────────────────────────────────────
      patch: function (nodeId, patch) {
        return OS.ui.update(windowId, nodeId, patch);
      },
      remove: function (nodeId) {
        return OS.ui.remove(windowId, nodeId);
      },
      append: function (parentId, nodes) {
        return OS.ui.append(windowId, parentId, Array.isArray(nodes) ? nodes : [nodes]);
      },

      // ── 完整重繪 ─────────────────────────────────────────
      rerender: function () {
        // Clear only this app's handlers, not all apps
        var keys = Object.keys(handlers);
        for (var i = 0; i < keys.length; i++) delete handlers[keys[i]];
        allocId = makeAllocId();
        var tree = options.render(state, app);
        OS.ui.initialize(windowId, Array.isArray(tree) ? tree : [tree], { preserveScroll: true });
      },

      // ── Window management ─────────────────────────────────
      /** Close / terminate this app window. */
      close: function () {
        OS.terminateSelf();
      },
      /** Get current window bounds { x, y, width, height }. */
      getSize: function () {
        return OS.ui.getWindowBounds(windowId);
      },
      /** Apply CSS style overrides to the window chrome. */
      setStyle: function (style) {
        return OS.ui.setWindowStyle(windowId, style);
      },

      // ── Context menu ──────────────────────────────────────
      showContextMenu: function (controlId, x, y, items) {
        return OS.ui.showContextMenu(windowId, controlId, x, y, items);
      },
      closeContextMenu: function () {
        return OS.ui.closeContextMenu();
      },

      // ── Internals (for composite components) ──────────────
      _handlers: handlers,
      _allocId: function() { return allocId(); },
    };

    // 初始繪製
    var tree = options.render(state, app);
    OS.ui.initialize(windowId, Array.isArray(tree) ? tree : [tree], { preserveScroll: true });
    return app;
  }

  // ── 高階元件建構器 ──────────────────────────────────────────
  // These builder functions need access to the *current* app's handler
  // registry and ID allocator.  We expose a UI.withApp(app, fn) helper
  // and also keep a per-build context trick: all builders that take
  // event options accept an `app` reference as the last optional argument
  // so they can register events in the correct registry.
  //
  // For backward-compat, when no app is provided we fall back to a
  // module-level registry so code written before multi-app support still works.

  var _fallbackHandlers = {};
  var _fallbackAllocId = makeAllocId();

  function resolveCtx(app) {
    if (app && app._handlers) {
      return { handlers: app._handlers, allocId: function() { return app._allocId(); } };
    }
    return { handlers: _fallbackHandlers, allocId: function() { return _fallbackAllocId(); } };
  }

  // Re-wire onWindowEvent fallback to also check _fallbackHandlers
  _apps.push({ handlers: _fallbackHandlers });

  globalThis.UI = {
    createApp: createApp,

    // ── Layout ───────────────────────────────────────────────

    column: function (children, styleOrOptions, id, app) {
      var s = { flexDirection: 'column', gap: '8px' };
      var events;
      var ctx = resolveCtx(app);
      if (hasEventHandlers(styleOrOptions)) {
        var opts = styleOrOptions;
        if (opts.style) for (var k in opts.style) s[k] = opts.style[k];
        id = opts.id || id || ctx.allocId();
        events = bindEvents(id, opts, ctx.handlers);
      } else {
        if (styleOrOptions) for (var k in styleOrOptions) s[k] = styleOrOptions[k];
      }
      return OS.ui.stack(children, s, id, events);
    },

    row: function (children, styleOrOptions, id, app) {
      var s = { flexDirection: 'row', gap: '8px' };
      var events;
      var ctx = resolveCtx(app);
      if (hasEventHandlers(styleOrOptions)) {
        var opts = styleOrOptions;
        if (opts.style) for (var k in opts.style) s[k] = opts.style[k];
        id = opts.id || id || ctx.allocId();
        events = bindEvents(id, opts, ctx.handlers);
      } else {
        if (styleOrOptions) for (var k in styleOrOptions) s[k] = styleOrOptions[k];
      }
      return OS.ui.stack(children, s, id, events);
    },

    box: function (children, styleOrOptions, id, app) {
      var ctx = resolveCtx(app);
      var events;
      if (hasEventHandlers(styleOrOptions)) {
        var opts = styleOrOptions;
        id = opts.id || id || ctx.allocId();
        events = bindEvents(id, opts, ctx.handlers);
        return OS.ui.panel(children, opts.style, id, events);
      }
      return OS.ui.panel(children, styleOrOptions, id);
    },

    /** Flex spacer that fills remaining space. */
    spacer: function (style) {
      var s = { flex: '1' };
      if (style) for (var k in style) s[k] = style[k];
      return OS.ui.panel([], s);
    },

    /** Scrollable container wrapping children. */
    scrollable: function (children, style) {
      var s = { overflow: 'auto', flex: '1' };
      if (style) for (var k in style) s[k] = style[k];
      return OS.ui.panel(children, s);
    },

    // ── Display ──────────────────────────────────────────────

    text: function (text, styleOrOptions, id, app) {
      var ctx = resolveCtx(app);
      if (hasEventHandlers(styleOrOptions)) {
        var opts = styleOrOptions;
        id = opts.id || id || ctx.allocId();
        var events = bindEvents(id, opts, ctx.handlers);
        return OS.ui.label(text, opts.style, id, events);
      }
      return OS.ui.label(text, styleOrOptions, id);
    },

    heading: function (text, styleOrOptions, id, app) {
      var s = { fontSize: '18px', fontWeight: 'bold' };
      var ctx = resolveCtx(app);
      if (hasEventHandlers(styleOrOptions)) {
        var opts = styleOrOptions;
        if (opts.style) for (var k in opts.style) s[k] = opts.style[k];
        id = opts.id || id || ctx.allocId();
        var events = bindEvents(id, opts, ctx.handlers);
        return OS.ui.label(text, s, id, events);
      }
      if (styleOrOptions) for (var k in styleOrOptions) s[k] = styleOrOptions[k];
      return OS.ui.label(text, s, id);
    },

    subheading: function (text, styleOrOptions, id, app) {
      var s = { fontSize: '14px', fontWeight: 'bold', color: 'rgba(216,232,255,0.7)' };
      var ctx = resolveCtx(app);
      if (hasEventHandlers(styleOrOptions)) {
        var opts = styleOrOptions;
        if (opts.style) for (var k in opts.style) s[k] = opts.style[k];
        id = opts.id || id || ctx.allocId();
        var events = bindEvents(id, opts, ctx.handlers);
        return OS.ui.label(text, s, id, events);
      }
      if (styleOrOptions) for (var k in styleOrOptions) s[k] = styleOrOptions[k];
      return OS.ui.label(text, s, id);
    },

    /** Styled clickable text link. */
    link: function (text, options) {
      options = options || {};
      var s = {
        color: '#67b8ff',
        cursor: 'pointer',
        textDecoration: 'underline',
        fontSize: options.fontSize || '13px',
      };
      if (options.style) for (var k in options.style) s[k] = options.style[k];
      var ctx = resolveCtx(options.app);
      var id = options.id || ctx.allocId();
      if (options.onClick) {
        ctx.handlers[id] = function(event) { if (event.type === 'click') options.onClick(event); };
        return OS.ui.label(text, s, id, ['click']);
      }
      return OS.ui.label(text, s, id);
    },

    /** Emoji / icon shorthand with centred display. */
    icon: function (emoji, style) {
      var s = { fontSize: '20px', textAlign: 'center', lineHeight: '1' };
      if (style) for (var k in style) s[k] = style[k];
      return OS.ui.label(emoji, s);
    },

    // ── Interactive elements ─────────────────────────────────

    button: function (text, options) {
      options = options || {};
      var ctx = resolveCtx(options.app);
      var id = options.id || ctx.allocId();
      if (options.onClick || options.onDblClick || options.onContextMenu) {
        ctx.handlers[id] = function (event) {
          if (event.type === 'click' && options.onClick) options.onClick(event);
          if (event.type === 'dblclick' && options.onDblClick) options.onDblClick(event);
          if (event.type === 'contextmenu' && options.onContextMenu) options.onContextMenu(event);
        };
      }
      var node = OS.ui.button(text, options.style, id);
      var extraEvents = [];
      if (options.onDblClick) extraEvents.push('dblclick');
      if (options.onContextMenu) extraEvents.push('contextmenu');
      if (extraEvents.length > 0) node.events = extraEvents;
      return node;
    },

    input: function (options) {
      options = options || {};
      var ctx = resolveCtx(options.app);
      var id = options.id || ctx.allocId();
      if (options.onChange || options.onSubmit || options.onFocus || options.onBlur) {
        ctx.handlers[id] = function (event) {
          if (event.type === 'change' && options.onChange) options.onChange(event.value, event);
          if (event.type === 'submit' && options.onSubmit) options.onSubmit(event.value, event);
          if (event.type === 'focus' && options.onFocus) options.onFocus(event);
          if (event.type === 'blur' && options.onBlur) options.onBlur(event);
        };
      }
      var node = OS.ui.input(options.value, options.placeholder, options.style, id);
      var extraEvents = [];
      if (options.onFocus) extraEvents.push('focus');
      if (options.onBlur) extraEvents.push('blur');
      if (extraEvents.length > 0) node.events = extraEvents;
      return node;
    },

    textarea: function (options) {
      options = options || {};
      var ctx = resolveCtx(options.app);
      var id = options.id || ctx.allocId();
      if (options.onChange || options.onFocus || options.onBlur) {
        ctx.handlers[id] = function (event) {
          if (event.type === 'change') options.onChange && options.onChange(event.value, event);
          if (event.type === 'focus') options.onFocus && options.onFocus(event);
          if (event.type === 'blur') options.onBlur && options.onBlur(event);
        };
      }
      return OS.ui.textarea(options.value, options.placeholder, options.rows, options.style, id);
    },

    checkbox: function (options) {
      options = options || {};
      var ctx = resolveCtx(options.app);
      var id = options.id || ctx.allocId();
      if (options.onChange) {
        ctx.handlers[id] = function (event) { options.onChange(event.value, event); };
      }
      return OS.ui.checkbox(options.checked, options.label, options.style, id);
    },

    select: function (options) {
      options = options || {};
      var ctx = resolveCtx(options.app);
      var id = options.id || ctx.allocId();
      if (options.onChange) {
        ctx.handlers[id] = function (event) { options.onChange(event.value, event); };
      }
      return OS.ui.select(options.options || [], options.value, options.style, id);
    },

    // ── Display elements ─────────────────────────────────────

    image: function (src, options) {
      options = options || {};
      return OS.ui.image(src, options.alt, options.style, options.id);
    },

    separator: function (style, id) {
      return OS.ui.separator(style, id);
    },

    progress: function (value, options) {
      options = options || {};
      return OS.ui.progress(value, options.color, options.style, options.id);
    },

    list: function (children, styleOrOptions, id, app) {
      var ctx = resolveCtx(app);
      var events;
      if (hasEventHandlers(styleOrOptions)) {
        var opts = styleOrOptions;
        id = opts.id || id || ctx.allocId();
        events = bindEvents(id, opts, ctx.handlers);
        return OS.ui.list(children, opts.style, id, events);
      }
      return OS.ui.list(children, styleOrOptions, id);
    },

    // ── Composite components ─────────────────────────────────

    card: function (children, styleOrOptions, id, app) {
      var s = {
        padding: '14px',
        borderRadius: '10px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
      };
      var ctx = resolveCtx(app);
      var events;
      if (hasEventHandlers(styleOrOptions)) {
        var opts = styleOrOptions;
        if (opts.style) for (var k in opts.style) s[k] = opts.style[k];
        id = opts.id || id || ctx.allocId();
        events = bindEvents(id, opts, ctx.handlers);
      } else {
        if (styleOrOptions) for (var k in styleOrOptions) s[k] = styleOrOptions[k];
      }
      return OS.ui.panel(children, s, id, events);
    },

    badge: function (text, style) {
      var s = {
        fontSize: '11px',
        padding: '2px 8px',
        borderRadius: '4px',
        background: 'rgba(255,255,255,0.05)',
      };
      if (style) for (var k in style) s[k] = style[k];
      return OS.ui.label(text, s);
    },

    /**
     * Tab bar + content panel composite.
     *
     * Usage:
     *   var activeTab = 'a';
     *   UI.tabs({
     *     active: activeTab,
     *     tabs: [
     *       { key: 'a', label: 'Tab A', content: UI.text('Page A') },
     *       { key: 'b', label: 'Tab B', content: UI.text('Page B') },
     *     ],
     *     onSwitch: function(key) { activeTab = key; self.rerender(); },
     *     app: self,          // required for event registration
     *     style: {},          // optional outer column style
     *     tabBarStyle: {},    // optional tab bar style
     *     activeTabStyle: {}, // optional style for the active tab button
     *   })
     */
    tabs: function (options) {
      options = options || {};
      var tabs = options.tabs || [];
      var active = options.active;
      var ctx = resolveCtx(options.app);

      var accentColor = (options.activeTabStyle && options.activeTabStyle.color) || '#67b8ff';
      var defaultTabStyle = {
        padding: '6px 16px',
        borderRadius: '6px 6px 0 0',
        fontSize: '13px',
        background: 'transparent',
        color: 'rgba(216,232,255,0.5)',
        cursor: 'pointer',
      };
      var activeTabStyle = {
        padding: '6px 16px',
        borderRadius: '6px 6px 0 0',
        fontSize: '13px',
        fontWeight: 'bold',
        background: 'rgba(103,184,255,0.08)',
        color: accentColor,
        borderBottom: '2px solid ' + accentColor,
        cursor: 'pointer',
      };
      if (options.activeTabStyle) for (var k in options.activeTabStyle) activeTabStyle[k] = options.activeTabStyle[k];

      // Build tab header buttons
      var tabButtons = [];
      for (var i = 0; i < tabs.length; i++) {
        (function(tab) {
          var isActive = tab.key === active;
          var id = ctx.allocId();
          if (options.onSwitch) {
            ctx.handlers[id] = function(event) {
              if (event.type === 'click') options.onSwitch(tab.key);
            };
          }
          tabButtons.push(OS.ui.button(tab.label, isActive ? activeTabStyle : defaultTabStyle, id));
        })(tabs[i]);
      }

      var tabBarStyle = {
        flexDirection: 'row',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        gap: '2px',
      };
      if (options.tabBarStyle) for (var k in options.tabBarStyle) tabBarStyle[k] = options.tabBarStyle[k];

      // Find active content
      var content = OS.ui.panel([], { flex: '1', padding: '12px' });
      for (var j = 0; j < tabs.length; j++) {
        if (tabs[j].key === active && tabs[j].content !== undefined) {
          var c = tabs[j].content;
          content = Array.isArray(c)
            ? OS.ui.panel(c, { flex: '1', padding: '12px' })
            : OS.ui.panel([c], { flex: '1', padding: '12px' });
          break;
        }
      }

      var outerStyle = { flexDirection: 'column', height: '100%' };
      if (options.style) for (var k in options.style) outerStyle[k] = options.style[k];

      return OS.ui.stack([
        OS.ui.stack(tabButtons, tabBarStyle),
        content,
      ], outerStyle);
    },
  };
})();
