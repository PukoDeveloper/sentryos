var styles = imports('styles.js');

var _loadResult = OS.env.loadLibrary('stdlib/UI Utils');
if (!_loadResult.success) {
  throw new Error('Failed to load UI library: ' + (_loadResult.error || 'Unknown'));
}

var autoRefresh = false;
var refreshTimer = null;

function formatSnapshot(d) {
  if (!d) return '無資料';
  var lines = [];
  lines.push('執行時間: ' + (d.uptime || '—'));
  if (d.processes) {
    lines.push('處理程序: ' + d.processes.running + ' 執行中 / ' + d.processes.total + ' 總計');
  }
  if (d.windows !== undefined) lines.push('視窗: ' + d.windows);
  if (d.libraries !== undefined) lines.push('函式庫: ' + d.libraries);
  if (d.commands !== undefined) lines.push('指令: ' + d.commands);
  if (d.apps !== undefined) lines.push('應用程式: ' + d.apps);
  return lines.join('\n');
}

var app = UI.createApp({
  title: '系統監控範例',
  width: 520,
  height: 520,
  style: {
    background: 'linear-gradient(180deg, rgba(10, 14, 20, 0.96), rgba(6, 10, 14, 0.92))',
    color: '#ecf4ff',
    border: '1px solid rgba(118, 185, 255, 0.26)',
    boxShadow: '0 24px 60px rgba(0, 0, 0, 0.34)',
  },
  state: {},
  render: function (state, self) {
    // ── 取得快照 ──
    var snapResult = OS.monitor.snapshot();
    var snap = (snapResult.success && snapResult.data) ? snapResult.data : {};

    // ── 事件統計 ──
    var evtResult = OS.monitor.eventStats();
    var evtData = (evtResult.success && evtResult.data) ? evtResult.data : {};

    // ── API 統計 ──
    var apiResult = OS.monitor.apiStats();
    var apiData = (apiResult.success && apiResult.data) ? apiResult.data : {};

    // ── 權限統計 ──
    var permResult = OS.monitor.permissionStats();
    var permData = (permResult.success && permResult.data) ? permResult.data : {};

    return UI.column([
      UI.heading('Monitor API 範例', { color: '#d8e8ff' }),
      UI.card([
        UI.text('示範 OS.snapshot / eventStats / apiStats / permissionStats / recentEvents', {
          fontSize: '12px', color: 'rgba(216,232,255,0.6)',
        }),
      ]),

      // ── 系統快照 ──
      UI.card([
        UI.column([
          UI.row([
            UI.subheading('系統快照'),
            UI.button(autoRefresh ? '⏸ 停止' : '▶ 自動重整', {
              onClick: function () {
                autoRefresh = !autoRefresh;
                if (autoRefresh) {
                  refreshTimer = setInterval(function () { self.rerender(); }, 2000);
                } else if (refreshTimer) {
                  clearInterval(refreshTimer);
                  refreshTimer = null;
                }
                self.rerender();
              },
              style: {
                padding: '4px 12px', borderRadius: '6px', fontSize: '11px',
                background: autoRefresh ? 'rgba(255,85,85,0.15)' : 'rgba(107,230,138,0.15)',
                color: autoRefresh ? '#ff5555' : '#6be68a',
              },
            }),
            UI.button('重整', {
              onClick: function () { self.rerender(); },
              style: { padding: '4px 12px', borderRadius: '6px', fontSize: '11px', background: 'rgba(255,255,255,0.08)', color: '#d8e8ff' },
            }),
          ], { alignItems: 'center', justifyContent: 'space-between' }),
          UI.text(formatSnapshot(snap), {
            fontSize: '12px', color: '#d8e8ff', whiteSpace: 'pre-line', lineHeight: '1.8',
          }),
        ], { gap: '6px' }),
      ]),

      // ── 事件統計 ──
      UI.card([
        UI.column([
          UI.subheading('事件統計'),
          UI.text(
            '已發布: ' + (evtData.totalEmitted || 0) + '  |  訂閱: ' + (evtData.activeSubscriptions || 0),
            { fontSize: '13px', color: '#67b8ff' }
          ),
        ], { gap: '4px' }),
      ]),

      // ── API 呼叫統計 ──
      UI.card([
        UI.column([
          UI.subheading('API 統計'),
          UI.text(
            '總呼叫: ' + (apiData.totalCalls || 0) + '  |  拒絕: ' + (apiData.totalDenied || 0),
            { fontSize: '13px', color: '#ffb74d' }
          ),
        ], { gap: '4px' }),
      ]),

      // ── 權限統計 ──
      UI.card([
        UI.column([
          UI.subheading('權限統計'),
          UI.text(
            '允許: ' + (permData.totalGranted || 0) + '  |  拒絕: ' + (permData.totalDenied || 0),
            { fontSize: '13px', color: '#c084fc' }
          ),
        ], { gap: '4px' }),
      ]),
    ], { gap: '8px' });
  },
});
