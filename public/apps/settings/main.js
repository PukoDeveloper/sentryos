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
var startMenuWidth = 380;
var startMenuHeight = 480;
var currentPage = 'home';

// 摺疊狀態
var collapsed = {
  wallpaper: false,
  accent: true,
  taskbar: true,
  startmenu: true,
};

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
  if (typeof d.startMenuWidth === 'number') startMenuWidth = d.startMenuWidth;
  if (typeof d.startMenuHeight === 'number') startMenuHeight = d.startMenuHeight;
}

// ── Styles ───────────────────────────────────────────────────
var sidebarStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  width: '170px',
  minWidth: '170px',
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
  display: 'flex',
  flexDirection: 'column',
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

var collapsibleHeaderStyle = function (isOpen) {
  return {
    padding: '12px 16px',
    borderRadius: isOpen ? '10px 10px 0 0' : '10px',
    fontSize: '13px',
    fontWeight: 'bold',
    background: isOpen ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
    color: '#d8e8ff',
    textAlign: 'left',
    border: '1px solid rgba(255,255,255,0.06)',
  };
};

var collapsibleBodyStyle = {
  padding: '14px 16px',
  borderRadius: '0 0 10px 10px',
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderTop: 'none',
};

var stubPageStyle = {
  fontSize: '13px',
  color: 'rgba(216,232,255,0.35)',
  padding: '40px 0',
  textAlign: 'center',
};

// ── Helpers ──────────────────────────────────────────────────
function buildThemeObject() {
  return {
    wallpaper: wallpapers[selectedWallpaper].value,
    tint: 'none',
    accentPrimary: accents[selectedAccent].primary,
    accentSecondary: accents[selectedAccent].secondary,
    taskbarOpacity: opacitySteps[selectedOpacity].value,
    startMenuWidth: startMenuWidth,
    startMenuHeight: startMenuHeight,
  };
}

function liveApply() {
  settingsApi.applyTheme(buildThemeObject());
}

function collapsible(key, title, renderBody, self) {
  var isOpen = !collapsed[key];
  var arrow = isOpen ? '▼' : '▶';
  var header = UI.button(arrow + '  ' + title, {
    onClick: function () {
      collapsed[key] = !collapsed[key];
      self.rerender();
    },
    style: collapsibleHeaderStyle(isOpen),
  });

  if (!isOpen) {
    return UI.column([header], { gap: '0' });
  }

  return UI.column([
    header,
    UI.box([renderBody(self)], collapsibleBodyStyle),
  ], { gap: '0' });
}

// ── Navigation items ─────────────────────────────────────────
var pages = [
  { id: 'home',         label: '🏠  首頁' },
  { id: 'appearance',   label: '🎨  外觀' },
  { id: 'notifications',label: '🔔  通知' },
  { id: 'apps',         label: '📦  應用程式' },
  { id: 'storage',      label: '💾  儲存空間' },
  { id: 'network',      label: '🌐  網路' },
  { id: 'security',     label: '🔒  安全性' },
  { id: 'accessibility',label: '♿  無障礙' },
  { id: 'about',        label: 'ℹ️  關於' },
];

// ── Page renderers ───────────────────────────────────────────
function renderHomePage(self) {
  var info = settingsApi.sysinfo();
  var data = (info.success && info.data) ? info.data : {};

  return UI.column([
    UI.heading('SentryOS', { color: '#ecf4ff' }),
    UI.text('系統設定', { fontSize: '13px', color: 'rgba(216,232,255,0.45)' }),

    UI.box([], { height: '8px' }),

    UI.text('快速導航', sectionTitle),
    UI.box([
      quickNavBtn('🎨', '外觀', 'appearance', self),
      quickNavBtn('🔔', '通知', 'notifications', self),
      quickNavBtn('📦', '應用程式', 'apps', self),
      quickNavBtn('💾', '儲存空間', 'storage', self),
      quickNavBtn('🔒', '安全性', 'security', self),
      quickNavBtn('ℹ️', '關於', 'about', self),
    ], { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }),

    UI.box([], { height: '8px' }),

    UI.text('系統概覽', sectionTitle),
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
        UI.text('應用程式總數', infoLabel),
        UI.text(data.apps !== undefined ? String(data.apps) : '—', infoValue),
      ], infoRowStyle),
    ], { gap: '4px' }),
  ], { gap: '8px', flex: '1' });
}

function quickNavBtn(icon, label, pageId, self) {
  return UI.button(icon + '\n' + label, {
    onClick: function () {
      currentPage = pageId;
      self.rerender();
    },
    style: {
      padding: '14px 8px',
      borderRadius: '10px',
      fontSize: '13px',
      background: 'rgba(255,255,255,0.04)',
      color: '#d8e8ff',
      textAlign: 'center',
      border: '1px solid rgba(255,255,255,0.06)',
      whiteSpace: 'pre-line',
      lineHeight: '1.6',
    },
  });
}

// ── 外觀頁面（合併所有樣式設定）────────────────────────────
function renderAppearancePage(self) {
  return UI.column([
    UI.heading('外觀', { color: '#ecf4ff' }),
    UI.text('自訂桌面背景、主題色、工作列與開始選單樣式', { fontSize: '13px', color: 'rgba(216,232,255,0.45)' }),

    UI.box([], { height: '4px' }),
    collapsible('wallpaper', '桌面背景', renderWallpaperSection, self),
    collapsible('accent', '主題色', renderAccentSection, self),
    collapsible('taskbar', '工作列透明度', renderTaskbarSection, self),
    collapsible('startmenu', '開始選單大小', renderStartMenuSection, self),

    UI.box([], { height: '8px' }),
    renderSaveRow(self),
  ], { gap: '8px', flex: '1' });
}

function renderWallpaperSection(self) {
  var items = [];
  for (var i = 0; i < wallpapers.length; i++) {
    (function (idx) {
      var s = idx === selectedWallpaper ? swatchSelected() : swatchBase();
      s.background = wallpapers[idx].value;
      items.push(UI.button(wallpapers[idx].name, {
        onClick: function () {
          selectedWallpaper = idx;
          liveApply();
          self.rerender();
        },
        style: s,
      }));
    })(i);
  }
  return UI.box(items, swatchGrid);
}

function renderAccentSection(self) {
  var items = [];
  for (var i = 0; i < accents.length; i++) {
    (function (idx) {
      var s = idx === selectedAccent ? swatchSelected() : swatchBase();
      s.background = 'linear-gradient(135deg, ' + accents[idx].primary + ', ' + accents[idx].secondary + ')';
      items.push(UI.button(accents[idx].name, {
        onClick: function () {
          selectedAccent = idx;
          liveApply();
          self.rerender();
        },
        style: s,
      }));
    })(i);
  }
  return UI.box(items, swatchGrid);
}

function renderTaskbarSection(self) {
  var items = [];
  for (var i = 0; i < opacitySteps.length; i++) {
    (function (idx) {
      var s = idx === selectedOpacity ? swatchSelected() : swatchBase();
      s.background = 'rgba(7, 12, 20, ' + opacitySteps[idx].value + ')';
      s.aspectRatio = '2.5';
      items.push(UI.button(opacitySteps[idx].name, {
        onClick: function () {
          selectedOpacity = idx;
          liveApply();
          self.rerender();
        },
        style: s,
      }));
    })(i);
  }
  return UI.box(items, { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' });
}

function renderStartMenuSection(self) {
  var widthSteps = [280, 320, 380, 440, 520, 640];
  var heightSteps = [300, 400, 480, 560, 640, 800];

  function findIndex(arr, val) {
    var closest = 0;
    for (var i = 0; i < arr.length; i++) {
      if (Math.abs(arr[i] - val) < Math.abs(arr[closest] - val)) closest = i;
    }
    return closest;
  }

  var selW = findIndex(widthSteps, startMenuWidth);
  var selH = findIndex(heightSteps, startMenuHeight);

  var widthItems = [];
  for (var i = 0; i < widthSteps.length; i++) {
    (function (idx) {
      var s = idx === selW ? swatchSelected() : swatchBase();
      s.background = 'rgba(255,255,255,0.06)';
      s.aspectRatio = '2';
      widthItems.push(UI.button(widthSteps[idx] + 'px', {
        onClick: function () {
          startMenuWidth = widthSteps[idx];
          liveApply();
          self.rerender();
        },
        style: s,
      }));
    })(i);
  }

  var heightItems = [];
  for (var i = 0; i < heightSteps.length; i++) {
    (function (idx) {
      var s = idx === selH ? swatchSelected() : swatchBase();
      s.background = 'rgba(255,255,255,0.06)';
      s.aspectRatio = '2';
      heightItems.push(UI.button(heightSteps[idx] + 'px', {
        onClick: function () {
          startMenuHeight = heightSteps[idx];
          liveApply();
          self.rerender();
        },
        style: s,
      }));
    })(i);
  }

  return UI.column([
    UI.text('寬度', sectionTitle),
    UI.box(widthItems, { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }),
    UI.box([], { height: '6px' }),
    UI.text('高度', sectionTitle),
    UI.box(heightItems, { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }),
  ], { gap: '6px' });
}

function renderSaveRow(self) {
  return UI.row([
    UI.button('重設為預設', {
      id: 'btn-reset',
      onClick: function () {
        selectedWallpaper = 0;
        selectedAccent = 0;
        selectedOpacity = 2;
        startMenuWidth = 380;
        startMenuHeight = 480;
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

// ── 通知頁面（預留）─────────────────────────────────────────
function renderNotificationsPage(self) {
  return UI.column([
    UI.heading('通知', { color: '#ecf4ff' }),
    UI.text('管理應用程式通知的顯示方式與行為', { fontSize: '13px', color: 'rgba(216,232,255,0.45)' }),
    UI.box([], { height: '8px' }),
    stubSection('通知偏好', '設定通知顯示時長、最大數量、音效等。'),
    stubSection('勿擾模式', '啟用後暫時停止所有非系統性通知。'),
    stubSection('應用程式通知權限', '個別管理每個應用程式的通知權限。'),
  ], { gap: '8px', flex: '1' });
}

// ── 應用程式頁面（預留）──────────────────────────────────────
function renderAppsPage(self) {
  return UI.column([
    UI.heading('應用程式', { color: '#ecf4ff' }),
    UI.text('瀏覽與管理已安裝的應用程式', { fontSize: '13px', color: 'rgba(216,232,255,0.45)' }),
    UI.box([], { height: '8px' }),
    stubSection('已安裝應用程式', '檢視所有已安裝的應用程式，查看版本、權限與使用狀態。'),
    stubSection('預設應用程式', '設定特定檔案類型或操作的預設處理程式。'),
    stubSection('自動啟動', '管理系統啟動時自動執行的應用程式與服務。'),
  ], { gap: '8px', flex: '1' });
}

// ── 儲存空間頁面（預留）──────────────────────────────────────
function renderStoragePage(self) {
  return UI.column([
    UI.heading('儲存空間', { color: '#ecf4ff' }),
    UI.text('檢視與管理各層儲存空間的使用狀況', { fontSize: '13px', color: 'rgba(216,232,255,0.45)' }),
    UI.box([], { height: '8px' }),
    stubSection('空間總覽', '查看 sys / app / user / cache 各層剩餘空間與容量。'),
    stubSection('容量配置', '調整各儲存層的最大容量分配。'),
    stubSection('清除快取', '釋放 cache 層中的過期或無用資料。'),
  ], { gap: '8px', flex: '1' });
}

// ── 網路頁面（預留）──────────────────────────────────────────
function renderNetworkPage(self) {
  return UI.column([
    UI.heading('網路', { color: '#ecf4ff' }),
    UI.text('網路連線與通訊設定', { fontSize: '13px', color: 'rgba(216,232,255,0.45)' }),
    UI.box([], { height: '8px' }),
    stubSection('連線狀態', '顯示目前的網路介面狀態與位址資訊。'),
    stubSection('IPC 通道', '管理程序間通訊(IPC)的連線與授權。'),
  ], { gap: '8px', flex: '1' });
}

// ── 安全性頁面（預留）────────────────────────────────────────
function renderSecurityPage(self) {
  return UI.column([
    UI.heading('安全性', { color: '#ecf4ff' }),
    UI.text('保護系統安全與資料存取', { fontSize: '13px', color: 'rgba(216,232,255,0.45)' }),
    UI.box([], { height: '8px' }),
    stubSection('權限管理', '檢視與調整各應用程式的權限配置。'),
    stubSection('使用者帳戶', '管理使用者資料與登入方式。'),
    stubSection('安全性記錄', '檢視權限拒絕、異常操作等安全事件記錄。'),
  ], { gap: '8px', flex: '1' });
}

// ── 無障礙頁面（預留）────────────────────────────────────────
function renderAccessibilityPage(self) {
  return UI.column([
    UI.heading('無障礙', { color: '#ecf4ff' }),
    UI.text('調整系統以適合不同使用需求', { fontSize: '13px', color: 'rgba(216,232,255,0.45)' }),
    UI.box([], { height: '8px' }),
    stubSection('顯示設定', '調整字體大小、對比度、動畫效果。'),
    stubSection('鍵盤快捷鍵', '檢視與自訂鍵盤快捷鍵。'),
    stubSection('螢幕閱讀器', '啟用語音提示與螢幕閱讀支援。'),
  ], { gap: '8px', flex: '1' });
}

// ── 關於頁面 ─────────────────────────────────────────────────
function renderAboutPage(self) {
  var info = settingsApi.sysinfo();
  var data = (info.success && info.data) ? info.data : {};

  return UI.column([
    UI.heading('關於 SentryOS', { color: '#ecf4ff' }),
    UI.text('系統資訊與版本', { fontSize: '13px', color: 'rgba(216,232,255,0.45)' }),

    UI.box([], { height: '8px' }),

    UI.column([
      UI.box([
        UI.text('系統名稱', infoLabel),
        UI.text('SentryOS', infoValue),
      ], infoRowStyle),
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
  ], { gap: '8px', flex: '1' });
}

// ── Stub 區塊 ────────────────────────────────────────────────
function stubSection(title, desc) {
  return UI.card([
    UI.row([
      UI.column([
        UI.text(title, { fontSize: '14px', fontWeight: 'bold', color: '#d8e8ff' }),
        UI.text(desc, { fontSize: '12px', color: 'rgba(216,232,255,0.4)', lineHeight: '1.5' }),
      ], { flex: '1', gap: '4px' }),
      UI.badge('即將推出', {
        fontSize: '10px',
        padding: '3px 10px',
        borderRadius: '6px',
        background: 'rgba(103,184,255,0.12)',
        color: '#67b8ff',
        alignSelf: 'flex-start',
      }),
    ], { alignItems: 'flex-start' }),
  ]);
}

// ── Render ───────────────────────────────────────────────────
var app = UI.createApp({
  title: '系統設定',
  width: 700,
  height: 560,
  resizable: true,
  style: {
    background: 'linear-gradient(180deg, rgba(10,14,20,0.97), rgba(6,10,14,0.94))',
    color: '#ecf4ff',
    border: '1px solid rgba(118,185,255,0.26)',
    boxShadow: '0 24px 60px rgba(0,0,0,0.34)',
  },
  state: {},
  render: function (s, self) {
    // Build sidebar nav
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

    // Route to page
    var content;
    switch (currentPage) {
      case 'appearance':    content = renderAppearancePage(self); break;
      case 'notifications': content = renderNotificationsPage(self); break;
      case 'apps':          content = renderAppsPage(self); break;
      case 'storage':       content = renderStoragePage(self); break;
      case 'network':       content = renderNetworkPage(self); break;
      case 'security':      content = renderSecurityPage(self); break;
      case 'accessibility': content = renderAccessibilityPage(self); break;
      case 'about':         content = renderAboutPage(self); break;
      default:              content = renderHomePage(self); break;
    }

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
