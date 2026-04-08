var _loadResult = OS.loadLibrary('stdlib/UI Utils');
if (!_loadResult.success) {
  throw new Error('Failed to load UI library: ' + (_loadResult.error || 'Unknown'));
}

// ── State ────────────────────────────────────────────────────
var TIERS = ['sys', 'app', 'user', 'cache'];

var state = {
  currentTier: 'app',       // 目前選中的層級
  currentNamespace: null,    // 目前瀏覽的命名空間（null = 總覽）
  entries: [],               // 檔案清單
  namespaces: [],            // 命名空間清單
  selectedEntry: null,       // 選中的檔案（查看詳情）
  usage: null,               // 儲存空間使用量
  createMode: null,          // 'folder' | 'file' | null
  createName: '',            // 新增項目的名稱
  createContent: '',         // 新增檔案的內容
};

// 右鍵選單暫存（不在 render state 中，由系統層管理）
var pendingContextTarget = null;  // { type: 'file'|'folder', entry?, namespace? }

// ── Helpers ──────────────────────────────────────────────────
function loadUsage() {
  var result = OS.storageUsage();
  state.usage = result.success ? result.data : null;
}

function loadEntries() {
  var result = OS.listAllFiles(state.currentTier);
  if (!result.success) { state.entries = []; state.namespaces = []; return; }

  var all = result.data || [];
  state.entries = all;

  // 提取命名空間（sys 層無命名空間）
  var nsMap = {};
  if (state.currentTier !== 'sys') {
    for (var i = 0; i < all.length; i++) {
      var slashIdx = all[i].key.indexOf('/');
      if (slashIdx > 0) {
        var ns = all[i].key.slice(0, slashIdx);
        if (!nsMap[ns]) nsMap[ns] = 0;
        nsMap[ns]++;
      }
    }
  }
  state.namespaces = Object.keys(nsMap).map(function (ns) {
    return { name: ns, count: nsMap[ns] };
  }).sort(function (a, b) { return a.name.localeCompare(b.name); });
}

function getFilteredEntries() {
  if (state.currentTier === 'sys' || !state.currentNamespace) {
    return state.entries;
  }
  var prefix = state.currentNamespace + '/';
  return state.entries.filter(function (e) {
    return e.key.indexOf(prefix) === 0;
  });
}

function getDisplayKey(entry) {
  if (state.currentTier === 'sys') return entry.key;
  var slashIdx = entry.key.indexOf('/');
  return slashIdx > 0 ? entry.key.slice(slashIdx + 1) : entry.key;
}

function formatTime(ts) {
  if (!ts) return '-';
  var d = new Date(ts);
  var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function formatData(data) {
  if (data === null || data === undefined) return 'null';
  if (typeof data === 'string') return data.length > 200 ? data.slice(0, 200) + '…' : data;
  try { var s = JSON.stringify(data, null, 2); return s.length > 400 ? s.slice(0, 400) + '\n…' : s; }
  catch (e) { return String(data); }
}

function deleteEntry(entry) {
  if (state.currentTier === 'sys') {
    OS.notify('無法刪除', '系統層檔案不可從此處刪除', 'warning');
    return;
  }
  // 使用跨應用路徑刪除
  var ns = '';
  var slashIdx = entry.key.indexOf('/');
  if (slashIdx > 0) {
    ns = entry.key.slice(0, slashIdx);
  }
  var filename = slashIdx > 0 ? entry.key.slice(slashIdx + 1) : entry.key;
  var tier = state.currentTier;
  var path = tier + ':@' + ns + '/' + filename;
  var result = OS.deleteFile(path);
  if (result.success) {
    OS.notify('已刪除', entry.key, 'info');
  } else {
    OS.notify('刪除失敗', result.error || '未知錯誤', 'error');
  }
}

function getFileExtension(key) {
  var dotIdx = key.lastIndexOf('.');
  if (dotIdx < 0) return '';
  return key.slice(dotIdx).toLowerCase();
}

function openWithDefaultApp(entry) {
  var ext = getFileExtension(entry.key);
  if (!ext) {
    OS.notify('無法開啟', '無法判斷檔案類型', 'warning');
    return;
  }
  var handler = OS.getFileTypeHandler(ext);
  if (!handler.success || !handler.data) {
    OS.notify('無法開啟', '沒有設定 ' + ext + ' 的預設應用程式', 'warning');
    return;
  }
  var result = OS.launch(handler.data.appDefId);
  if (!result.success) {
    OS.notify('啟動失敗', result.error || '未知錯誤', 'error');
  }
}

function deleteFolder(nsName) {
  if (state.currentTier === 'sys') {
    OS.notify('無法刪除', '系統層檔案不可從此處刪除', 'warning');
    return;
  }
  var prefix = nsName + '/';
  var toDelete = state.entries.filter(function (e) { return e.key.indexOf(prefix) === 0; });
  var count = 0;
  for (var i = 0; i < toDelete.length; i++) {
    deleteEntry(toDelete[i]);
    count++;
  }
  if (count > 0) {
    OS.notify('已刪除資料夾', nsName + ' (' + count + ' 個檔案)', 'info');
  } else {
    OS.notify('刪除失敗', '資料夾為空或不存在', 'warning');
  }
}



function createFolder(name) {
  name = (name || '').trim();
  if (!name) {
    OS.notify('建立失敗', '請輸入資料夾名稱', 'warning');
    return false;
  }
  // 使用跨應用路徑建立獨立命名空間
  var path = 'user:@' + name + '/.folder';
  var result = OS.writeFile(path, null, { overwrite: false });
  if (!result.success) {
    if (result.error === 'AlreadyExists') {
      OS.notify('建立失敗', '資料夾「' + name + '」已存在', 'warning');
    } else {
      OS.notify('建立失敗', result.error || '未知錯誤', 'error');
    }
    return false;
  }
  OS.notify('已建立', '資料夾「' + name + '」', 'info');
  return true;
}

function createFile(name, content) {
  name = (name || '').trim();
  if (!name) {
    OS.notify('建立失敗', '請輸入檔案名稱', 'warning');
    return false;
  }
  var ns = state.currentNamespace;
  var path;
  if (ns) {
    // 在目前命名空間下建立
    path = 'user:@' + ns + '/' + name;
  } else {
    // 沒有選擇命名空間，建立在自己的命名空間
    path = 'user:' + name;
  }
  var data = content || '';
  var result = OS.writeFile(path, data, { overwrite: false });
  if (!result.success) {
    if (result.error === 'AlreadyExists') {
      OS.notify('建立失敗', '檔案「' + name + '」已存在', 'warning');
    } else {
      OS.notify('建立失敗', result.error || '未知錯誤', 'error');
    }
    return false;
  }
  OS.notify('已建立', '檔案「' + name + '」', 'info');
  return true;
}

// ── Styles ───────────────────────────────────────────────────
var accent = '#67b8ff';
var bg = 'linear-gradient(180deg, rgba(10,14,20,0.96), rgba(6,10,14,0.92))';
var cardBg = 'rgba(255,255,255,0.03)';
var cardBorder = '1px solid rgba(255,255,255,0.06)';

var tierColors = {
  sys: '#ff9f43',
  app: '#67b8ff',
  user: '#50fa7b',
  cache: '#bd93f9',
};

var tabStyle = function (active) {
  return {
    padding: '6px 14px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: active ? 'bold' : 'normal',
    background: active ? 'rgba(103,184,255,0.18)' : 'rgba(255,255,255,0.04)',
    color: active ? accent : 'rgba(216,232,255,0.6)',
    cursor: 'pointer',
  };
};

var btnSmall = {
  padding: '4px 10px',
  borderRadius: '5px',
  fontSize: '11px',
};

var dangerBtn = {
  padding: '4px 10px',
  borderRadius: '5px',
  fontSize: '11px',
  background: 'rgba(255,85,85,0.15)',
  color: '#ff5555',
};

var breadcrumbBtn = {
  padding: '4px 12px',
  borderRadius: '5px',
  fontSize: '12px',
  background: 'rgba(255,255,255,0.06)',
  color: '#d8e8ff',
};

var createBtn = {
  padding: '4px 10px',
  borderRadius: '5px',
  fontSize: '11px',
  background: 'rgba(80,250,123,0.15)',
  color: '#50fa7b',
};

var inputStyle = {
  padding: '6px 10px',
  borderRadius: '5px',
  fontSize: '12px',
  background: 'rgba(255,255,255,0.06)',
  color: '#d8e8ff',
  border: '1px solid rgba(255,255,255,0.1)',
  flex: '1',
};

// ── Render ───────────────────────────────────────────────────
var app = UI.createApp({
  title: '檔案管理器',
  width: 720,
  height: 560,
  resizable: true,
  style: {
    background: bg,
    color: '#ecf4ff',
    border: '1px solid rgba(118,185,255,0.26)',
    boxShadow: '0 24px 60px rgba(0,0,0,0.34)',
  },
  state: state,
  render: function (s, self) {
    loadUsage();
    loadEntries();
    return renderMain(s, self);
  },
});

function renderMain(s, self) {
  var children = [
    renderHeader(s, self),
    UI.separator(),
    renderUsageBar(s),
    UI.separator(),
    renderBreadcrumb(s, self),
  ];

  if (s.createMode) {
    children.push(renderCreateForm(s, self));
  }

  children.push(s.selectedEntry ? renderDetail(s, self) : renderContent(s, self));

  return UI.column(children, { padding: '16px', flex: '1' });
}

// ── Header (Tier Tabs) ──────────────────────────────────────
function renderHeader(s, self) {
  var tabs = [];
  for (var i = 0; i < TIERS.length; i++) {
    (function (tier) {
      tabs.push(UI.button(tier.toUpperCase(), {
        onClick: function () {
          state.currentTier = tier;
          state.currentNamespace = null;
          state.selectedEntry = null;
          state.createMode = null;
          state.createName = '';
          state.createContent = '';
          self.rerender();
        },
        style: tabStyle(s.currentTier === tier),
      }));
    })(TIERS[i]);
  }
  return UI.row([
    UI.heading('檔案管理器', { color: '#d8e8ff', flex: '1', fontSize: '16px' }),
    UI.row(tabs, { gap: '4px' }),
  ], { alignItems: 'center' });
}

// ── Usage Bar ───────────────────────────────────────────────
function renderUsageBar(s) {
  if (!s.usage) return UI.text('無法取得使用量', { fontSize: '11px', color: 'rgba(216,232,255,0.4)' });
  var tier = s.usage.tiers[s.currentTier];
  var pct = tier.capacity > 0 ? Math.round((tier.used / tier.capacity) * 100) : 0;
  var color = tierColors[s.currentTier] || accent;

  return UI.column([
    UI.row([
      UI.text(s.currentTier.toUpperCase() + ' 層', { fontSize: '12px', fontWeight: 'bold', color: color }),
      UI.text(tier.used + ' / ' + tier.capacity + ' 項目 (' + pct + '%)', {
        fontSize: '11px', color: 'rgba(216,232,255,0.5)', marginLeft: 'auto',
      }),
    ], { alignItems: 'center' }),
    UI.progress(pct, { color: color }),
  ], { gap: '4px' });
}

// ── Breadcrumb ──────────────────────────────────────────────
function renderBreadcrumb(s, self) {
  var parts = [];

  parts.push(UI.button('🗂 ' + s.currentTier.toUpperCase(), {
    onClick: function () {
      state.currentNamespace = null;
      state.selectedEntry = null;
      app.closeContextMenu();
      self.rerender();
    },
    style: breadcrumbBtn,
  }));

  if (s.currentNamespace) {
    parts.push(UI.text('›', { fontSize: '14px', color: 'rgba(216,232,255,0.3)' }));
    parts.push(UI.button(s.currentNamespace, {
      onClick: function () {
        state.selectedEntry = null;
        app.closeContextMenu();
        self.rerender();
      },
      style: breadcrumbBtn,
    }));
  }

  if (s.selectedEntry) {
    parts.push(UI.text('›', { fontSize: '14px', color: 'rgba(216,232,255,0.3)' }));
    parts.push(UI.text(getDisplayKey(s.selectedEntry), {
      fontSize: '12px', color: accent, fontWeight: 'bold',
    }));
  }

  // user 層且不在詳情頁顯示新增按鈕
  if (s.currentTier === 'user' && !s.selectedEntry) {
    parts.push(UI.row([
      UI.button('+ 資料夾', {
        onClick: function () {
          state.createMode = state.createMode === 'folder' ? null : 'folder';
          state.createName = '';
          state.createContent = '';
          app.closeContextMenu();
          self.rerender();
        },
        style: createBtn,
      }),
      UI.button('+ 檔案', {
        onClick: function () {
          state.createMode = state.createMode === 'file' ? null : 'file';
          state.createName = '';
          state.createContent = '';
          app.closeContextMenu();
          self.rerender();
        },
        style: createBtn,
      }),
    ], { gap: '4px', marginLeft: 'auto' }));
  }

  return UI.row(parts, { alignItems: 'center', gap: '6px' });
}

// ── Content: Namespace List or File List ─────────────────────
function renderContent(s, self) {
  // sys 層無命名空間，直接顯示檔案
  if (s.currentTier === 'sys') {
    return renderFileList(s.entries, s, self);
  }

  // 未選擇命名空間 → 顯示命名空間清單
  if (!s.currentNamespace) {
    return renderNamespaceList(s, self);
  }

  // 已選擇命名空間 → 顯示該命名空間的檔案
  return renderFileList(getFilteredEntries(), s, self);
}

// ── Create Form ─────────────────────────────────────────────
function renderCreateForm(s, self) {
  var isFolder = s.createMode === 'folder';
  var title = isFolder ? '新增資料夾' : '新增檔案';

  var rows = [
    UI.row([
      UI.text(title, { fontSize: '13px', fontWeight: 'bold', color: '#50fa7b' }),
      UI.button('✕', {
        onClick: function () {
          state.createMode = null;
          self.rerender();
        },
        style: { padding: '2px 8px', borderRadius: '4px', fontSize: '11px', background: 'rgba(255,255,255,0.06)', color: 'rgba(216,232,255,0.5)' },
      }),
    ], { alignItems: 'center', justifyContent: 'space-between' }),
    UI.row([
      UI.text(isFolder ? '名稱：' : '檔名：', { fontSize: '12px', color: 'rgba(216,232,255,0.6)', minWidth: '45px' }),
      UI.input({
        value: s.createName,
        placeholder: isFolder ? '例如：my-documents' : '例如：note.txt',
        style: inputStyle,
        onChange: function (val) { state.createName = val; },
      }),
    ], { alignItems: 'center', gap: '6px' }),
  ];

  if (!isFolder) {
    rows.push(UI.text('內容：', { fontSize: '12px', color: 'rgba(216,232,255,0.6)' }));
    rows.push(UI.textarea({
      value: s.createContent,
      placeholder: '輸入檔案內容（可留空）',
      rows: 4,
      style: {
        padding: '6px 10px',
        borderRadius: '5px',
        fontSize: '12px',
        background: 'rgba(255,255,255,0.06)',
        color: '#d8e8ff',
        border: '1px solid rgba(255,255,255,0.1)',
        fontFamily: 'monospace',
        resize: 'vertical',
      },
      onChange: function (val) { state.createContent = val; },
    }));
  }

  rows.push(UI.row([
    UI.button(isFolder ? '建立資料夾' : '建立檔案', {
      onClick: function () {
        var ok;
        if (isFolder) {
          ok = createFolder(state.createName);
        } else {
          ok = createFile(state.createName, state.createContent);
        }
        if (ok) {
          state.createMode = null;
          state.createName = '';
          state.createContent = '';
          loadEntries();
          loadUsage();
        }
        self.rerender();
      },
      style: createBtn,
    }),
    UI.button('取消', {
      onClick: function () {
        state.createMode = null;
        state.createName = '';
        state.createContent = '';
        self.rerender();
      },
      style: btnSmall,
    }),
  ], { gap: '8px' }));

  return UI.column(rows, {
    gap: '6px',
    padding: '12px',
    borderRadius: '8px',
    background: 'rgba(80,250,123,0.04)',
    border: '1px solid rgba(80,250,123,0.12)',
  });
}

function renderNamespaceList(s, self) {
  if (s.namespaces.length === 0) {
    return UI.text('此層級沒有任何檔案。', {
      fontSize: '13px', color: 'rgba(216,232,255,0.4)', padding: '20px 0', textAlign: 'center',
    });
  }

  var items = [];
  for (var i = 0; i < s.namespaces.length; i++) {
    (function (ns) {
      items.push(UI.row([
        UI.text('📁', { fontSize: '18px' }),
        UI.column([
          UI.text(ns.name, { fontSize: '13px', fontWeight: 'bold', color: '#d8e8ff' }),
          UI.text(ns.count + ' 個檔案', { fontSize: '11px', color: 'rgba(216,232,255,0.4)' }),
        ], { flex: '1', gap: '1px' }),
      ], {
        onClick: function () {
          state.currentNamespace = ns.name;
          state.selectedEntry = null;
          self.rerender();
        },
        onContextMenu: function (event) {
          pendingContextTarget = { type: 'folder', namespace: ns };
          var menuItems = [
            { id: 'open', label: '📂 開啟' },
          ];
          if (state.currentTier !== 'sys') {
            menuItems.push({ separator: true });
            menuItems.push({ id: 'delete-folder', label: '🗑 刪除資料夾', danger: true });
          }
          OS.showContextMenu(app.windowId, 'ctx-folder-' + ns.name, event.x || 100, event.y || 100, menuItems);
        },
        style: {
          alignItems: 'center',
          padding: '10px 14px',
          borderRadius: '8px',
          background: cardBg,
          border: cardBorder,
          gap: '10px',
          cursor: 'pointer',
        },
      }));
    })(s.namespaces[i]);
  }

  return UI.column(items, { gap: '4px', overflow: 'auto', flex: '1' });
}

function renderFileList(entries, s, self) {
  if (entries.length === 0) {
    return UI.text('沒有檔案。', {
      fontSize: '13px', color: 'rgba(216,232,255,0.4)', padding: '20px 0', textAlign: 'center',
    });
  }

  var items = [];
  for (var i = 0; i < entries.length; i++) {
    (function (entry) {
      var displayKey = getDisplayKey(entry);
      var dataType = typeof entry.data;
      if (entry.data && typeof entry.data === 'object') dataType = Array.isArray(entry.data) ? 'array' : 'object';

      items.push(UI.row([
        UI.text('📄', { fontSize: '15px' }),
        UI.column([
          UI.text(displayKey, { fontSize: '12px', fontWeight: 'bold', color: '#d8e8ff' }),
          UI.text(dataType + ' · ' + formatTime(entry.updatedAt), {
            fontSize: '10px', color: 'rgba(216,232,255,0.35)',
          }),
        ], { flex: '1', gap: '1px' }),
      ], {
        onClick: function () {
          state.selectedEntry = entry;
          self.rerender();
        },
        onDblClick: function () {
          // 嘗試以預設應用程式開啟，否則顯示詳情
          var ext = getFileExtension(entry.key);
          if (ext) {
            var handler = OS.getFileTypeHandler(ext);
            if (handler.success && handler.data) {
              OS.launch(handler.data.appDefId);
              return;
            }
          }
          state.selectedEntry = entry;
          self.rerender();
        },
        onContextMenu: function (event) {
          pendingContextTarget = { type: 'file', entry: entry };
          var menuItems = [
            { id: 'view', label: '📋 查看詳情' },
          ];
          var ext = getFileExtension(entry.key);
          if (ext) {
            var handlerResult = OS.getFileTypeHandler(ext);
            if (handlerResult.success && handlerResult.data) {
              menuItems.push({ id: 'open-default', label: '📂 以預設應用程式開啟' });
            }
          }
          if (state.currentTier !== 'sys') {
            menuItems.push({ separator: true });
            menuItems.push({ id: 'delete', label: '🗑 刪除', danger: true });
          }
          OS.showContextMenu(app.windowId, 'ctx-file-' + entry.key, event.x || 100, event.y || 100, menuItems);
        },
        style: {
          alignItems: 'center',
          padding: '8px 12px',
          borderRadius: '8px',
          background: cardBg,
          border: cardBorder,
          gap: '8px',
          cursor: 'pointer',
        },
      }));
    })(entries[i]);
  }

  return UI.column(items, { gap: '3px', overflow: 'auto', flex: '1' });
}

// ── Detail View ─────────────────────────────────────────────
function renderDetail(s, self) {
  var entry = s.selectedEntry;
  if (!entry) return UI.text('');

  var displayKey = getDisplayKey(entry);
  var rows = [
    detailRow('鍵值', entry.key),
    detailRow('顯示名稱', displayKey),
    detailRow('層級', entry.tier),
    detailRow('擁有者', entry.ownerAppId),
    detailRow('建立時間', formatTime(entry.createdAt)),
    detailRow('更新時間', formatTime(entry.updatedAt)),
  ];

  if (entry.metadata) {
    var metaKeys = Object.keys(entry.metadata);
    for (var i = 0; i < metaKeys.length; i++) {
      rows.push(detailRow('meta.' + metaKeys[i], String(entry.metadata[metaKeys[i]])));
    }
  }

  rows.push(UI.separator());
  rows.push(UI.text('資料內容', { fontSize: '12px', fontWeight: 'bold', color: accent }));
  rows.push(UI.text(formatData(entry.data), {
    fontSize: '11px',
    color: 'rgba(216,232,255,0.7)',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    padding: '8px',
    borderRadius: '6px',
    background: 'rgba(0,0,0,0.25)',
    maxHeight: '200px',
    overflow: 'auto',
  }));

  var actionButtons = [
    UI.button('← 返回', {
      onClick: function () {
        state.selectedEntry = null;
        self.rerender();
      },
      style: breadcrumbBtn,
    }),
  ];

  // 「以預設應用程式開啟」按鈕（僅當檔案有副檔名且有對應處理程式時顯示）
  var ext = getFileExtension(entry.key);
  if (ext) {
    var handlerResult = OS.getFileTypeHandler(ext);
    if (handlerResult.success && handlerResult.data) {
      actionButtons.push(UI.button('📂 以預設應用程式開啟', {
        onClick: function () {
          openWithDefaultApp(entry);
        },
        style: btnSmall,
      }));
    }
  }

  if (s.currentTier !== 'sys') {
    actionButtons.push(UI.button('刪除此檔案', {
      onClick: function () {
        deleteEntry(entry);
        state.selectedEntry = null;
        loadEntries();
        loadUsage();
        self.rerender();
      },
      style: dangerBtn,
    }));
  }

  rows.push(UI.row(actionButtons, { gap: '8px' }));

  return UI.column(rows, { gap: '6px', overflow: 'auto', flex: '1' });
}

function detailRow(label, value) {
  return UI.row([
    UI.text(label, { fontSize: '11px', color: 'rgba(216,232,255,0.45)', minWidth: '80px' }),
    UI.text(String(value || '-'), { fontSize: '11px', color: '#d8e8ff', flex: '1' }),
  ], { alignItems: 'baseline', gap: '8px' });
}

// ── Context Menu Event Handler ─────────────────────────────
// 系統層右鍵選單的選取事件由 onWindowEvent 派發
var _origOnWindowEvent = globalThis.onWindowEvent;
globalThis.onWindowEvent = function (event) {
  if (event.type === 'contextmenu-select' && pendingContextTarget) {
    var target = pendingContextTarget;
    pendingContextTarget = null;
    handleContextMenuAction(event.value, target);
    return;
  }
  if (_origOnWindowEvent) _origOnWindowEvent(event);
};

function handleContextMenuAction(actionId, target) {
  if (target.type === 'folder') {
    if (actionId === 'open') {
      state.currentNamespace = target.namespace.name;
      state.selectedEntry = null;
      app.rerender();
    } else if (actionId === 'delete-folder') {
      deleteFolder(target.namespace.name);
      loadEntries();
      loadUsage();
      app.rerender();
    }
  } else if (target.type === 'file') {
    if (actionId === 'view') {
      state.selectedEntry = target.entry;
      app.rerender();
    } else if (actionId === 'open-default') {
      openWithDefaultApp(target.entry);
    } else if (actionId === 'delete') {
      deleteEntry(target.entry);
      loadEntries();
      loadUsage();
      app.rerender();
    }
  }
}
