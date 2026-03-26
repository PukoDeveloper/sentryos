var win = ui.createWindow({
  title: 'Example App',
  width: 520,
  height: 400,
  x: 96,
  y: 84,
  useDefaultFrame: true,
  style: {
    background: 'linear-gradient(180deg, rgba(10, 14, 20, 0.96), rgba(6, 10, 14, 0.92))',
    color: '#ecf4ff',
    border: '1px solid rgba(118, 185, 255, 0.26)',
    boxShadow: '0 24px 60px rgba(0, 0, 0, 0.34)',
  }
});

var counter = 0;

function render() {
  if (!win.success) return;
  ui.initialize(win.data, [
    ui.stack([
      ui.label('SentryOS Example App', {
        fontSize: '16px',
        color: '#d8e8ff',
      }),
      ui.panel([
        ui.label('This application demonstrates the SentryOS UI data-flow API.\nAll UI nodes are plain data rendered by the host window system.', {
          fontSize: '13px',
          color: 'rgba(216, 232, 255, 0.7)',
        })
      ], {
        padding: '12px',
        borderRadius: '12px',
        background: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }),
      ui.panel([
        ui.stack([
          ui.label('Counter: ' + counter, {
            fontSize: '24px',
            color: '#67b8ff',
          }),
          ui.stack([
            ui.button('+1', {
              background: 'linear-gradient(135deg, #4a7fff, #67b8ff)',
              color: '#05101c',
              padding: '10px 20px',
              borderRadius: '10px',
              fontSize: '14px',
            }, 'counter-increment'),
            ui.button('Reset', {
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#d8e8ff',
              padding: '10px 20px',
              borderRadius: '10px',
              fontSize: '14px',
            }, 'counter-reset'),
          ], {
            flexDirection: 'row',
            gap: '8px',
          }),
        ], {
          gap: '10px',
          alignItems: 'center',
        })
      ], {
        padding: '16px',
        borderRadius: '12px',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
      }),
      ui.panel([
        ui.label('PID: ' + processApi.pid + '  |  Type: ' + processApi.type, {
          fontSize: '11px',
          color: 'rgba(216, 232, 255, 0.4)',
        })
      ], {
        padding: '8px 12px',
        borderRadius: '8px',
        background: 'rgba(0, 0, 0, 0.2)',
      }),
      ui.panel([
        ui.stack([
          ui.label('Notifications', {
            fontSize: '13px',
            color: '#d8e8ff',
          }),
          ui.stack([
            ui.button('Info', {
              background: 'rgba(109, 213, 255, 0.15)',
              color: '#6dd5ff',
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '12px',
            }, 'notif-info'),
            ui.button('Success', {
              background: 'rgba(80, 250, 123, 0.15)',
              color: '#50fa7b',
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '12px',
            }, 'notif-success'),
            ui.button('Warning', {
              background: 'rgba(255, 183, 77, 0.15)',
              color: '#ffb74d',
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '12px',
            }, 'notif-warning'),
            ui.button('Error', {
              background: 'rgba(255, 85, 85, 0.15)',
              color: '#ff5555',
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '12px',
            }, 'notif-error'),
          ], {
            flexDirection: 'row',
            gap: '6px',
          }),
        ], {
          gap: '8px',
          alignItems: 'center',
        }),
      ], {
        padding: '14px',
        borderRadius: '12px',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
      }),
    ], {
      padding: '18px',
      gap: '14px',
      flexDirection: 'column',
    })
  ]);
}

render();

globalThis.onWindowEvent = function(event) {
  if (event.controlId === 'counter-increment') {
    counter++;
    render();
  }
  if (event.controlId === 'counter-reset') {
    counter = 0;
    render();
  }
  if (event.controlId === 'notif-info') {
    notificationApi.notify('Hello!', 'This is an info notification.', 'info');
  }
  if (event.controlId === 'notif-success') {
    notificationApi.notify('Done', 'Operation completed successfully.', 'success');
  }
  if (event.controlId === 'notif-warning') {
    notificationApi.notify('Caution', 'Something needs your attention.', 'warning');
  }
  if (event.controlId === 'notif-error') {
    notificationApi.notify('Error', 'Something went wrong!', 'error');
  }
};
