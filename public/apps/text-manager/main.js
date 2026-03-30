var _loadResult = envApi.loadLibrary('stdlib/UI Utils');
if (!_loadResult.success) {
  throw new Error('Failed to load UI library: ' + (_loadResult.error || 'Unknown'));
}

// ── State ────────────────────────────────────────────────────
var TIER = 'user';
var PREFIX = 'doc:';

var state = {
  view: 'list',        // 'list' | 'editor'
  documents: [],       // [{ key, title, updatedAt }]
  currentKey: null,
  currentTitle: '',
  currentContent: '',
  dirty: false,
};

// ── Helpers ──────────────────────────────────────────────────
function loadDocumentList() {
  var result = storageApi.list(TIER);
  if (!result.success) { state.documents = []; return; }
  state.documents = (result.data || [])
    .filter(function (e) { return e.key.indexOf(PREFIX) === 0; })
    .map(function (e) {
      return { key: e.key, title: e.data.title || e.key.slice(PREFIX.length), updatedAt: e.updatedAt };
    })
    .sort(function (a, b) { return b.updatedAt - a.updatedAt; });
}

function saveDocument() {
  if (!state.currentKey) return;
  var result = storageApi.write(TIER, state.currentKey, {
    title: state.currentTitle,
    content: state.currentContent,
  }, { overwrite: true });
  if (result.success) {
    state.dirty = false;
    notificationApi.notify('已儲存', state.currentTitle, 'success');
  } else {
    notificationApi.notify('儲存失敗', result.error || '未知錯誤', 'error');
  }
}

function deleteDocument(key) {
  var result = storageApi.delete(TIER, key);
  if (result.success) {
    notificationApi.notify('已刪除', '文件已刪除', 'info');
  }
}

function newDocument() {
  var id = 'doc_' + Date.now();
  state.currentKey = PREFIX + id;
  state.currentTitle = '未命名文件';
  state.currentContent = '';
  state.dirty = true;
  state.view = 'editor';
}

function openDocument(key) {
  var result = storageApi.read(TIER, key);
  if (!result.success) {
    notificationApi.notify('開啟失敗', result.error || '未知錯誤', 'error');
    return;
  }
  state.currentKey = key;
  state.currentTitle = result.data.data.title || '';
  state.currentContent = result.data.data.content || '';
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
              UI.text(doc.title, { fontSize: '14px', fontWeight: 'bold', color: '#d8e8ff' }),
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
        value: s.currentTitle,
        placeholder: '文件標題…',
        onChange: function (v) {
          state.currentTitle = v;
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
