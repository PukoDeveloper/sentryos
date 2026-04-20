var _loadResult = OS.env.loadLibrary('stdlib/UI Utils');
if (!_loadResult.success) {
  throw new Error('Failed to load UI library: ' + (_loadResult.error || 'Unknown'));
}

// ── State ────────────────────────────────────────────────────
var state = {
  dialogId: null,
  mode: 'file',           // 'file' | 'folder' | 'save'
  extensions: null,        // ['.txt', '.md'] or null (all)
  title: '',
  entries: [],
  namespaces: [],
  currentNamespace: null,
  saveName: '',
  newFolderMode: false,
  newFolderName: '',
};

// ── Init from fileArgs ──────────────────────────────────────
function onFileOpen(args) {
  if (!args) return;
  if (args.dialogId) {
    state.dialogId = args.dialogId;
    // 自我註冊到 DialogManager
    OS.dialog.bind(state.dialogId);
  }
  if (args.mode) state.mode = args.mode;
  if (args.extensions) state.extensions = args.extensions;
  if (args.title) state.title = args.title;
  // 預設檔案名稱（Save 模式下使用）
  if (args.defaultPath) {
    var dp = String(args.defaultPath);
    var lastSlash = dp.lastIndexOf('/');
    state.saveName = lastSlash >= 0 ? dp.slice(lastSlash + 1) : dp;
  }
  loadEntries();
  app.rerender();
}

// ── Helpers ─────────────────────────────────────────────────
function loadEntries() {
  var result = OS.storage.listAllFiles('user');
  if (!result.success) { state.entries = []; state.namespaces = []; return; }
  var all = result.data || [];
  state.entries = all;

  var nsMap = {};
  for (var i = 0; i < all.length; i++) {
    var slashIdx = all[i].key.indexOf('/');
    if (slashIdx > 0) {
      var ns = all[i].key.slice(0, slashIdx);
      if (!nsMap[ns]) nsMap[ns] = 0;
      nsMap[ns]++;
    }
  }
  state.namespaces = Object.keys(nsMap).map(function (ns) {
    return { name: ns, count: nsMap[ns] };
  }).sort(function (a, b) { return a.name.localeCompare(b.name); });
}

function getFilteredEntries() {
  if (!state.currentNamespace) {
    return state.entries.filter(function (e) {
      return e.key.indexOf('/') < 0;
    });
  }
  var prefix = state.currentNamespace + '/';
  return state.entries.filter(function (e) {
    return e.key.indexOf(prefix) === 0;
  });
}

function getDisplayKey(entry) {
  var slashIdx = entry.key.lastIndexOf('/');
  return slashIdx >= 0 ? entry.key.slice(slashIdx + 1) : entry.key;
}

function getFileExtension(key) {
  var dotIdx = key.lastIndexOf('.');
  if (dotIdx < 0) return '';
  return key.slice(dotIdx).toLowerCase();
}

function matchesExtension(key) {
  if (!state.extensions || state.extensions.length === 0) return true;
  var ext = getFileExtension(key);
  if (!ext) return false;
  for (var i = 0; i < state.extensions.length; i++) {
    if (state.extensions[i].toLowerCase() === ext) return true;
  }
  return false;
}

function isFolder(key) {
  return key.endsWith('/.folder');
}

function doResolve(entryKey) {
  if (!state.dialogId) return;
  var filename = entryKey;
  var lastSlash = filename.lastIndexOf('/');
  if (lastSlash >= 0) filename = filename.slice(lastSlash + 1);
  OS.dialog.resolve(state.dialogId, {
    path: entryKey,
    tier: 'user',
    filename: filename,
  });
}

function doCancel() {
  if (!state.dialogId) return;
  OS.dialog.cancel(state.dialogId);
}

// ── Styles ──────────────────────────────────────────────────
var accent = '#67b8ff';
var itemBg = 'rgba(255,255,255,0.03)';
var itemBorder = '1px solid rgba(255,255,255,0.06)';
var btnStyle = {
  padding: '6px 14px',
  borderRadius: '6px',
  fontSize: '12px',
};
var inputStyle = {
  flex: '1',
  padding: '6px 10px',
  borderRadius: '6px',
  fontSize: '12px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#d8e8ff',
};

// ── Render ──────────────────────────────────────────────────
function render(s, self) {
  var children = [];

  // ── Title ──
  var titleText = s.title || (s.mode === 'folder' ? '選擇資料夾' : s.mode === 'save' ? '儲存檔案' : '選擇檔案');
  children.push(UI.text(titleText, {
    fontSize: '15px', fontWeight: 'bold', color: '#d8e8ff',
    padding: '8px 12px 4px',
  }));

  // ── Breadcrumb ──
  var breadParts = [];
  breadParts.push(UI.button('📁 user', {
    onClick: function () {
      state.currentNamespace = null;
      self.rerender();
    },
    style: { padding: '4px 10px', borderRadius: '6px', fontSize: '11px', background: 'rgba(103,184,255,0.1)', color: accent },
  }));
  if (s.currentNamespace) {
    breadParts.push(UI.text(' / ', { fontSize: '12px', color: 'rgba(216,232,255,0.3)' }));
    breadParts.push(UI.text(s.currentNamespace, { fontSize: '12px', fontWeight: 'bold', color: '#d8e8ff' }));
  }
  children.push(UI.row(breadParts, { alignItems: 'center', gap: '2px', padding: '4px 12px' }));

  // ── Extension filter hint ──
  if (s.extensions && s.extensions.length > 0) {
    children.push(UI.text('篩選: ' + s.extensions.join(', '), {
      fontSize: '11px', color: 'rgba(216,232,255,0.4)', padding: '0 12px 4px',
    }));
  }

  // ── Content ──
  var items = [];

  // Show folders when at top level
  if (!s.currentNamespace) {
    // Folder items (for file mode and folder mode)
    for (var fi = 0; fi < s.namespaces.length; fi++) {
      (function (ns) {
        var row = UI.row([
          UI.text('📁', { fontSize: '16px' }),
          UI.column([
            UI.text(ns.name, { fontSize: '12px', fontWeight: 'bold', color: '#d8e8ff' }),
            UI.text(ns.count + ' 個檔案', { fontSize: '10px', color: 'rgba(216,232,255,0.4)' }),
          ], { flex: '1', gap: '1px' }),
        ], {
          onClick: function () {
            if (s.mode === 'folder') {
              // 資料夾模式：點擊資料夾 = 選擇
              doResolve(ns.name);
              return;
            }
            state.currentNamespace = ns.name;
            self.rerender();
          },
          style: {
            alignItems: 'center', gap: '8px', padding: '8px 10px',
            borderRadius: '6px', background: itemBg, border: itemBorder, cursor: 'pointer',
          },
        });
        items.push(row);
      })(s.namespaces[fi]);
    }

    // Top-level files (only in file/save mode)
    if (s.mode !== 'folder') {
      var topFiles = getFilteredEntries();
      for (var ti = 0; ti < topFiles.length; ti++) {
        (function (entry) {
          if (isFolder(entry.key)) return;
          if (!matchesExtension(entry.key)) return;
          var displayName = getDisplayKey(entry);
          var row = UI.row([
            UI.text('📄', { fontSize: '16px' }),
            UI.text(displayName, { fontSize: '12px', color: '#d8e8ff', flex: '1' }),
          ], {
            onClick: function () {
              if (s.mode === 'save') {
                state.saveName = displayName;
                self.rerender();
                return;
              }
              doResolve(entry.key);
            },
            style: {
              alignItems: 'center', gap: '8px', padding: '8px 10px',
              borderRadius: '6px', background: itemBg, border: itemBorder, cursor: 'pointer',
            },
          });
          items.push(row);
        })(topFiles[ti]);
      }
    }
  } else {
    // Inside a namespace
    if (s.mode === 'folder') {
      // 已在資料夾內，不需要更深
      items.push(UI.text('已進入資料夾 — 按下方「選擇」確認', {
        fontSize: '12px', color: 'rgba(216,232,255,0.5)', padding: '12px 0', textAlign: 'center',
      }));
    } else {
      var filtered = getFilteredEntries();
      for (var ei = 0; ei < filtered.length; ei++) {
        (function (entry) {
          if (isFolder(entry.key)) return;
          if (!matchesExtension(entry.key)) return;
          var displayName = getDisplayKey(entry);
          var row = UI.row([
            UI.text('📄', { fontSize: '16px' }),
            UI.text(displayName, { fontSize: '12px', color: '#d8e8ff', flex: '1' }),
          ], {
            onClick: function () {
              if (s.mode === 'save') {
                state.saveName = displayName;
                self.rerender();
                return;
              }
              doResolve(entry.key);
            },
            style: {
              alignItems: 'center', gap: '8px', padding: '8px 10px',
              borderRadius: '6px', background: itemBg, border: itemBorder, cursor: 'pointer',
            },
          });
          items.push(row);
        })(filtered[ei]);
      }
    }
  }

  if (items.length === 0) {
    items.push(UI.text('沒有符合條件的項目', {
      fontSize: '12px', color: 'rgba(216,232,255,0.4)', padding: '16px 0', textAlign: 'center',
    }));
  }

  children.push(UI.column(items, {
    gap: '4px', padding: '4px 12px', flex: '1', overflow: 'auto',
  }));

  // ── Save mode: filename input ──
  if (s.mode === 'save') {
    children.push(UI.row([
      UI.text('檔名：', { fontSize: '12px', color: 'rgba(216,232,255,0.6)', minWidth: '40px' }),
      UI.input({
        value: s.saveName,
        placeholder: '輸入檔案名稱',
        style: inputStyle,
        onChange: function (v) {
          state.saveName = v || '';
        },
      }),
    ], { alignItems: 'center', gap: '6px', padding: '4px 12px' }));
  }

  // ── Save mode: create folder button ──
  if (s.mode === 'save') {
    children.push(UI.row([
      UI.button('📁+ 新增資料夾', {
        onClick: function () {
          state.newFolderMode = !state.newFolderMode;
          state.newFolderName = '';
          self.rerender();
        },
        style: Object.assign({}, btnStyle, {
          background: 'rgba(103,184,255,0.1)', color: accent, fontSize: '11px',
        }),
      }),
    ], { padding: '0 12px 4px', gap: '6px' }));

    if (s.newFolderMode) {
      children.push(UI.row([
        UI.input({
          value: s.newFolderName || '',
          placeholder: '資料夾名稱',
          style: inputStyle,
          onChange: function (v) {
            state.newFolderName = v || '';
          },
        }),
        UI.button('建立', {
          onClick: function () {
            var folderName = (state.newFolderName || '').trim();
            if (!folderName) {
              OS.notification.notify('請輸入資料夾名稱', '', 'warning');
              return;
            }
            var fullName = s.currentNamespace ? s.currentNamespace + '/' + folderName : folderName;
            var path = 'user:' + fullName + '/.folder';
            var result = OS.storage.writeFile(path, null, { overwrite: false });
            if (!result.success) {
              if (result.error === 'AlreadyExists') {
                OS.notification.notify('資料夾「' + folderName + '」已存在', '', 'warning');
              } else {
                OS.notification.notify('建立失敗', result.error || '未知錯誤', 'error');
              }
              return;
            }
            state.newFolderMode = false;
            state.newFolderName = '';
            state.currentNamespace = fullName;
            loadEntries();
            self.rerender();
          },
          style: Object.assign({}, btnStyle, { background: accent, color: '#0a0e14', fontWeight: 'bold' }),
        }),
        UI.button('取消', {
          onClick: function () {
            state.newFolderMode = false;
            state.newFolderName = '';
            self.rerender();
          },
          style: Object.assign({}, btnStyle, { background: 'rgba(255,255,255,0.06)', color: 'rgba(216,232,255,0.6)' }),
        }),
      ], { alignItems: 'center', gap: '6px', padding: '0 12px 4px' }));
    }
  }

  // ── Footer buttons ──
  var footerBtns = [];

  // Folder mode: select current folder
  if (s.mode === 'folder' && s.currentNamespace) {
    footerBtns.push(UI.button('✓ 選擇此資料夾', {
      onClick: function () {
        doResolve(s.currentNamespace);
      },
      style: Object.assign({}, btnStyle, { background: accent, color: '#0a0e14', fontWeight: 'bold' }),
    }));
  }

  // Save mode: confirm save
  if (s.mode === 'save') {
    footerBtns.push(UI.button('💾 儲存', {
      onClick: function () {
        var name = (s.saveName || '').trim();
        if (!name) {
          OS.notification.notify('請輸入檔案名稱', '', 'warning');
          return;
        }
        var fullPath = s.currentNamespace ? s.currentNamespace + '/' + name : name;
        doResolve(fullPath);
      },
      style: Object.assign({}, btnStyle, { background: accent, color: '#0a0e14', fontWeight: 'bold' }),
    }));
  }

  footerBtns.push(UI.button('取消', {
    onClick: function () {
      doCancel();
    },
    style: Object.assign({}, btnStyle, { background: 'rgba(255,255,255,0.06)', color: 'rgba(216,232,255,0.6)' }),
  }));

  children.push(UI.row(footerBtns, {
    justifyContent: 'flex-end', gap: '6px', padding: '8px 12px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
  }));

  return UI.column(children, {
    height: '100%',
    background: 'linear-gradient(180deg, rgba(10,14,20,0.96), rgba(6,10,14,0.92))',
  });
}

// ── App ─────────────────────────────────────────────────────
var app = UI.createApp({
  state: state,
  window: {
    title: '選擇檔案',
    width: 440,
    height: 400,
    alwaysOnTop: true,
  },
  render: render,
});

loadEntries();
app.rerender();
