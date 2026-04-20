var _loadResult = OS.env.loadLibrary('stdlib/UI Utils');
if (!_loadResult.success) {
  throw new Error('Failed to load UI library: ' + (_loadResult.error || 'Unknown'));
}

// ── State ────────────────────────────────────────────────────
var state = {
  view: 'welcome',   // 'welcome' | 'viewer'
  src: null,         // 目前顯示的圖片 src（data URL 或 URL）
  filename: '',      // 顯示用檔名
  zoom: 1.0,         // 縮放倍率
  fitMode: true,     // 是否以符合視窗模式顯示
};

var IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico'];

// ── Helpers ──────────────────────────────────────────────────
function openFilePicker() {
  OS.dialog.pickFile({
    mode: 'file',
    extensions: IMAGE_EXTENSIONS,
    title: '開啟圖片',
  });
}

function loadImageFromStorage(key, tier) {
  var result = OS.storage.readFile((tier || 'user') + ':' + key);
  if (!result.success) {
    OS.notification.notify('開啟失敗', result.error || '無法讀取圖片', 'error');
    return null;
  }
  var raw = result.data && result.data.data;
  if (!raw) {
    OS.notification.notify('開啟失敗', '檔案內容為空', 'error');
    return null;
  }
  // raw 可能是 data URL 字串，或物件 { content: '...' }
  if (typeof raw === 'object' && raw.content !== undefined) {
    return String(raw.content);
  }
  return String(raw);
}

function extractFilename(key) {
  if (!key) return '未命名';
  var slash = key.lastIndexOf('/');
  return slash >= 0 ? key.slice(slash + 1) : key;
}

function zoomIn() {
  state.fitMode = false;
  state.zoom = Math.min(state.zoom * 1.25, 8.0);
}

function zoomOut() {
  state.fitMode = false;
  state.zoom = Math.max(state.zoom / 1.25, 0.1);
}

function resetZoom() {
  state.fitMode = false;
  state.zoom = 1.0;
}

function fitToWindow() {
  state.fitMode = true;
  state.zoom = 1.0;
}

// ── Styles ───────────────────────────────────────────────────
var accent = '#67b8ff';

var primaryBtn = {
  padding: '8px 16px',
  borderRadius: '8px',
  fontSize: '13px',
  background: 'linear-gradient(135deg, #4a7fff, #67b8ff)',
  color: '#05101c',
};

var ghostBtn = {
  padding: '8px 16px',
  borderRadius: '8px',
  fontSize: '13px',
  background: 'rgba(255,255,255,0.08)',
  color: '#d8e8ff',
};

var iconBtn = {
  padding: '6px 12px',
  borderRadius: '6px',
  fontSize: '15px',
  background: 'rgba(255,255,255,0.06)',
  color: '#d8e8ff',
  minWidth: '34px',
  textAlign: 'center',
};

// ── Render ───────────────────────────────────────────────────
var app = UI.createApp({
  title: '圖片檢視器',
  width: 700,
  height: 520,
  resizable: true,
  state: state,
  render: function (s, self) {
    if (s.view === 'viewer') {
      return renderViewer(s, self);
    }
    return renderWelcome(s, self);
  },
});

function renderToolbar(s, self) {
  return UI.row([
    UI.button('← 返回', {
      onClick: function () {
        state.view = 'welcome';
        self.rerender();
      },
      style: ghostBtn,
    }),
    UI.button('📂 開啟', {
      onClick: function () { openFilePicker(); },
      style: ghostBtn,
    }),
    UI.spacer(),
    // 縮放控制
    UI.button('−', {
      onClick: function () { zoomOut(); applyZoom(self); },
      style: iconBtn,
    }),
    UI.text(
      s.fitMode ? '符合視窗' : Math.round(s.zoom * 100) + '%',
      {
        fontSize: '12px',
        color: 'rgba(216,232,255,0.7)',
        minWidth: '64px',
        textAlign: 'center',
        alignSelf: 'center',
      },
      'zoom-label'
    ),
    UI.button('+', {
      onClick: function () { zoomIn(); applyZoom(self); },
      style: iconBtn,
    }),
    UI.button('⊡', {
      onClick: function () { fitToWindow(); applyZoom(self); },
      style: Object.assign({}, iconBtn, { fontSize: '14px' }),
    }),
    UI.button('1:1', {
      onClick: function () { resetZoom(); applyZoom(self); },
      style: Object.assign({}, iconBtn, { fontSize: '12px' }),
    }),
  ], {
    padding: '6px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)',
    alignItems: 'center',
    gap: '4px',
  });
}

function getImageStyle(s) {
  if (s.fitMode) {
    return {
      maxWidth: '100%',
      maxHeight: '100%',
      objectFit: 'contain',
      display: 'block',
    };
  }
  return {
    width: Math.round(s.zoom * 100) + '%',
    imageRendering: s.zoom > 2 ? 'pixelated' : 'auto',
    display: 'block',
    maxWidth: 'none',
  };
}

function applyZoom(self) {
  var label = state.fitMode ? '符合視窗' : Math.round(state.zoom * 100) + '%';
  self.patch('zoom-label', { text: label });
  self.patch('image-display', { style: getImageStyle(state) });
}

function renderViewer(s, self) {
  return UI.column([
    renderToolbar(s, self),
    // 圖片容器
    UI.box([
      UI.image(s.src, {
        alt: s.filename,
        style: getImageStyle(s),
        id: 'image-display',
      }),
    ], {
      flex: '1',
      overflow: 'auto',
      display: 'flex',
      alignItems: s.fitMode ? 'center' : 'flex-start',
      justifyContent: s.fitMode ? 'center' : 'flex-start',
      background: 'rgba(0,0,0,0.3)',
      padding: s.fitMode ? '12px' : '0',
    }),
    // 狀態列
    UI.row([
      UI.text('🖼 ' + s.filename, {
        fontSize: '12px',
        color: 'rgba(216,232,255,0.55)',
        overflow: 'hidden',
      }),
    ], {
      padding: '4px 12px',
      borderTop: '1px solid rgba(255,255,255,0.05)',
      background: 'rgba(0,0,0,0.2)',
    }),
  ], { flex: '1', height: '100%' });
}

function renderWelcome(s, self) {
  return UI.column([
    UI.column([
      UI.text('🖼', { fontSize: '48px', textAlign: 'center', padding: '12px 0 0' }),
      UI.text('圖片檢視器', {
        fontSize: '20px',
        fontWeight: 'bold',
        color: '#d8e8ff',
        textAlign: 'center',
      }),
      UI.text('開啟圖片檔案以開始檢視', {
        fontSize: '13px',
        color: 'rgba(216,232,255,0.5)',
        textAlign: 'center',
        padding: '4px 0 20px',
      }),
      UI.row([
        UI.button('📂 開啟圖片', {
          onClick: function () { openFilePicker(); },
          style: primaryBtn,
        }),
      ], { justifyContent: 'center' }),
      UI.text(
        '支援格式：PNG、JPG、GIF、BMP、WebP、SVG',
        {
          fontSize: '11px',
          color: 'rgba(216,232,255,0.3)',
          textAlign: 'center',
          padding: '16px 0 0',
        }
      ),
    ], {
      flex: '1',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '4px',
    }),
  ], { flex: '1', height: '100%' });
}

// ── File open callbacks ───────────────────────────────────────

function onFileOpen(file) {
  if (!file || !file.key) return;

  var src = null;
  var key = file.key;
  var tier = file.tier || 'user';

  if (tier === 'user') {
    src = loadImageFromStorage(key, 'user');
  } else {
    // 跨應用存取
    var crossResult = OS.storage.readFile(tier + ':@' + key);
    if (crossResult.success && crossResult.data) {
      var raw = crossResult.data.data;
      src = (raw && typeof raw === 'object' && raw.content !== undefined)
        ? String(raw.content)
        : (raw != null ? String(raw) : null);
    }
  }

  if (!src) return;

  state.src = src;
  state.filename = extractFilename(key);
  state.view = 'viewer';
  state.fitMode = true;
  state.zoom = 1.0;
  app.rerender();
}

function onDialogResult(result) {
  if (!result || result.cancelled) return;
  if (!result.path) return;
  onFileOpen({
    key: result.path,
    tier: result.tier || 'user',
  });
}
