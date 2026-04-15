var styles = imports('styles.js');

var _loadResult = OS.env.loadLibrary('stdlib/UI Utils');
if (!_loadResult.success) {
  throw new Error('Failed to load UI library: ' + (_loadResult.error || 'Unknown'));
}

var fileContent = '';
var fileName = 'demo.txt';
var statusMsg = '';

var app = UI.createApp({
  title: '儲存空間範例',
  width: 500,
  height: 460,
  style: {
    background: 'linear-gradient(180deg, rgba(10, 14, 20, 0.96), rgba(6, 10, 14, 0.92))',
    color: '#ecf4ff',
    border: '1px solid rgba(118, 185, 255, 0.26)',
    boxShadow: '0 24px 60px rgba(0, 0, 0, 0.34)',
  },
  state: {},
  render: function (state, self) {
    return UI.column([
      UI.heading('Storage API 範例', { color: '#d8e8ff' }),
      UI.card([
        UI.text('示範 OS.writeFile / readFile / deleteFile / listFiles / storageUsage', {
          fontSize: '12px', color: 'rgba(216,232,255,0.6)',
        }),
      ]),

      // ── 寫入檔案 ──
      UI.card([
        UI.column([
          UI.subheading('寫入檔案'),
          UI.input({
            id: 'file-name',
            placeholder: '檔案名稱（例如 demo.txt）',
            value: fileName,
            onChange: function (v) { fileName = v; },
          }),
          UI.input({
            id: 'file-content',
            placeholder: '檔案內容',
            value: fileContent,
            onChange: function (v) { fileContent = v; },
          }),
          UI.row([
            UI.button('寫入', {
              onClick: function () {
                var result = OS.storage.writeFile(fileName, fileContent);
                statusMsg = result.success ? '✓ 已寫入 ' + fileName : '✗ ' + (result.error || '寫入失敗');
                self.patch('status-text', { text: statusMsg });
              },
              style: styles.buttonStyle('linear-gradient(135deg,#4a7fff,#67b8ff)', '#05101c'),
            }),
            UI.button('讀取', {
              onClick: function () {
                var result = OS.storage.readFile(fileName);
                if (result.success && result.data) {
                  statusMsg = '內容: ' + JSON.stringify(result.data.data);
                } else {
                  statusMsg = '✗ ' + (result.error || '讀取失敗');
                }
                self.patch('status-text', { text: statusMsg });
              },
              style: styles.buttonStyle('rgba(107,230,138,0.18)', '#6be68a'),
            }),
            UI.button('刪除', {
              onClick: function () {
                var result = OS.storage.deleteFile(fileName);
                statusMsg = result.success ? '✓ 已刪除' : '✗ ' + (result.error || '刪除失敗');
                self.patch('status-text', { text: statusMsg });
              },
              style: styles.buttonStyle('rgba(255,85,85,0.15)', '#ff5555'),
            }),
          ]),
        ], { gap: '8px' }),
      ]),

      // ── 狀態 ──
      UI.card([
        UI.text(statusMsg || '等待操作…', { fontSize: '13px', color: '#67b8ff', wordBreak: 'break-all' }, 'status-text'),
      ]),

      // ── 列出檔案與用量 ──
      UI.card([
        UI.column([
          UI.subheading('檔案列表與用量'),
          UI.row([
            UI.button('列出檔案', {
              onClick: function () {
                var result = OS.storage.listFiles();
                if (result.success && result.data) {
                  var names = result.data.map(function (f) { return f.key; });
                  statusMsg = '檔案: ' + (names.length > 0 ? names.join(', ') : '（空）');
                } else {
                  statusMsg = '✗ ' + (result.error || '列出失敗');
                }
                self.patch('status-text', { text: statusMsg });
              },
              style: styles.buttonStyle('rgba(255,255,255,0.08)', '#d8e8ff'),
            }),
            UI.button('儲存用量', {
              onClick: function () {
                var result = OS.storage.storageUsage();
                if (result.success && result.data) {
                  var d = result.data;
                  statusMsg = '使用: ' + d.used + ' / ' + d.quota + ' 項';
                } else {
                  statusMsg = '✗ ' + (result.error || '查詢失敗');
                }
                self.patch('status-text', { text: statusMsg });
              },
              style: styles.buttonStyle('rgba(255,255,255,0.08)', '#d8e8ff'),
            }),
          ]),
        ], { gap: '8px' }),
      ]),
    ], { gap: '8px' });
  },
});
