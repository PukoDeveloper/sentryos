var styles = imports('styles.js');

var _loadResult = OS.env.loadLibrary('stdlib/UI Utils');
if (!_loadResult.success) {
  throw new Error('Failed to load UI library: ' + (_loadResult.error || 'Unknown'));
}

var notifTypes = ['info', 'success', 'warning', 'error'];
var selectedType = 0;
var customTitle = '測試通知';
var customBody = '這是一則由範例應用發送的通知。';
var sentCount = 0;
var lastNotifId = '';

var app = UI.createApp({
  title: '通知範例',
  width: 500,
  height: 440,
  state: {},
  render: function (state, self) {
    var typeColors = {
      info: '#67b8ff',
      success: '#6be68a',
      warning: '#ffb74d',
      error: '#ff5555',
    };
    var currentType = notifTypes[selectedType];

    return UI.column([
      UI.heading('Notification API 範例', { color: '#d8e8ff' }),
      UI.card([
        UI.text('示範 OS.notify / OS.dismiss — 發送與關閉通知', {
          fontSize: '12px', color: 'rgba(216,232,255,0.6)',
        }),
      ]),

      // ── 自訂通知 ──
      UI.card([
        UI.column([
          UI.subheading('自訂通知'),
          UI.input({
            id: 'notif-title',
            placeholder: '通知標題',
            value: customTitle,
            onChange: function (v) { customTitle = v; },
          }),
          UI.input({
            id: 'notif-body',
            placeholder: '通知內容',
            value: customBody,
            onChange: function (v) { customBody = v; },
          }),
          UI.text('類型', { fontSize: '12px', color: 'rgba(216,232,255,0.5)' }),
          UI.row(notifTypes.map(function (t, i) {
            var active = i === selectedType;
            return UI.button(t, {
              onClick: function () {
                selectedType = i;
                self.rerender();
              },
              style: {
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: active ? 'bold' : 'normal',
                background: active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                color: active ? typeColors[t] : 'rgba(216,232,255,0.5)',
                border: active ? '1px solid ' + typeColors[t] : '1px solid transparent',
              },
            });
          }), { gap: '4px' }),
        ], { gap: '8px' }),
      ]),

      // ── 發送 ──
      UI.card([
        UI.row([
          UI.button('發送通知', {
            onClick: function () {
              var result = OS.notification.notify(customTitle, customBody, currentType);
              if (result.success && result.data) {
                lastNotifId = result.data;
                sentCount++;
                self.patch('sent-count', { text: '已發送: ' + sentCount + ' 則' });
                self.patch('last-id', { text: 'ID: ' + lastNotifId });
              }
            },
            style: {
              background: 'linear-gradient(135deg,#4a7fff,#67b8ff)',
              color: '#05101c',
              padding: '10px 20px',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 'bold',
            },
          }),
          UI.button('關閉最後通知', {
            onClick: function () {
              if (lastNotifId) {
                OS.notification.dismiss(lastNotifId);
                self.patch('last-id', { text: '已關閉: ' + lastNotifId });
                lastNotifId = '';
              }
            },
            style: styles.buttonStyle('rgba(255,85,85,0.15)', '#ff5555'),
          }),
        ]),
      ]),

      // ── 統計 ──
      UI.card([
        UI.row([
          UI.text('已發送: 0 則', { fontSize: '13px', color: '#6be68a' }, 'sent-count'),
          UI.text('ID: —', { fontSize: '12px', color: 'rgba(216,232,255,0.4)', flex: '1', textAlign: 'right' }, 'last-id'),
        ], { alignItems: 'center' }),
      ]),

      // ── 快速發送 ──
      UI.card([
        UI.column([
          UI.subheading('快速發送'),
          UI.row(notifTypes.map(function (t) {
            return UI.button(t, {
              onClick: function () {
                var result = OS.notification.notify(t + ' 通知', '快速測試 ' + t + ' 類型', t);
                if (result.success) {
                  sentCount++;
                  if (result.data) lastNotifId = result.data;
                  self.patch('sent-count', { text: '已發送: ' + sentCount + ' 則' });
                }
              },
              style: styles.notifButton(typeColors[t]),
            });
          }), { gap: '6px' }),
        ], { gap: '8px' }),
      ]),
    ], { gap: '8px' });
  },
});
