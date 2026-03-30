var _loadResult = envApi.loadLibrary('stdlib/UI Utils');
if (!_loadResult.success) {
  throw new Error('Failed to load UI library: ' + (_loadResult.error || 'Unknown'));
}

// ── Presets ──────────────────────────────────────────────────
var wallpapers = [
  { name: '深海藍',   value: 'linear-gradient(135deg, #08111f 0%, #12344d 52%, #27698f 100%)' },
  { name: '極光綠',   value: 'linear-gradient(135deg, #0a1628 0%, #0d3b2e 50%, #1a7a5a 100%)' },
  { name: '暮光紫',   value: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' },
  { name: '日落橙',   value: 'linear-gradient(135deg, #1a0a00 0%, #4a1a08 40%, #a8430a 100%)' },
  { name: '午夜黑',   value: 'linear-gradient(135deg, #050505 0%, #111111 50%, #1a1a2e 100%)' },
  { name: '玫瑰金',   value: 'linear-gradient(135deg, #1a0c14 0%, #3d1c2e 50%, #8b4560 100%)' },
  { name: '北極光',   value: 'linear-gradient(135deg, #020111 0%, #1b2735 40%, #090a0f 70%)' },
  { name: '銀河',     value: 'linear-gradient(135deg, #0d0221 0%, #150540 40%, #261447 70%, #0d0221 100%)' },
];

var accents = [
  { name: '天藍',     primary: '#6dd5ff', secondary: '#3f8efc' },
  { name: '翠綠',     primary: '#6be68a', secondary: '#22c55e' },
  { name: '紫羅蘭',   primary: '#c084fc', secondary: '#8b5cf6' },
  { name: '珊瑚橙',   primary: '#fb923c', secondary: '#f97316' },
  { name: '玫瑰粉',   primary: '#fb7185', secondary: '#e11d48' },
  { name: '金黃',     primary: '#fbbf24', secondary: '#d97706' },
  { name: '冰白',     primary: '#e2e8f0', secondary: '#94a3b8' },
  { name: '霓虹青',   primary: '#22d3ee', secondary: '#06b6d4' },
];

var opacitySteps = [
  { name: '透明',   value: 0.3 },
  { name: '半透明', value: 0.5 },
  { name: '預設',   value: 0.64 },
  { name: '深色',   value: 0.8 },
  { name: '不透明', value: 0.95 },
];

// ── State ────────────────────────────────────────────────────
var selectedWallpaper = 0;
var selectedAccent = 0;
var selectedOpacity = 2;
var currentPage = 'home';

// Load saved settings
var saved = settingsApi.loadSavedTheme();
if (saved.success && saved.data) {
  var d = saved.data;
  for (var i = 0; i < wallpapers.length; i++) {
    if (wallpapers[i].value === d.wallpaper) { selectedWallpaper = i; break; }
  }
  for (var i = 0; i < accents.length; i++) {
    if (accents[i].primary === d.accentPrimary) { selectedAccent = i; break; }
  }
  for (var i = 0; i < opacitySteps.length; i++) {
    if (opacitySteps[i].value === d.taskbarOpacity) { selectedOpacity = i; break; }
  }
}

// ── Styles ───────────────────────────────────────────────────
var sidebarStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  width: '160px',
  minWidth: '160px',
  padding: '14px 10px',
  borderRight: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.02)',
};

function navBtnStyle(active) {
  return {
    padding: '10px 14px',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: active ? 'bold' : 'normal',
    background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
    color: active ? '#f4f7fb' : 'rgba(216,232,255,0.6)',
    textAlign: 'left',
  };
}

var contentStyle = {
  flex: '1',
  padding: '20px',
  overflow: 'auto',
  minWidth: '0',
};

var sectionTitle = {
  fontSize: '13px',
  fontWeight: 'bold',
  color: 'rgba(216,232,255,0.55)',
  textTransform: 'uppercase',
  letterSpacing: '1px',
};

var swatchGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: '8px',
};

function swatchBase() {
  return {
    width: '100%',
    aspectRatio: '1.6',
    borderRadius: '10px',
    border: '2px solid transparent',
    fontSize: '11px',
    fontWeight: 'bold',
    color: '#f4f7fb',
    textAlign: 'center',
  };
}

function swatchSelected() {
  var s = swatchBase();
  s.border = '2px solid rgba(255,255,255,0.7)';
  s.boxShadow = '0 0 12px rgba(255,255,255,0.2)';
  return s;
}

var infoRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '10px 14px',
  borderRadius: '8px',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.05)',
};

var infoLabel = {
  fontSize: '13px',
  color: 'rgba(216,232,255,0.55)',
};

var infoValue = {
  fontSize: '13px',
  fontWeight: 'bold',
  color: '#ecf4ff',
};

// ── Helpers ──────────────────────────────────────────────────
function buildThemeObject() {
  return {
    wallpaper: wallpapers[selectedWallpaper].value,
    tint: 'none',
    accentPrimary: accents[selectedAccent].primary,
    accentSecondary: accents[selectedAccent].secondary,
    taskbarOpacity: opacitySteps[selectedOpacity].value,
  };
}

function liveApply() {
  settingsApi.applyTheme(buildThemeObject());
}

// ── Navigation items ─────────────────────────────────────────
var pages = [
  { id: 'home',      label: '首頁' },
  { id: 'wallpaper', label: '桌面背景' },
  { id: 'accent',    label: '主題色' },
  { id: 'taskbar',   label: '工作列' },
];

// ── Page renderers ───────────────────────────────────────────
function renderHomePage(self) {
  var info = settingsApi.sysinfo();
  var data = (info.success && info.data) ? info.data : {};

  return UI.column([
    UI.heading('SentryOS', { color: '#ecf4ff' }),
    UI.text('系統設定', { fontSize: '13px', color: 'rgba(216,232,255,0.45)' }),

    UI.box([], { height: '8px' }),

    UI.text('系統資訊', sectionTitle),

    UI.column([
      UI.box([
        UI.text('執行時間', infoLabel),
        UI.text(data.uptime || '—', infoValue),
      ], infoRowStyle),
      UI.box([
        UI.text('處理程序', infoLabel),
        UI.text(data.processes ? (data.processes.running + ' / ' + data.processes.total) : '—', infoValue),
      ], infoRowStyle),
      UI.box([
        UI.text('視窗數量', infoLabel),
        UI.text(data.windows !== undefined ? String(data.windows) : '—', infoValue),
      ], infoRowStyle),
      UI.box([
        UI.text('已載入程式庫', infoLabel),
        UI.text(data.libraries !== undefined ? String(data.libraries) : '—', infoValue),
      ], infoRowStyle),
      UI.box([
        UI.text('已註冊指令', infoLabel),
        UI.text(data.commands !== undefined ? String(data.commands) : '—', infoValue),
      ], infoRowStyle),
      UI.box([
        UI.text('應用程式總數', infoLabel),
        UI.text(data.apps !== undefined ? String(data.apps) : '—', infoValue),
      ], infoRowStyle),
    ], { gap: '4px' }),

    UI.box([], { height: '8px' }),

    UI.text('目前主題', sectionTitle),
    UI.column([
      UI.box([
        UI.text('背景', infoLabel),
        UI.text(wallpapers[selectedWallpaper].name, infoValue),
      ], infoRowStyle),
      UI.box([
        UI.text('主題色', infoLabel),
        UI.text(accents[selectedAccent].name, infoValue),
      ], infoRowStyle),
      UI.box([
        UI.text('工作列透明度', infoLabel),
        UI.text(opacitySteps[selectedOpacity].name, infoValue),
      ], infoRowStyle),
    ], { gap: '4px' }),

  ], { gap: '8px' });
}

function renderWallpaperPage(self) {
  var items = [];
  for (var i = 0; i < wallpapers.length; i++) {
    (function (idx) {
      var s = idx === selectedWallpaper ? swatchSelected() : swatchBase();
      s.background = wallpapers[idx].value;
      items.push(UI.button(wallpapers[idx].name, {
        id: 'wp-' + idx,
        onClick: function () {
          selectedWallpaper = idx;
          liveApply();
          self.rerender();
        },
        style: s,
      }));
    })(i);
  }

  return UI.column([
    UI.heading('桌面背景', { color: '#ecf4ff' }),
    UI.text('選擇桌面背景漸層樣式', { fontSize: '13px', color: 'rgba(216,232,255,0.45)' }),
    UI.box([], { height: '4px' }),
    UI.box(items, swatchGrid, 'wp-grid'),
    UI.box([], { height: '8px' }),
    renderSaveRow(self),
  ], { gap: '8px' });
}

function renderAccentPage(self) {
  var items = [];
  for (var i = 0; i < accents.length; i++) {
    (function (idx) {
      var s = idx === selectedAccent ? swatchSelected() : swatchBase();
      s.background = 'linear-gradient(135deg, ' + accents[idx].primary + ', ' + accents[idx].secondary + ')';
      items.push(UI.button(accents[idx].name, {
        id: 'ac-' + idx,
        onClick: function () {
          selectedAccent = idx;
          liveApply();
          self.rerender();
        },
        style: s,
      }));
    })(i);
  }

  return UI.column([
    UI.heading('主題色', { color: '#ecf4ff' }),
    UI.text('選擇系統強調色', { fontSize: '13px', color: 'rgba(216,232,255,0.45)' }),
    UI.box([], { height: '4px' }),
    UI.box(items, swatchGrid, 'ac-grid'),
    UI.box([], { height: '8px' }),
    renderSaveRow(self),
  ], { gap: '8px' });
}

function renderTaskbarPage(self) {
  var items = [];
  for (var i = 0; i < opacitySteps.length; i++) {
    (function (idx) {
      var s = idx === selectedOpacity ? swatchSelected() : swatchBase();
      s.background = 'rgba(7, 12, 20, ' + opacitySteps[idx].value + ')';
      s.aspectRatio = '2.5';
      items.push(UI.button(opacitySteps[idx].name, {
        id: 'op-' + idx,
        onClick: function () {
          selectedOpacity = idx;
          liveApply();
          self.rerender();
        },
        style: s,
      }));
    })(i);
  }

  return UI.column([
    UI.heading('工作列', { color: '#ecf4ff' }),
    UI.text('調整工作列透明度', { fontSize: '13px', color: 'rgba(216,232,255,0.45)' }),
    UI.box([], { height: '4px' }),
    UI.box(items, { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }, 'op-grid'),
    UI.box([], { height: '8px' }),
    renderSaveRow(self),
  ], { gap: '8px' });
}

function renderSaveRow(self) {
  return UI.row([
    UI.button('重設為預設', {
      id: 'btn-reset',
      onClick: function () {
        selectedWallpaper = 0;
        selectedAccent = 0;
        selectedOpacity = 2;
        liveApply();
        self.rerender();
      },
      style: {
        padding: '10px 18px',
        borderRadius: '10px',
        fontSize: '13px',
        background: 'rgba(255,255,255,0.06)',
        color: 'rgba(216,232,255,0.7)',
        flex: '1',
        textAlign: 'center',
      },
    }),
    UI.button('儲存設定', {
      id: 'btn-save',
      onClick: function () {
        var result = settingsApi.saveTheme(buildThemeObject());
        if (result.success) {
          self.patch('btn-save', { text: '✓ 已儲存' });
          setTimeout(function () {
            self.patch('btn-save', { text: '儲存設定' });
          }, 1500);
        }
      },
      style: {
        padding: '10px 18px',
        borderRadius: '10px',
        fontSize: '13px',
        fontWeight: 'bold',
        background: 'linear-gradient(135deg, #4a7fff, #67b8ff)',
        color: '#05101c',
        flex: '1',
        textAlign: 'center',
      },
    }),
  ]);
}

// ── Render ───────────────────────────────────────────────────
var app = UI.createApp({
  title: '系統設定',
  width: 640,
  height: 520,
  style: {
    background: 'linear-gradient(180deg, rgba(10,14,20,0.97), rgba(6,10,14,0.94))',
    color: '#ecf4ff',
    border: '1px solid rgba(118,185,255,0.26)',
    boxShadow: '0 24px 60px rgba(0,0,0,0.34)',
  },
  state: {},
  render: function (s, self) {
    // Build sidebar nav buttons
    var navItems = [];
    for (var i = 0; i < pages.length; i++) {
      (function (page) {
        navItems.push(UI.button(page.label, {
          id: 'nav-' + page.id,
          onClick: function () {
            currentPage = page.id;
            self.rerender();
          },
          style: navBtnStyle(currentPage === page.id),
        }));
      })(pages[i]);
    }

    // Build page content
    var content;
    if (currentPage === 'wallpaper') content = renderWallpaperPage(self);
    else if (currentPage === 'accent') content = renderAccentPage(self);
    else if (currentPage === 'taskbar') content = renderTaskbarPage(self);
    else content = renderHomePage(self);

    return UI.row([
      UI.box(navItems, sidebarStyle, 'sidebar'),
      UI.box([content], contentStyle, 'content-area'),
    ], {
      height: '100%',
      gap: '0',
      alignItems: 'stretch',
    });
  },
});
