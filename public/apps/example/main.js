var styles = imports('styles.js');

var _loadResult = envApi.loadLibrary('stdlib/UI Utils');
if (!_loadResult.success) {
  throw new Error('Failed to load UI library: ' + (_loadResult.error || 'Unknown'));
}

var app = UI.createApp({
  title: 'Example App',
  width: 560,
  height: 520,
  style: {
    background: 'linear-gradient(180deg, rgba(10, 14, 20, 0.96), rgba(6, 10, 14, 0.92))',
    color: '#ecf4ff',
    border: '1px solid rgba(118, 185, 255, 0.26)',
    boxShadow: '0 24px 60px rgba(0, 0, 0, 0.34)',
  },
  state: {
    counter: 0,
    progress: 30,
  },
  render: function (state, self) {
    return UI.column([
      UI.heading('SentryOS Example App', { color: '#d8e8ff' }),
      UI.card([
        UI.text('This demonstrates the SentryOS patch-based UI.\nComponents: input, checkbox, select, progress, separator.\nAll updates are targeted — no full re-render.', {
          fontSize: '13px',
          color: 'rgba(216, 232, 255, 0.7)',
        }),
      ]),

      // ── Counter ──────────────────────────────────────────
      UI.card([
        UI.column([
          UI.text('Counter: ' + state.counter, {
            fontSize: '24px',
            color: '#67b8ff',
          }, 'counter-text'),
          UI.row([
            UI.button('+1', {
              onClick: function () {
                self.state.counter++;
                self.patch('counter-text', { text: 'Counter: ' + self.state.counter });
              },
              style: {
                background: 'linear-gradient(135deg, #4a7fff, #67b8ff)',
                color: '#05101c',
                padding: '10px 20px',
                borderRadius: '10px',
                fontSize: '14px',
              },
            }),
            UI.button('Reset', {
              onClick: function () {
                self.state.counter = 0;
                self.patch('counter-text', { text: 'Counter: 0' });
              },
              style: {
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#d8e8ff',
                padding: '10px 20px',
                borderRadius: '10px',
                fontSize: '14px',
              },
            }),
          ]),
        ], { gap: '10px', alignItems: 'center' }),
      ]),

      UI.separator(),

      // ── Interactive Controls ─────────────────────────────
      UI.card([
        UI.column([
          UI.subheading('Interactive Controls'),
          UI.input({
            id: 'text-input',
            placeholder: 'Type something… (supports IME)',
            onChange: function (v) {
              self.patch('input-echo', { text: v ? 'You typed: ' + v : 'Start typing above…' });
            },
            onSubmit: function (v) {
              notificationApi.notify('Submitted', v, 'info');
            },
          }),
          UI.text('Start typing above…', {
            fontSize: '12px',
            color: 'rgba(216, 232, 255, 0.5)',
          }, 'input-echo'),
          UI.row([
            UI.checkbox({
              id: 'dark-mode-cb',
              checked: true,
              label: 'Dark Mode',
              onChange: function (v) {
                // checkbox state managed by native DOM
              },
            }),
            UI.select({
              id: 'notif-type',
              options: [
                { value: 'info', label: 'Info' },
                { value: 'success', label: 'Success' },
                { value: 'warning', label: 'Warning' },
                { value: 'error', label: 'Error' },
              ],
              value: 'info',
              onChange: function (v) {
                // select state managed by native DOM
              },
            }),
          ], { alignItems: 'center' }),
        ], { gap: '10px' }),
      ]),

      // ── Progress ─────────────────────────────────────────
      UI.card([
        UI.column([
          UI.subheading('Progress'),
          UI.progress(state.progress, {
            color: state.progress >= 80 ? '#6be68a' : '#67b8ff',
            id: 'progress-bar',
          }),
          UI.row([
            UI.button('−10', {
              onClick: function () {
                self.state.progress = Math.max(0, self.state.progress - 10);
                var p = self.state.progress;
                self.patch('progress-bar', { value: p, color: p >= 80 ? '#6be68a' : '#67b8ff' });
                self.patch('progress-text', { text: p + '%' });
              },
              style: { padding: '6px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.08)', color: '#d8e8ff', fontSize: '12px' },
            }),
            UI.text(state.progress + '%', {
              fontSize: '13px',
              color: '#67b8ff',
              minWidth: '40px',
              textAlign: 'center',
            }, 'progress-text'),
            UI.button('+10', {
              onClick: function () {
                self.state.progress = Math.min(100, self.state.progress + 10);
                var p = self.state.progress;
                self.patch('progress-bar', { value: p, color: p >= 80 ? '#6be68a' : '#67b8ff' });
                self.patch('progress-text', { text: p + '%' });
              },
              style: { padding: '6px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.08)', color: '#d8e8ff', fontSize: '12px' },
            }),
          ], { alignItems: 'center', justifyContent: 'center' }),
        ], { gap: '8px' }),
      ]),

      // ── Notifications ────────────────────────────────────
      UI.card([
        UI.column([
          UI.subheading('Notifications'),
          UI.row([
            UI.button('Info', {
              onClick: function () { notificationApi.notify('Hello!', 'This is an info notification.', 'info'); },
              style: styles.notifButton(styles.colors.info),
            }),
            UI.button('Success', {
              onClick: function () { notificationApi.notify('Done', 'Operation completed successfully.', 'success'); },
              style: styles.notifButton(styles.colors.success),
            }),
            UI.button('Warning', {
              onClick: function () { notificationApi.notify('Caution', 'Something needs your attention.', 'warning'); },
              style: styles.notifButton(styles.colors.warning),
            }),
            UI.button('Error', {
              onClick: function () { notificationApi.notify('Error', 'Something went wrong!', 'error'); },
              style: styles.notifButton(styles.colors.error),
            }),
          ]),
        ], { gap: '8px', alignItems: 'center' }),
      ]),

      // Footer
      ui.panel([
        ui.label('PID: ' + processApi.pid + '  |  Type: ' + processApi.type, {
          fontSize: '11px',
          color: styles.colors.textDim,
        }),
      ], {
        padding: '8px 12px',
        borderRadius: '8px',
        background: styles.colors.background,
      }),
    ], { padding: '18px' });
  },
});
