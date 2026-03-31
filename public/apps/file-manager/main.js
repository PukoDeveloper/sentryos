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
};

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
  return UI.column([
    renderHeader(s, self),
    UI.separator(),
    renderUsageBar(s),
    UI.separator(),
    renderBreadcrumb(s, self),
    s.selectedEntry ? renderDetail(s, self) : renderContent(s, self),
  ], { padding: '16px', flex: '1' });
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
      self.rerender();
    },
    style: breadcrumbBtn,
  }));

  if (s.currentNamespace) {
    parts.push(UI.text('›', { fontSize: '14px', color: 'rgba(216,232,255,0.3)' }));
    parts.push(UI.button(s.currentNamespace, {
      onClick: function () {
        state.selectedEntry = null;
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
        UI.button('開啟', {
          onClick: function () {
            state.currentNamespace = ns.name;
            state.selectedEntry = null;
            self.rerender();
          },
          style: btnSmall,
        }),
      ], {
        alignItems: 'center',
        padding: '10px 14px',
        borderRadius: '8px',
        background: cardBg,
        border: cardBorder,
        gap: '10px',
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
        UI.button('查看', {
          onClick: function () {
            state.selectedEntry = entry;
            self.rerender();
          },
          style: btnSmall,
        }),
        s.currentTier !== 'sys' ? UI.button('刪除', {
          onClick: function () {
            deleteEntry(entry);
            loadEntries();
            loadUsage();
            self.rerender();
          },
          style: dangerBtn,
        }) : UI.text(''),
      ], {
        alignItems: 'center',
        padding: '8px 12px',
        borderRadius: '8px',
        background: cardBg,
        border: cardBorder,
        gap: '8px',
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

  rows.push(UI.row([
    UI.button('← 返回', {
      onClick: function () {
        state.selectedEntry = null;
        self.rerender();
      },
      style: breadcrumbBtn,
    }),
    s.currentTier !== 'sys' ? UI.button('刪除此檔案', {
      onClick: function () {
        deleteEntry(entry);
        state.selectedEntry = null;
        loadEntries();
        loadUsage();
        self.rerender();
      },
      style: dangerBtn,
    }) : UI.text(''),
  ], { gap: '8px' }));

  return UI.column(rows, { gap: '6px', overflow: 'auto', flex: '1' });
}

function detailRow(label, value) {
  return UI.row([
    UI.text(label, { fontSize: '11px', color: 'rgba(216,232,255,0.45)', minWidth: '80px' }),
    UI.text(String(value || '-'), { fontSize: '11px', color: '#d8e8ff', flex: '1' }),
  ], { alignItems: 'baseline', gap: '8px' });
}
