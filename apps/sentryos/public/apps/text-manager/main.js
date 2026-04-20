var _loadResult = OS.env.loadLibrary('stdlib/UI Utils');
if (!_loadResult.success) {
  throw new Error('Failed to load UI library: ' + (_loadResult.error || 'Unknown'));
}

// ── State ────────────────────────────────────────────────────
var state = {
  view: 'welcome',     // 'welcome' | 'editor'
  currentKey: null,    // 目前開啟的儲存 key（即檔名）
  currentFilename: '', // 編輯中的檔名（含副檔名）
  currentContent: '',
  dirty: false,
};

// ── Helpers ──────────────────────────────────────────────────

function saveDocument() {
  if (!state.currentFilename) return;
  var filename = state.currentFilename.trim();
  if (!filename) {
    OS.notification.notify('儲存失敗', '檔案名稱不可為空', 'warning');
    return;
  }

  // 存檔路徑：優先用 currentKey（含資料夾），否則用 filename
  var savePath = state.currentKey || filename;

  // 若檔名變更（且有舊 key），先刪除舊檔
  if (state.currentKey && state.currentKey !== savePath) {
    OS.storage.deleteFile('user:' + state.currentKey);
  }

  var result = OS.storage.writeFile('user:' + savePath, state.currentContent, { overwrite: true });
  if (result.success) {
    state.currentKey = savePath;
    state.dirty = false;
    OS.notification.notify('已儲存', filename, 'success');
  } else {
    OS.notification.notify('儲存失敗', result.error || '未知錯誤', 'error');
  }
}

function deleteDocument(key) {
  var result = OS.storage.deleteFile('user:' + key);
  if (result.success) {
    OS.notification.notify('已刪除', '文件已刪除', 'info');
  }
}

function newDocument() {
  state.currentKey = null;
  state.currentFilename = '未命名文件.txt';
  state.currentContent = '';
  state.dirty = true;
  state.view = 'editor';
}

function openFilePicker() {
  OS.dialog.pickFile({
    mode: 'file',
    extensions: ['.txt', '.md', '.json', '.js', '.css', '.html', '.xml', '.csv', '.log'],
    title: '開啟檔案',
  });
}

function openDocument(key) {
  var result = OS.storage.readFile('user:' + key);
  if (!result.success) {
    OS.notification.notify('開啟失敗', result.error || '未知錯誤', 'error');
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
  title: '文字編輯器',
  width: 660,
  height: 580,
  resizable: true,
  state: state,
  render: function (s, self) {
    if (s.view === 'editor') {
      return renderEditor(s, self);
    }
    return renderWelcome(s, self);
  },
});

function renderNavBar(s, self) {
  return UI.row([
    UI.button('📄 新增檔案', {
      onClick: function () {
        newDocument();
        self.rerender();
      },
      style: ghostBtn,
    }),
    UI.button('📂 開啟檔案', {
      onClick: function () {
        openFilePicker();
      },
      style: ghostBtn,
    }),
  ], {
    gap: '4px',
    padding: '6px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)',
  });
}

function renderWelcome(s, self) {
  return UI.column([
    renderNavBar(s, self),
    UI.column([
      UI.text('✨', { fontSize: '42px', textAlign: 'center', padding: '12px 0 0' }),
      UI.text('歡迎使用文字編輯器', {
        fontSize: '20px', fontWeight: 'bold', color: '#d8e8ff', textAlign: 'center',
      }),
      UI.text('建立新檔案或開啟現有檔案來開始編輯', {
        fontSize: '13px', color: 'rgba(216,232,255,0.5)', textAlign: 'center', padding: '4px 0 20px',
      }),
      UI.row([
        UI.button('📄 新增檔案', {
          onClick: function () {
            newDocument();
            self.rerender();
          },
          style: primaryBtn,
        }),
        UI.button('📂 開啟檔案', {
          onClick: function () {
            openFilePicker();
          },
          style: ghostBtn,
        }),
      ], { justifyContent: 'center', gap: '10px' }),
    ], {
      flex: '1', justifyContent: 'center', alignItems: 'center', gap: '4px',
    }),
  ], { flex: '1', height: '100%' });
}

function renderEditor(s, self) {
  return UI.column([
    renderNavBar(s, self),
    UI.column([
      // ── Toolbar ──
      UI.row([
        UI.button('← 返回', {
          onClick: function () {
            state.view = 'welcome';
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
    ], { padding: '18px', flex: '1', gap: '8px' }),
  ], { flex: '1', height: '100%' });
}

// ── onFileOpen callback ─────────────────────────────────────
// 從檔案管理器以預設程式開啟時觸發
function onFileOpen(file) {
  if (!file || !file.key) return;

  var content = '';
  var filename = file.key;

  if (file.tier === 'user') {
    // user 層是共享空間，直接用 key 讀取
    var result = OS.storage.readFile('user:' + file.key);
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
    var result = OS.storage.readFile(path);
    if (!result.success) {
      result = OS.storage.readFile(file.tier + ':' + filename);
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

// ── onDialogResult callback ─────────────────────────────────
function onDialogResult(result) {
  if (!result || result.cancelled) return;
  if (!result.path) return;
  // 透過 dialog 選取的檔案，用 onFileOpen 的相同邏輯開啟
  onFileOpen({
    key: result.path,
    tier: result.tier || 'user',
  });
}
