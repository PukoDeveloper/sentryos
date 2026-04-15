var _loadResult = OS.env.loadLibrary('stdlib/UI Utils');
if (!_loadResult.success) {
  throw new Error('Failed to load UI library: ' + (_loadResult.error || 'Unknown'));
}

// ── Helpers ──────────────────────────────────────────────────
var DAYS = ['日', '一', '二', '三', '四', '五', '六'];

function pad(n) { return n < 10 ? '0' + n : '' + n; }

function getTimeString() {
  var d = new Date();
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

function getDateString() {
  var d = new Date();
  return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日　星期' + DAYS[d.getDay()];
}

// ── Styles ───────────────────────────────────────────────────
var bg = 'linear-gradient(180deg, rgba(10,14,20,0.97), rgba(6,10,14,0.94))';

// ── Stopwatch state ─────────────────────────────────────────
var swRunning = false;
var swStart = 0;
var swElapsed = 0;

function formatStopwatch(ms) {
  var totalSec = Math.floor(ms / 1000);
  var min = Math.floor(totalSec / 60);
  var sec = totalSec % 60;
  var cs = Math.floor((ms % 1000) / 10);
  return pad(min) + ':' + pad(sec) + '.' + pad(cs);
}

// ── Render ───────────────────────────────────────────────────
var app = UI.createApp({
  title: '時鐘',
  width: 360,
  height: 480,
  style: {
    background: bg,
    color: '#ecf4ff',
    border: '1px solid rgba(118,185,255,0.26)',
    boxShadow: '0 24px 60px rgba(0,0,0,0.34)',
  },
  state: {},
  render: function (s, self) {
    var swBtnStyle = {
      padding: '10px 20px',
      borderRadius: '10px',
      fontSize: '14px',
      fontWeight: 'bold',
    };

    return UI.column([
      // ── Clock ──
      UI.card([
        UI.column([
          UI.text(getTimeString(), {
            fontSize: '48px',
            fontWeight: '200',
            textAlign: 'center',
            color: '#67b8ff',
            letterSpacing: '4px',
          }, 'time-display'),
          UI.text(getDateString(), {
            fontSize: '14px',
            textAlign: 'center',
            color: 'rgba(216,232,255,0.6)',
          }, 'date-display'),
        ], { alignItems: 'center', gap: '6px' }),
      ], { padding: '24px' }),

      UI.separator(),

      // ── Stopwatch ──
      UI.card([
        UI.column([
          UI.subheading('碼錶', { textAlign: 'center' }),
          UI.text(formatStopwatch(swElapsed), {
            fontSize: '32px',
            fontWeight: '300',
            textAlign: 'center',
            color: '#6be68a',
            fontFamily: "'Consolas', 'Monaco', monospace",
          }, 'sw-display'),
          UI.row([
            UI.button('開始', {
              id: 'sw-toggle',
              onClick: function () {
                if (swRunning) {
                  swElapsed += Date.now() - swStart;
                  swRunning = false;
                  self.patch('sw-toggle', { text: '開始' });
                } else {
                  swStart = Date.now();
                  swRunning = true;
                  self.patch('sw-toggle', { text: '暫停' });
                }
              },
              style: Object.assign({}, swBtnStyle, {
                background: 'linear-gradient(135deg, #4a7fff, #67b8ff)',
                color: '#05101c',
                flex: '1',
              }),
            }),
            UI.button('重置', {
              onClick: function () {
                swRunning = false;
                swElapsed = 0;
                swStart = 0;
                self.patch('sw-display', { text: formatStopwatch(0) });
                self.patch('sw-toggle', { text: '開始' });
              },
              style: Object.assign({}, swBtnStyle, {
                background: 'rgba(255,255,255,0.08)',
                color: '#d8e8ff',
                flex: '1',
              }),
            }),
          ], { justifyContent: 'center' }),
        ], { alignItems: 'center', gap: '10px' }),
      ], { padding: '16px' }),
    ], { padding: '18px', gap: '10px' });
  },
});

// ── Clock tick (runs on host-side timer) ─────────────────────
setInterval(function () {
  app.patch('time-display', { text: getTimeString() });
  app.patch('date-display', { text: getDateString() });
  if (swRunning) {
    var now = Date.now();
    var total = swElapsed + (now - swStart);
    app.patch('sw-display', { text: formatStopwatch(total) });
  }
}, 200);
