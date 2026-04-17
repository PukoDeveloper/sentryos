// ─────────────────────────────────────────────────────────
// PCODE — Code Editor for SentryOS
// Uses monaco-editor plugin (code_editor UI + OS.editor API)
// ─────────────────────────────────────────────────────────

// ── State ────────────────────────────────────────────────────

var state = {
  currentKey: null,
  currentFilename: 'untitled.js',
  currentContent: '',
  currentLanguage: 'javascript',
  dirty: false,
  pendingSave: false,
};

var WORKSPACE = 'pcode-' + OS.pid;

// ── Language Inference ───────────────────────────────────────

var langExtMap = {
  '.ts': 'typescript', '.tsx': 'typescriptreact',
  '.js': 'javascript', '.jsx': 'javascriptreact',
  '.json': 'json', '.html': 'html', '.css': 'css',
  '.scss': 'scss', '.less': 'less', '.md': 'markdown',
  '.py': 'python', '.java': 'java', '.cpp': 'cpp', '.c': 'c',
  '.cs': 'csharp', '.go': 'go', '.rs': 'rust', '.rb': 'ruby',
  '.php': 'php', '.sql': 'sql', '.xml': 'xml', '.yaml': 'yaml',
  '.yml': 'yaml', '.sh': 'shell', '.ps1': 'powershell',
  '.lua': 'lua', '.txt': 'plaintext',
};

function inferLanguage(filename) {
  var dot = filename.lastIndexOf('.');
  if (dot === -1) return 'plaintext';
  var ext = filename.slice(dot).toLowerCase();
  return langExtMap[ext] || 'plaintext';
}

// ── Language Options ─────────────────────────────────────────

var languageOptions = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'scss', label: 'SCSS' },
  { value: 'less', label: 'Less' },
  { value: 'json', label: 'JSON' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'c', label: 'C' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'php', label: 'PHP' },
  { value: 'sql', label: 'SQL' },
  { value: 'xml', label: 'XML' },
  { value: 'yaml', label: 'YAML' },
  { value: 'shell', label: 'Shell' },
  { value: 'powershell', label: 'PowerShell' },
  { value: 'lua', label: 'Lua' },
  { value: 'plaintext', label: 'Plain Text' },
];

// ── Create Window ────────────────────────────────────────────

var win = OS.ui.createWindow({
  title: 'PCODE',
  width: 900,
  height: 620,
  resizable: true,
  style: {
    background: '#1e1e1e',
    color: '#d4d4d4',
    border: '1px solid rgba(118, 185, 255, 0.18)',
  },
});

if (!win.success) throw new Error('Failed to create window');
var windowId = win.data;

// ── Styles ───────────────────────────────────────────────────

var toolbarBg = '#252526';
var borderColor = '#3c3c3c';
var accentColor = '#0e639c';
var statusBg = '#007acc';

var btnStyle = {
  padding: '4px 10px',
  borderRadius: '4px',
  fontSize: '12px',
  background: 'rgba(255,255,255,0.06)',
  color: '#cccccc',
  cursor: 'pointer',
  border: '1px solid rgba(255,255,255,0.08)',
  whiteSpace: 'nowrap',
};

var primaryBtnStyle = {
  padding: '4px 10px',
  borderRadius: '4px',
  fontSize: '12px',
  background: accentColor,
  color: '#ffffff',
  cursor: 'pointer',
  border: 'none',
  whiteSpace: 'nowrap',
};

var inputStyle = {
  fontSize: '12px',
  padding: '3px 8px',
  background: '#3c3c3c',
  color: '#cccccc',
  border: '1px solid #555555',
  borderRadius: '3px',
  outline: 'none',
};

// ── Render ───────────────────────────────────────────────────

function render() {
  OS.ui.initialize(windowId, [
    OS.ui.stack([

        // ── Toolbar ──────────────────────────────────────────
        OS.ui.stack([
            OS.ui.button('📄 新建', btnStyle, 'btn-new'),
            OS.ui.button('📂 開啟', btnStyle, 'btn-open'),
            OS.ui.button('💾 儲存', primaryBtnStyle, 'btn-save'),
            OS.ui.separator({
              width: '1px',
              height: '20px',
              background: borderColor,
              margin: '0 2px',
              flexShrink: '0',
            }),
            OS.ui.input(
              state.currentFilename,
              '檔案名稱...',
              {
                fontSize: '12px',
                padding: '3px 8px',
                background: '#3c3c3c',
                color: '#cccccc',
                border: '1px solid #555555',
                borderRadius: '3px',
                outline: 'none',
                flex: '1',
                minWidth: '100px',
              },
              'filename-input'
            ),
            OS.ui.select(
              languageOptions,
              state.currentLanguage,
              {
                fontSize: '12px',
                padding: '3px 8px',
                background: '#3c3c3c',
                color: '#cccccc',
                border: '1px solid #555555',
                borderRadius: '3px',
                minWidth: '90px',
              },
              'language-select'
            ),
          ], {
            flexDirection: 'row',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 10px',
            background: toolbarBg,
            borderBottom: '1px solid ' + borderColor,
            flexShrink: '0',
          }, 'toolbar'),

        // ── Monaco Editor ────────────────────────────────────
        OS.ui.code_editor({
          id: 'code-editor',
          value: state.currentContent,
          language: state.currentLanguage,
          workspace: WORKSPACE,
          path: state.currentFilename,
          theme: 'vs-dark',
          readOnly: false,
          minimap: true,
          lineNumbers: 'on',
          wordWrap: 'off',
          fontSize: 14,
          tabSize: 2,
          style: {
            flex: '1',
            overflow: 'hidden',
          },
          events: ['change'],
        }),

        // ── Status Bar ───────────────────────────────────────
        OS.ui.stack([
            OS.ui.label('✓', { fontSize: '12px' }, 'status-dirty'),
            OS.ui.stack([
                OS.ui.label(state.currentFilename, { fontSize: '12px', opacity: '0.85' }, 'status-filename'),
                OS.ui.label(state.currentLanguage, { fontSize: '12px' }, 'status-language'),
              ], { flexDirection: 'row', gap: '16px', alignItems: 'center' }),
          ], {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '2px 12px',
            background: statusBg,
            color: '#ffffff',
            fontSize: '12px',
            flexShrink: '0',
            minHeight: '22px',
          }, 'status-bar'),

      ], {
        height: '100%',
        flexDirection: 'column',
        overflow: 'hidden',
      }, 'root'),
  ]);
}

// ── Initial Render ───────────────────────────────────────────

render();

// ── Event Handling ───────────────────────────────────────────

globalThis.onWindowEvent = function (event) {

  // ── Editor content changed ─────────────────────────────
  if (event.controlId === 'code-editor' && event.type === 'change') {
    if (!state.dirty) {
      state.dirty = true;
      OS.ui.update(windowId, 'status-dirty', { text: '● 已修改' });
    }
    return;
  }

  // ── Button clicks ──────────────────────────────────────
  if (event.type === 'click') {
    if (event.controlId === 'btn-new') {
      newFile();
      return;
    }
    if (event.controlId === 'btn-open') {
      openFilePicker();
      return;
    }
    if (event.controlId === 'btn-save') {
      saveFile();
      return;
    }
  }

  // ── Filename input change ──────────────────────────────
  if (event.type === 'change' && event.controlId === 'filename-input') {
    state.currentFilename = String(event.value);
    var newLang = inferLanguage(state.currentFilename);
    if (newLang !== state.currentLanguage) {
      state.currentLanguage = newLang;
      OS.editor.setLanguage('code-editor', newLang);
      OS.ui.update(windowId, 'language-select', { value: newLang });
      OS.ui.update(windowId, 'status-language', { text: newLang });
    }
    OS.ui.update(windowId, 'status-filename', { text: state.currentFilename });
    return;
  }

  // ── Language selector change ───────────────────────────
  if (event.type === 'change' && event.controlId === 'language-select') {
    state.currentLanguage = String(event.value);
    OS.editor.setLanguage('code-editor', state.currentLanguage);
    OS.ui.update(windowId, 'status-language', { text: state.currentLanguage });
    return;
  }
};

// ── Window Lifecycle ─────────────────────────────────────────

globalThis.onWindowChange = function (event) {
  if (event.type === 'closed') {
    OS.editor.destroyWorkspace(WORKSPACE);
  }
};

// ── Dialog Result ────────────────────────────────────────────

function onDialogResult(result) {
  if (!result || result.cancelled) {
    state.pendingSave = false;
    return;
  }
  if (!result.path) {
    state.pendingSave = false;
    return;
  }

  if (state.pendingSave) {
    state.pendingSave = false;
    var savePath = result.path;
    var content = OS.editor.getValue('code-editor');
    if (content === null) content = '';
    var tier = result.tier || 'user';
    var writeResult = OS.storage.writeFile(tier + ':' + savePath, content, { overwrite: true });
    if (writeResult.success) {
      state.currentKey = tier === 'user' ? savePath : null;
      state.currentContent = content;
      state.dirty = false;
      var lastSlash = savePath.lastIndexOf('/');
      var displayName = lastSlash >= 0 ? savePath.slice(lastSlash + 1) : savePath;
      state.currentFilename = displayName;
      state.currentLanguage = inferLanguage(displayName);
      OS.notification.notify('已儲存', displayName, 'success');
      OS.ui.update(windowId, 'status-dirty', { text: '✓' });
      OS.ui.update(windowId, 'status-filename', { text: displayName });
      OS.ui.update(windowId, 'status-language', { text: state.currentLanguage });
      OS.ui.update(windowId, 'filename-input', { value: displayName });
      OS.ui.update(windowId, 'language-select', { value: state.currentLanguage });
    } else {
      OS.notification.notify('儲存失敗', writeResult.error || '未知錯誤', 'error');
    }
    return;
  }

  openDocument(result.path, result.tier || 'user');
}

// ── File Open (from file manager) ────────────────────────────

function onFileOpen(file) {
  if (!file || !file.key) return;
  openDocument(file.key, file.tier || 'user');
}

// ── File Operations ──────────────────────────────────────────

function newFile() {
  state.currentKey = null;
  state.currentFilename = 'untitled.js';
  state.currentContent = '';
  state.currentLanguage = 'javascript';
  state.dirty = false;
  render();
}

function openFilePicker() {
  OS.dialog.pickFile({
    mode: 'file',
    title: '開啟檔案',
    extensions: [
      '.js', '.ts', '.jsx', '.tsx', '.json',
      '.html', '.css', '.scss', '.less',
      '.md', '.txt', '.py', '.java',
      '.cpp', '.c', '.cs', '.go', '.rs',
      '.rb', '.php', '.sql', '.xml',
      '.yaml', '.yml', '.sh', '.ps1', '.lua',
    ],
  });
}

function openDocument(key, tier) {
  var content = '';
  var filename = key;

  if (tier === 'user') {
    var result = OS.storage.readFile('user:' + key);
    if (result.success && result.data) {
      var raw = result.data.data;
      if (raw && typeof raw === 'object' && raw.content !== undefined) {
        content = String(raw.content);
      } else {
        content = raw != null ? String(raw) : '';
      }
    } else {
      OS.notification.notify('開啟失敗', result.error || '無法讀取檔案', 'error');
      return;
    }
    state.currentKey = key;
  } else {
    var crossPath = tier + ':@' + key;
    var result = OS.storage.readFile(crossPath);
    if (!result.success) {
      var slashIdx = filename.indexOf('/');
      var simpleName = slashIdx >= 0 ? filename.slice(slashIdx + 1) : filename;
      result = OS.storage.readFile(tier + ':' + simpleName);
    }
    if (result.success && result.data) {
      var raw = result.data.data;
      if (raw && typeof raw === 'object' && raw.content !== undefined) {
        content = String(raw.content);
      } else {
        content = raw != null ? String(raw) : '';
      }
    } else {
      OS.notification.notify('開啟失敗', '無法讀取檔案', 'error');
      return;
    }
    state.currentKey = null;
  }

  // Extract display filename
  var lastSlash = filename.lastIndexOf('/');
  if (lastSlash >= 0) filename = filename.slice(lastSlash + 1);

  state.currentFilename = filename;
  state.currentContent = content;
  state.currentLanguage = inferLanguage(filename);
  state.dirty = false;
  render();
}

function saveFile() {
  var filename = state.currentFilename.trim();
  if (!filename) {
    OS.notification.notify('儲存失敗', '檔案名稱不可為空', 'warning');
    return;
  }

  // New file — open save dialog to let user choose location
  if (!state.currentKey) {
    state.pendingSave = true;
    OS.dialog.pickFile({
      mode: 'save',
      title: '儲存檔案',
      defaultPath: filename,
    });
    return;
  }

  // Existing file — save in place
  var content = OS.editor.getValue('code-editor');
  if (content === null) content = '';

  var result = OS.storage.writeFile('user:' + state.currentKey, content, { overwrite: true });
  if (result.success) {
    state.currentContent = content;
    state.dirty = false;
    OS.notification.notify('已儲存', filename, 'success');
    OS.ui.update(windowId, 'status-dirty', { text: '✓' });
  } else {
    OS.notification.notify('儲存失敗', result.error || '未知錯誤', 'error');
  }
}
