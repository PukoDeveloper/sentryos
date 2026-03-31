var styles = imports('styles.js');

var _loadResult = OS.loadLibrary('stdlib/UI Utils');
if (!_loadResult.success) {
  throw new Error('Failed to load UI library: ' + (_loadResult.error || 'Unknown'));
}

var varKey = 'MY_VAR';
var varValue = 'Hello SentryOS';
var statusMsg = '';

var app = UI.createApp({
  title: '環境變數範例',
  width: 500,
  height: 500,
  style: {
    background: 'linear-gradient(180deg, rgba(10, 14, 20, 0.96), rgba(6, 10, 14, 0.92))',
    color: '#ecf4ff',
    border: '1px solid rgba(118, 185, 255, 0.26)',
    boxShadow: '0 24px 60px rgba(0, 0, 0, 0.34)',
  },
  state: {},
  render: function (state, self) {
    // 取得所有變數
    var allVarsResult = OS.getAllVariables();
    var allVars = (allVarsResult.success && allVarsResult.data) ? allVarsResult.data : {};
    var varEntries = Object.keys(allVars);

    // 取得已載入函式庫
    var libsResult = OS.listLibraries();
    var libs = (libsResult.success && libsResult.data) ? libsResult.data : [];

    return UI.column([
      UI.heading('Environment API 範例', { color: '#d8e8ff' }),
      UI.card([
        UI.text('示範 OS.setVariable / getVariable / getAllVariables / removeVariable / listLibraries', {
          fontSize: '12px', color: 'rgba(216,232,255,0.6)',
        }),
      ]),

      // ── 設定變數 ──
      UI.card([
        UI.column([
          UI.subheading('環境變數操作'),
          UI.row([
            UI.input({
              id: 'var-key',
              placeholder: '變數名稱',
              value: varKey,
              onChange: function (v) { varKey = v; },
              style: { flex: '1' },
            }),
            UI.input({
              id: 'var-value',
              placeholder: '變數值',
              value: varValue,
              onChange: function (v) { varValue = v; },
              style: { flex: '1' },
            }),
          ]),
          UI.row([
            UI.button('設定', {
              onClick: function () {
                var result = OS.setVariable(varKey, varValue);
                statusMsg = result.success ? '✓ 已設定 ' + varKey + '=' + varValue : '✗ ' + (result.error || '設定失敗');
                self.patch('env-status', { text: statusMsg });
                self.rerender();
              },
              style: styles.buttonStyle('linear-gradient(135deg,#4a7fff,#67b8ff)', '#05101c'),
            }),
            UI.button('讀取', {
              onClick: function () {
                var result = OS.getVariable(varKey);
                if (result.success) {
                  statusMsg = varKey + ' = ' + (result.data !== undefined ? JSON.stringify(result.data) : '（未定義）');
                } else {
                  statusMsg = '✗ ' + (result.error || '讀取失敗');
                }
                self.patch('env-status', { text: statusMsg });
              },
              style: styles.buttonStyle('rgba(107,230,138,0.18)', '#6be68a'),
            }),
            UI.button('刪除', {
              onClick: function () {
                var result = OS.removeVariable(varKey);
                statusMsg = result.success ? '✓ 已刪除 ' + varKey : '✗ ' + (result.error || '刪除失敗');
                self.patch('env-status', { text: statusMsg });
                self.rerender();
              },
              style: styles.buttonStyle('rgba(255,85,85,0.15)', '#ff5555'),
            }),
          ]),
          UI.text(statusMsg || '等待操作…', { fontSize: '12px', color: '#67b8ff' }, 'env-status'),
        ], { gap: '8px' }),
      ]),

      // ── 目前變數列表 ──
      UI.card([
        UI.column([
          UI.subheading('目前環境變數 (' + varEntries.length + ')'),
          varEntries.length > 0
            ? UI.column(varEntries.map(function (k) {
              return UI.row([
                UI.text(k, { fontSize: '12px', fontWeight: 'bold', color: '#ffb74d', fontFamily: 'monospace' }),
                UI.text('= ' + JSON.stringify(allVars[k]), { fontSize: '12px', color: 'rgba(216,232,255,0.6)', flex: '1', overflow: 'hidden', textOverflow: 'ellipsis' }),
              ], { gap: '8px', alignItems: 'center' });
            }), { gap: '4px' })
            : UI.text('尚無環境變數', { fontSize: '12px', color: 'rgba(216,232,255,0.35)' }),
        ], { gap: '6px' }),
      ]),

      // ── 已載入函式庫 ──
      UI.card([
        UI.column([
          UI.subheading('已載入函式庫 (' + libs.length + ')'),
          libs.length > 0
            ? UI.column(libs.map(function (lib) {
              return UI.text(lib, {
                fontSize: '12px', fontFamily: 'monospace', color: '#c084fc',
                padding: '4px 8px', borderRadius: '4px', background: 'rgba(192,132,252,0.08)',
              });
            }), { gap: '4px' })
            : UI.text('尚無載入的函式庫', { fontSize: '12px', color: 'rgba(216,232,255,0.35)' }),
        ], { gap: '6px' }),
      ]),
    ], { gap: '8px' });
  },
});
