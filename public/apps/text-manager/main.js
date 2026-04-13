var _loadResult = OS.loadLibrary('stdlib/UI Utils');
if (!_loadResult.success) {
  throw new Error('Failed to load UI library: ' + (_loadResult.error || 'Unknown'));
}

// ── State ────────────────────────────────────────────────────
var state = {
  view: 'list',        // 'list' | 'editor'
  documents: [],       // [{ key, filename, updatedAt }]
  currentKey: null,    // 目前開啟的儲存 key（即檔名）
  currentFilename: '', // 編輯中的檔名（含副檔名）
  currentContent: '',
  dirty: false,
};

// ── Helpers ──────────────────────────────────────────────────
function loadDocumentList() {
  var result = OS.listFiles('user:');
  if (!result.success) { state.documents = []; return; }
  state.documents = (result.data || [])
    .map(function (e) {
      return { key: e.key, filename: e.key, updatedAt: e.updatedAt };
    })
    .sort(function (a, b) { return b.updatedAt - a.updatedAt; });
}

function saveDocument() {
  if (!state.currentFilename) return;
  var filename = state.currentFilename.trim();
  if (!filename) {
    OS.notify('儲存失敗', '檔案名稱不可為空', 'warning');
    return;
  }

  // 存檔路徑：優先用 currentKey（含資料夾），否則用 filename
  var savePath = state.currentKey || filename;

  // 若檔名變更（且有舊 key），先刪除舊檔
  if (state.currentKey && state.currentKey !== savePath) {
    OS.deleteFile('user:' + state.currentKey);
  }

  var result = OS.writeFile('user:' + savePath, state.currentContent, { overwrite: true });
  if (result.success) {
    state.currentKey = savePath;
    state.dirty = false;
    OS.notify('已儲存', filename, 'success');
  } else {
    OS.notify('儲存失敗', result.error || '未知錯誤', 'error');
  }
}

function deleteDocument(key) {
  var result = OS.deleteFile('user:' + key);
  if (result.success) {
    OS.notify('已刪除', '文件已刪除', 'info');
  }
}

function newDocument() {
  state.currentKey = null;
  state.currentFilename = '未命名文件.txt';
  state.currentContent = '';
  state.dirty = true;
  state.view = 'editor';
}

function openDocument(key) {
  var result = OS.readFile('user:' + key);
  if (!result.success) {
    OS.notify('開啟失敗', result.error || '未知錯誤', 'error');
    return;
  }
  state.currentKey = key;
  state.currentFilename = key;
  // 相容舊格式：若 data 是物件則取 content 欄位，否則直接當字串
  var raw = result.data.data;
  if (raw && typeof raw === 'object' && raw.content !== undefined) {
    state.currentContent = String(raw.content);
  } else {
    state.currentContent = raw != null ? String(raw) : '';
  }
  state.dirty = false;
  state.view = 'editor';
}

function formatTime(ts) {
  var d = new Date(ts);
  var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

// ── Styles ───────────────────────────────────────────────────
var accent = '#67b8ff';
var bg = 'linear-gradient(180deg, rgba(10,14,20,0.96), rgba(6,10,14,0.92))';
var cardBg = 'rgba(255,255,255,0.03)';
var cardBorder = '1px solid rgba(255,255,255,0.06)';

var btnStyle = {
  padding: '8px 16px',
  borderRadius: '8px',
  fontSize: '13px',
};

var primaryBtn = {
  padding: '8px 16px',
  borderRadius: '8px',
  fontSize: '13px',
  background: 'linear-gradient(135deg, #4a7fff, #67b8ff)',
  color: '#05101c',
};

var dangerBtn = {
  padding: '6px 12px',
  borderRadius: '6px',
  fontSize: '12px',
  background: 'rgba(255,85,85,0.15)',
  color: '#ff5555',
};

var ghostBtn = {
  padding: '8px 16px',
  borderRadius: '8px',
  fontSize: '13px',
  background: 'rgba(255,255,255,0.08)',
  color: '#d8e8ff',
};

// ── Render ───────────────────────────────────────────────────
var app = UI.createApp({
  title: '文字管理器',
  width: 660,
  height: 580,
  resizable: true,
  style: {
    background: bg,
    color: '#ecf4ff',
    border: '1px solid rgba(118,185,255,0.26)',
    boxShadow: '0 24px 60px rgba(0,0,0,0.34)',
  },
  state: state,
  render: function (s, self) {
    if (s.view === 'editor') {
      return renderEditor(s, self);
    }
    loadDocumentList();
    return renderList(s, self);
  },
});

function renderList(s, self) {
  var items = [];

  if (s.documents.length === 0) {
    items.push(
      UI.text('尚無文件，點擊「新增文件」開始。', {
        fontSize: '13px',
        color: 'rgba(216,232,255,0.5)',
        padding: '20px 0',
        textAlign: 'center',
      })
    );
  } else {
    for (var i = 0; i < s.documents.length; i++) {
      (function (doc) {
        items.push(
          UI.row([
            UI.column([
              UI.text(doc.filename, { fontSize: '14px', fontWeight: 'bold', color: '#d8e8ff' }),
              UI.text(formatTime(doc.updatedAt), { fontSize: '11px', color: 'rgba(216,232,255,0.4)' }),
            ], { flex: '1', gap: '2px' }),
            UI.button('開啟', {
              onClick: function () {
                openDocument(doc.key);
                self.rerender();
              },
              style: btnStyle,
            }),
            UI.button('刪除', {
              onClick: function () {
                deleteDocument(doc.key);
                loadDocumentList();
                self.rerender();
              },
              style: dangerBtn,
            }),
          ], {
            alignItems: 'center',
            padding: '10px 14px',
            borderRadius: '8px',
            background: cardBg,
            border: cardBorder,
          })
        );
      })(s.documents[i]);
    }
  }

  return UI.column([
    UI.row([
      UI.heading('文字管理器', { color: '#d8e8ff', flex: '1' }),
      UI.button('＋ 新增文件', {
        onClick: function () {
          newDocument();
          self.rerender();
        },
        style: primaryBtn,
      }),
    ], { alignItems: 'center' }),
    UI.separator(),
    UI.column(items, { gap: '6px', overflow: 'auto', flex: '1' }),
  ], { padding: '18px', flex: '1' });
}

function renderEditor(s, self) {
  return UI.column([
    // ── Toolbar ──
    UI.row([
      UI.button('← 返回', {
        onClick: function () {
          state.view = 'list';
          self.rerender();
        },
        style: ghostBtn,
      }),
      UI.input({
        id: 'title-input',
        value: s.currentFilename,
        placeholder: '檔案名稱（例如 note.txt）…',
        onChange: function (v) {
          state.currentFilename = v;
          state.dirty = true;
          self.patch('save-indicator', { text: '● 未儲存' });
        },
        style: {
          flex: '1',
          fontSize: '15px',
          fontWeight: 'bold',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          padding: '8px 12px',
          borderRadius: '8px',
          color: '#ecf4ff',
        },
      }),
      UI.button('儲存', {
        onClick: function () {
          saveDocument();
          self.patch('save-indicator', { text: '✓ 已儲存' });
        },
        style: primaryBtn,
      }),
    ], { alignItems: 'center' }),

    UI.text(s.dirty ? '● 未儲存' : '✓ 已儲存', {
      fontSize: '11px',
      color: s.dirty ? '#ffb74d' : 'rgba(216,232,255,0.4)',
      textAlign: 'right',
    }, 'save-indicator'),

    // ── Editor area ──
    UI.textarea({
      id: 'content-editor',
      value: s.currentContent,
      placeholder: '開始輸入文字…',
      rows: 18,
      onChange: function (v) {
        state.currentContent = v;
        state.dirty = true;
        self.patch('save-indicator', { text: '● 未儲存' });
      },
      style: {
        flex: '1',
        resize: 'none',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        color: '#ecf4ff',
        padding: '12px',
        borderRadius: '8px',
        fontSize: '13px',
        lineHeight: '1.6',
      },
    }),
  ], { padding: '18px', flex: '1', gap: '8px' });
}

// ── onFileOpen callback ─────────────────────────────────────
// 從檔案管理器以預設程式開啟時觸發
function onFileOpen(file) {
  if (!file || !file.key) return;

  var content = '';
  var filename = file.key;

  if (file.tier === 'user') {
    // user 層是共享空間，直接用 key 讀取
    var result = OS.readFile('user:' + file.key);
    if (result.success && result.data) {
      var raw = result.data.data;
      if (raw && typeof raw === 'object' && raw.content !== undefined) {
        content = String(raw.content);
      } else {
        content = raw != null ? String(raw) : '';
      }
    }
    state.currentKey = file.key;  // 保留完整路徑（含資料夾），存檔時寫回原位

    // 提取顯示用檔名（取最後一段）
    var lastSlash = filename.lastIndexOf('/');
    if (lastSlash >= 0) filename = filename.slice(lastSlash + 1);
  } else {
    // 非 user 層，使用跨應用路徑讀取
    var slashIdx = filename.indexOf('/');
    if (slashIdx >= 0) filename = filename.slice(slashIdx + 1);

    var path = file.tier + ':@' + file.key;
    var result = OS.readFile(path);
    if (!result.success) {
      result = OS.readFile(file.tier + ':' + filename);
    }
    if (result.success && result.data) {
      var raw = result.data.data;
      if (raw && typeof raw === 'object' && raw.content !== undefined) {
        content = String(raw.content);
      } else {
        content = raw != null ? String(raw) : '';
      }
    }
    state.currentKey = null;  // 非 user 層不繫結
  }

  state.currentFilename = filename;
  state.currentContent = content;
  state.dirty = false;
  state.view = 'editor';
  app.rerender();
}
