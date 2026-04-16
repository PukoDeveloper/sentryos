// ── SentryOS Task Manager ─────────────────────────────────
var win = OS.ui.createWindow({
  title: '工作管理員',
  width: 680,
  height: 540,
  useDefaultFrame: true,
  resizable: true,
  style: {
    background: 'linear-gradient(180deg, rgba(8, 12, 20, 0.97), rgba(4, 8, 14, 0.95))',
    color: '#d8e8ff',
    border: '1px solid rgba(74, 144, 217, 0.22)',
    boxShadow: '0 24px 60px rgba(0, 0, 0, 0.4)',
  }
});

var activeTab = 'processes';
var selectedPid = null;

// ── Style constants ─────────────────────────────────────────
var S = {
  card: { padding: '14px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' },
  cardHighlight: { padding: '14px', borderRadius: '10px', background: 'rgba(74,144,217,0.08)', border: '1px solid rgba(74,144,217,0.15)' },
  dimText: { fontSize: '11px', color: 'rgba(216,232,255,0.4)' },
  subText: { fontSize: '12px', color: 'rgba(216,232,255,0.6)' },
  sectionTitle: { fontSize: '13px', color: '#67b8ff', fontWeight: 'bold', marginBottom: '4px' },
  statusBar: { padding: '6px 10px', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 'auto' },
  tag: function(color) { return { fontSize: '11px', color: color, background: 'rgba(255,255,255,0.05)', borderRadius: '4px', padding: '2px 8px' }; },
};

// ── Helpers ──────────────────────────────────────────────────
function getProcesses() {
  var result = OS.listProcesses();
  if (!result.success) return [];
  return result.data;
}

function statusLabel(s) {
  if (s === 'running') return '\u25cf 執行中';
  if (s === 'suspended') return '\u25a0 已暫停';
  return '\u25cb 已停止';
}

function statusColor(s) {
  if (s === 'running') return '#6be68a';
  if (s === 'suspended') return '#f5c542';
  return '#ff6b6b';
}

function typeColor(t) {
  if (t === 'Service') return '#a78bfa';
  if (t === 'Window') return '#67b8ff';
  if (t === 'Console') return '#f5c542';
  return '#6be68a';
}

function pct(used, cap) {
  if (cap <= 0) return 0;
  return Math.round(used / cap * 100);
}

function barColor(ratio) {
  if (ratio >= 90) return '#ff6b6b';
  if (ratio >= 70) return '#f5c542';
  return '#6be68a';
}

function fmtMs(ms) {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return ms.toFixed(1) + 'ms';
  return (ms / 1000).toFixed(2) + 's';
}

function fmtUptime(ms) {
  var s = Math.floor(ms / 1000);
  var m = Math.floor(s / 60); s = s % 60;
  var h = Math.floor(m / 60); m = m % 60;
  if (h > 0) return h + 'h ' + m + 'm ' + s + 's';
  if (m > 0) return m + 'm ' + s + 's';
  return s + 's';
}

function fmtTime(ts) {
  var d = new Date(ts);
  var hh = ('0' + d.getHours()).slice(-2);
  var mm = ('0' + d.getMinutes()).slice(-2);
  var ss = ('0' + d.getSeconds()).slice(-2);
  return hh + ':' + mm + ':' + ss;
}

function progressBar(ratio, color, height) {
  return OS.ui.panel([
    OS.ui.panel([], {
      width: Math.max(ratio, 2) + '%',
      height: '100%',
      background: color,
      borderRadius: '3px',
      transition: 'width 300ms ease',
    })
  ], {
    height: height || '6px',
    background: 'rgba(255,255,255,0.06)',
    borderRadius: '3px',
    overflow: 'hidden',
  });
}

function truncate(s, len) {
  if (!s) return '';
  return s.length > len ? s.substring(0, len) + '…' : s;
}

// ── Tab bar ─────────────────────────────────────────────────
function renderTabBar() {
  var tabs = [
    { id: 'processes', label: '程序' },
    { id: 'events',    label: '事件' },
    { id: 'api',       label: 'API' },
    { id: 'permissions', label: '權限' },
    { id: 'performance', label: '效能' },
    { id: 'storage',   label: '儲存' },
  ];
  var items = [];
  for (var i = 0; i < tabs.length; i++) {
    var t = tabs[i];
    var isActive = t.id === activeTab;
    items.push(OS.ui.button(t.label, {
      fontSize: '12px',
      padding: '7px 14px',
      borderRadius: '8px 8px 0 0',
      background: isActive ? 'rgba(74,144,217,0.2)' : 'rgba(255,255,255,0.04)',
      color: isActive ? '#67b8ff' : 'rgba(216,232,255,0.5)',
      borderBottom: isActive ? '2px solid #67b8ff' : '2px solid transparent',
      fontWeight: isActive ? 'bold' : 'normal',
    }, 'tab-' + t.id));
  }
  var refreshBtn = OS.ui.button('⟳', {
    fontSize: '14px',
    padding: '5px 10px',
    borderRadius: '8px',
    background: 'rgba(74,144,217,0.12)',
    color: '#67b8ff',
    border: '1px solid rgba(74,144,217,0.2)',
    marginLeft: 'auto',
    lineHeight: '1',
  }, 'action-refresh');
  items.push(refreshBtn);
  return OS.ui.stack(items, {
    flexDirection: 'row',
    gap: '0',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    flexWrap: 'wrap',
    alignItems: 'center',
  });
}

// ── Processes Tab ───────────────────────────────────────────
function renderProcessesTab() {
  var processes = getProcesses();
  var rows = [];
  for (var i = 0; i < processes.length; i++) {
    var p = processes[i];
    var isSel = p.pid === selectedPid;
    var rowBg = isSel ? 'rgba(74,144,217,0.18)' : 'rgba(255,255,255,0.02)';
    var borderCol = isSel ? 'rgba(74,144,217,0.35)' : 'rgba(255,255,255,0.06)';

    rows.push(OS.ui.panel([
      OS.ui.stack([
        OS.ui.stack([
          OS.ui.label(p.appName + ' (' + p.appDefId + ')', { fontSize: '13px', color: '#d8e8ff', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
          OS.ui.stack([
            OS.ui.label(p.type, S.tag(typeColor(p.type))),
            OS.ui.label(statusLabel(p.status), { fontSize: '11px', color: statusColor(p.status) }),
          ], { flexDirection: 'row', gap: '8px', alignItems: 'center' }),
        ], { gap: '4px', flex: '1' }),
        OS.ui.stack([
          OS.ui.label('PID ' + p.pid, S.dimText),
          OS.ui.button(isSel ? '已選擇' : '選擇', {
            fontSize: '11px', padding: '4px 12px', borderRadius: '6px',
            background: isSel ? 'rgba(74,144,217,0.4)' : 'rgba(255,255,255,0.06)',
            color: '#d8e8ff', border: '1px solid rgba(255,255,255,0.08)',
          }, 'select-' + p.pid),
        ], { gap: '4px', alignItems: 'flex-end' }),
      ], { flexDirection: 'row', alignItems: 'center', gap: '10px' }),
    ], { padding: '10px 12px', background: rowBg, borderRadius: '8px', border: '1px solid ' + borderCol }));
  }

  if (rows.length === 0) {
    rows.push(OS.ui.label('沒有執行中的程序', { fontSize: '13px', color: 'rgba(216,232,255,0.4)', textAlign: 'center', padding: '24px' }));
  }

  var actions = OS.ui.stack([
    OS.ui.button('終止程序', {
      fontSize: '12px', padding: '6px 16px', borderRadius: '8px',
      background: selectedPid ? 'rgba(255,80,80,0.25)' : 'rgba(255,255,255,0.04)',
      color: selectedPid ? '#ff8a8a' : 'rgba(216,232,255,0.3)',
      border: '1px solid ' + (selectedPid ? 'rgba(255,80,80,0.3)' : 'rgba(255,255,255,0.06)'),
    }, 'action-terminate'),
  ], { flexDirection: 'row', gap: '8px', padding: '8px 0' });

  var runCount = 0;
  var svcCount = 0;
  for (var j = 0; j < processes.length; j++) {
    if (processes[j].status === 'running') runCount++;
    if (processes[j].type === 'Service') svcCount++;
  }
  var statusText = '程序: ' + processes.length + '  |  執行中: ' + runCount + '  |  服務: ' + svcCount;
  if (selectedPid) statusText += '  |  已選擇 PID ' + selectedPid;
  var statusBar = OS.ui.panel([
    OS.ui.label(statusText, S.dimText)
  ], S.statusBar);

  return OS.ui.stack([
    actions,
    OS.ui.stack(rows, { gap: '6px', flex: '1', overflow: 'auto' }),
    statusBar,
  ], { gap: '4px', flexDirection: 'column', flex: '1' });
}

// ── Events Tab ──────────────────────────────────────────────
function renderEventsTab() {
  var statsResult = OS.monitor.eventStats();
  var recentResult = OS.monitor.recentEvents(30);
  if (!statsResult.success) {
    return OS.ui.label('無法取得事件資訊', { fontSize: '13px', color: '#ff6b6b', textAlign: 'center', padding: '24px' });
  }
  var stats = statsResult.data;
  var recent = recentResult.success ? recentResult.data : [];

  // Summary
  var totalEmits = 0;
  var totalSubs = 0;
  for (var i = 0; i < stats.length; i++) {
    totalEmits += stats[i].emitCount;
    totalSubs += stats[i].subscriberCount;
  }
  var summary = OS.ui.panel([
    OS.ui.stack([
      OS.ui.stack([
        OS.ui.label('事件類型', S.subText),
        OS.ui.label('' + stats.length, { fontSize: '22px', color: '#67b8ff', fontWeight: 'bold' }),
      ], { alignItems: 'center' }),
      OS.ui.stack([
        OS.ui.label('總發射次數', S.subText),
        OS.ui.label('' + totalEmits, { fontSize: '22px', color: '#a78bfa', fontWeight: 'bold' }),
      ], { alignItems: 'center' }),
      OS.ui.stack([
        OS.ui.label('活躍訂閱', S.subText),
        OS.ui.label('' + totalSubs, { fontSize: '22px', color: '#6be68a', fontWeight: 'bold' }),
      ], { alignItems: 'center' }),
    ], { flexDirection: 'row', justifyContent: 'space-around' }),
  ], S.cardHighlight);

  // Event stats table
  var rows = [];
  var maxCount = stats.length > 0 ? stats[0].emitCount : 1;
  for (var i = 0; i < stats.length; i++) {
    var ev = stats[i];
    var ratio = maxCount > 0 ? Math.round(ev.emitCount / maxCount * 100) : 0;
    rows.push(OS.ui.panel([
      OS.ui.stack([
        OS.ui.stack([
          OS.ui.label(ev.event, { fontSize: '12px', color: '#d8e8ff', fontWeight: 'bold' }),
          progressBar(ratio, '#67b8ff', '4px'),
        ], { flex: '1', gap: '4px' }),
        OS.ui.stack([
          OS.ui.label('' + ev.emitCount + ' 次', { fontSize: '12px', color: '#a78bfa', textAlign: 'right' }),
          OS.ui.label(ev.subscriberCount + ' 訂閱', { fontSize: '11px', color: 'rgba(216,232,255,0.5)', textAlign: 'right' }),
        ], { alignItems: 'flex-end', gap: '2px', minWidth: '80px' }),
      ], { flexDirection: 'row', alignItems: 'center', gap: '12px' }),
    ], { padding: '8px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.02)' }));
  }
  if (rows.length === 0) {
    rows.push(OS.ui.label('尚無事件紀錄', { fontSize: '12px', color: 'rgba(216,232,255,0.4)', textAlign: 'center', padding: '12px' }));
  }

  // Recent events timeline
  var timeline = [];
  timeline.push(OS.ui.label('最近事件', S.sectionTitle));
  for (var i = 0; i < recent.length && i < 15; i++) {
    var r = recent[i];
    timeline.push(OS.ui.stack([
      OS.ui.label(fmtTime(r.timestamp), { fontSize: '11px', color: 'rgba(216,232,255,0.35)', fontFamily: 'monospace', minWidth: '64px' }),
      OS.ui.label(r.event, { fontSize: '11px', color: '#67b8ff', flex: '1' }),
      OS.ui.label(truncate(r.emitterAppId, 20), { fontSize: '11px', color: 'rgba(216,232,255,0.35)' }),
    ], { flexDirection: 'row', gap: '8px', padding: '3px 0' }));
  }
  if (timeline.length === 1) {
    timeline.push(OS.ui.label('尚無紀錄', { fontSize: '11px', color: 'rgba(216,232,255,0.35)', padding: '8px 0' }));
  }

  return OS.ui.stack([
    summary,
    OS.ui.label('事件統計', S.sectionTitle),
    OS.ui.stack(rows, { gap: '4px', flex: '1', overflow: 'auto' }),
    OS.ui.stack(timeline, { gap: '0' }),
    OS.ui.panel([OS.ui.label('共 ' + stats.length + ' 種事件', S.dimText)], S.statusBar),
  ], { gap: '8px', flexDirection: 'column', flex: '1', padding: '8px 0' });
}

// ── API Tab ─────────────────────────────────────────────────
function renderApiTab() {
  var statsResult = OS.monitor.apiStats();
  var recentResult = OS.monitor.recentApiCalls(30);
  if (!statsResult.success) {
    return OS.ui.label('無法取得 API 資訊', { fontSize: '13px', color: '#ff6b6b', textAlign: 'center', padding: '24px' });
  }
  var stats = statsResult.data;
  var recent = recentResult.success ? recentResult.data : [];

  // Summary
  var totalCalls = 0;
  var totalDuration = 0;
  for (var i = 0; i < stats.length; i++) {
    totalCalls += stats[i].callCount;
    totalDuration += stats[i].totalDuration;
  }
  var avgDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;
  var summary = OS.ui.panel([
    OS.ui.stack([
      OS.ui.stack([
        OS.ui.label('API 方法', S.subText),
        OS.ui.label('' + stats.length, { fontSize: '22px', color: '#67b8ff', fontWeight: 'bold' }),
      ], { alignItems: 'center' }),
      OS.ui.stack([
        OS.ui.label('總呼叫次數', S.subText),
        OS.ui.label('' + totalCalls, { fontSize: '22px', color: '#a78bfa', fontWeight: 'bold' }),
      ], { alignItems: 'center' }),
      OS.ui.stack([
        OS.ui.label('平均耗時', S.subText),
        OS.ui.label(fmtMs(avgDuration), { fontSize: '22px', color: '#f5c542', fontWeight: 'bold' }),
      ], { alignItems: 'center' }),
    ], { flexDirection: 'row', justifyContent: 'space-around' }),
  ], S.cardHighlight);

  // API stats table
  var rows = [];
  for (var i = 0; i < stats.length && i < 20; i++) {
    var a = stats[i];
    rows.push(OS.ui.panel([
      OS.ui.stack([
        OS.ui.stack([
          OS.ui.label(a.apiName + '.' + a.method, { fontSize: '12px', color: '#d8e8ff', fontWeight: 'bold', fontFamily: 'monospace' }),
        ], { flex: '1' }),
        OS.ui.stack([
          OS.ui.label('' + a.callCount + ' 次', { fontSize: '12px', color: '#a78bfa', textAlign: 'right' }),
          OS.ui.label('avg ' + fmtMs(a.avgDuration), { fontSize: '11px', color: '#f5c542', textAlign: 'right' }),
        ], { alignItems: 'flex-end', gap: '2px', minWidth: '100px' }),
      ], { flexDirection: 'row', alignItems: 'center', gap: '12px' }),
    ], { padding: '8px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.02)' }));
  }
  if (rows.length === 0) {
    rows.push(OS.ui.label('尚無 API 呼叫紀錄', { fontSize: '12px', color: 'rgba(216,232,255,0.4)', textAlign: 'center', padding: '12px' }));
  }

  // Recent API calls
  var timeline = [];
  timeline.push(OS.ui.label('最近呼叫', S.sectionTitle));
  for (var i = 0; i < recent.length && i < 15; i++) {
    var r = recent[i];
    var callColor = r.success ? '#6be68a' : '#ff6b6b';
    timeline.push(OS.ui.stack([
      OS.ui.label(fmtTime(r.timestamp), { fontSize: '11px', color: 'rgba(216,232,255,0.35)', fontFamily: 'monospace', minWidth: '64px' }),
      OS.ui.label(r.apiName + '.' + r.method, { fontSize: '11px', color: '#67b8ff', flex: '1', fontFamily: 'monospace' }),
      OS.ui.label(fmtMs(r.duration), { fontSize: '11px', color: callColor, minWidth: '50px', textAlign: 'right' }),
    ], { flexDirection: 'row', gap: '8px', padding: '3px 0' }));
  }
  if (timeline.length === 1) {
    timeline.push(OS.ui.label('尚無紀錄', { fontSize: '11px', color: 'rgba(216,232,255,0.35)', padding: '8px 0' }));
  }

  return OS.ui.stack([
    summary,
    OS.ui.label('API 呼叫排行', S.sectionTitle),
    OS.ui.stack(rows, { gap: '4px', flex: '1', overflow: 'auto' }),
    OS.ui.stack(timeline, { gap: '0' }),
    OS.ui.panel([OS.ui.label('共 ' + stats.length + ' 個 API 方法  |  ' + totalCalls + ' 次呼叫', S.dimText)], S.statusBar),
  ], { gap: '8px', flexDirection: 'column', flex: '1', padding: '8px 0' });
}

// ── Permissions Tab ─────────────────────────────────────────
function renderPermissionsTab() {
  var result = OS.monitor.permissionStats();
  if (!result.success) {
    return OS.ui.label('無法取得權限資訊', { fontSize: '13px', color: '#ff6b6b', textAlign: 'center', padding: '24px' });
  }
  var data = result.data;
  var denyRate = data.totalChecks > 0 ? Math.round(data.totalDenied / data.totalChecks * 100) : 0;

  // 建立 processAppId → appDefId 查找表
  var appIdToName = {};
  var histResult = OS.monitor.processHistory();
  if (histResult.success && histResult.data) {
    for (var hi = 0; hi < histResult.data.length; hi++) {
      var h = histResult.data[hi];
      appIdToName[h.processAppId] = h.appDefId;
    }
  }

  // Summary
  var summary = OS.ui.panel([
    OS.ui.stack([
      OS.ui.stack([
        OS.ui.label('總檢查次數', S.subText),
        OS.ui.label('' + data.totalChecks, { fontSize: '22px', color: '#67b8ff', fontWeight: 'bold' }),
      ], { alignItems: 'center' }),
      OS.ui.stack([
        OS.ui.label('拒絕次數', S.subText),
        OS.ui.label('' + data.totalDenied, { fontSize: '22px', color: '#ff6b6b', fontWeight: 'bold' }),
      ], { alignItems: 'center' }),
      OS.ui.stack([
        OS.ui.label('拒絕率', S.subText),
        OS.ui.label(denyRate + '%', { fontSize: '22px', color: denyRate > 20 ? '#ff6b6b' : '#6be68a', fontWeight: 'bold' }),
      ], { alignItems: 'center' }),
    ], { flexDirection: 'row', justifyContent: 'space-around' }),
  ], S.cardHighlight);

  // Per-app breakdown
  var appRows = [];
  appRows.push(OS.ui.label('依應用程式', S.sectionTitle));
  var appKeys = [];
  for (var k in data.byApp) { appKeys.push(k); }
  // Sort by checks desc
  appKeys.sort(function(a, b) { return data.byApp[b].checks - data.byApp[a].checks; });
  for (var i = 0; i < appKeys.length && i < 15; i++) {
    var appId = appKeys[i];
    var entry = data.byApp[appId];
    var appDenyRate = entry.checks > 0 ? Math.round(entry.denied / entry.checks * 100) : 0;
    var dColor = appDenyRate > 20 ? '#ff6b6b' : '#6be68a';

    // 顯示被拒絕的權限類型明細
    var deniedDetail = '';
    if (entry.deniedPermissions) {
      var dps = [];
      for (var dp in entry.deniedPermissions) { dps.push(dp + ' ×' + entry.deniedPermissions[dp]); }
      if (dps.length > 0) deniedDetail = dps.join(', ');
    }

    var displayName = appIdToName[appId] ? appIdToName[appId] : appId;

    var rowChildren = [
      OS.ui.stack([
        OS.ui.label(truncate(displayName, 28), { fontSize: '12px', color: '#d8e8ff', flex: '1', fontFamily: 'monospace' }),
        OS.ui.label('' + entry.checks + ' 次', { fontSize: '12px', color: '#a78bfa', minWidth: '60px', textAlign: 'right' }),
        OS.ui.label(entry.denied + ' 拒絕', { fontSize: '12px', color: dColor, minWidth: '60px', textAlign: 'right' }),
      ], { flexDirection: 'row', alignItems: 'center', gap: '8px' }),
    ];
    if (displayName !== appId) {
      rowChildren.push(
        OS.ui.label(truncate(appId, 40), { fontSize: '10px', color: 'rgba(216,232,255,0.3)', fontFamily: 'monospace' })
      );
    }
    if (deniedDetail) {
      rowChildren.push(
        OS.ui.label('⛔ ' + deniedDetail, { fontSize: '11px', color: '#ff8a8a', padding: '2px 0 0 0', fontFamily: 'monospace' })
      );
    }
    appRows.push(OS.ui.panel(rowChildren, { padding: '6px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.02)' }));
  }
  if (appKeys.length === 0) {
    appRows.push(OS.ui.label('尚無紀錄', { fontSize: '12px', color: 'rgba(216,232,255,0.4)', textAlign: 'center', padding: '12px' }));
  }

  // Per-permission breakdown
  var permRows = [];
  permRows.push(OS.ui.label('依權限類型', S.sectionTitle));
  var permKeys = [];
  for (var k in data.byPermission) { permKeys.push(k); }
  permKeys.sort(function(a, b) { return data.byPermission[b].checks - data.byPermission[a].checks; });
  for (var i = 0; i < permKeys.length && i < 15; i++) {
    var perm = permKeys[i];
    var pe = data.byPermission[perm];
    var pDenyRate = pe.checks > 0 ? Math.round(pe.denied / pe.checks * 100) : 0;
    var pdColor = pDenyRate > 20 ? '#ff6b6b' : '#6be68a';
    permRows.push(OS.ui.panel([
      OS.ui.stack([
        OS.ui.label(truncate(perm, 32), { fontSize: '11px', color: '#d8e8ff', flex: '1', fontFamily: 'monospace' }),
        OS.ui.label('' + pe.checks, { fontSize: '11px', color: '#a78bfa', minWidth: '40px', textAlign: 'right' }),
        OS.ui.label(pe.denied > 0 ? pe.denied + ' ✗' : '✓', { fontSize: '11px', color: pdColor, minWidth: '40px', textAlign: 'right' }),
      ], { flexDirection: 'row', alignItems: 'center', gap: '6px' }),
    ], { padding: '4px 12px', borderRadius: '4px', background: 'rgba(255,255,255,0.01)' }));
  }
  if (permKeys.length === 0) {
    permRows.push(OS.ui.label('尚無紀錄', { fontSize: '11px', color: 'rgba(216,232,255,0.35)', padding: '8px 0' }));
  }

  return OS.ui.stack([
    summary,
    OS.ui.stack(appRows, { gap: '4px', flex: '1', overflow: 'auto' }),
    OS.ui.stack(permRows, { gap: '2px', maxHeight: '160px', overflow: 'auto' }),
    OS.ui.panel([OS.ui.label('應用程式: ' + appKeys.length + '  |  權限類型: ' + permKeys.length, S.dimText)], S.statusBar),
  ], { gap: '8px', flexDirection: 'column', flex: '1', padding: '8px 0' });
}

// ── Performance Tab ─────────────────────────────────────────
function renderPerformanceTab() {
  var snapResult = OS.monitor.snapshot();
  if (!snapResult.success) {
    return OS.ui.label('無法取得效能資訊', { fontSize: '13px', color: '#ff6b6b', textAlign: 'center', padding: '24px' });
  }
  var snap = snapResult.data;
  var perf = snap.performance;
  var proc = snap.processes;

  // Summary cards
  var summary = OS.ui.panel([
    OS.ui.stack([
      OS.ui.stack([
        OS.ui.label('運行時間', S.subText),
        OS.ui.label(fmtUptime(snap.uptime), { fontSize: '20px', color: '#67b8ff', fontWeight: 'bold' }),
      ], { alignItems: 'center' }),
      OS.ui.stack([
        OS.ui.label('總執行次數', S.subText),
        OS.ui.label('' + perf.totalExecutions, { fontSize: '20px', color: '#a78bfa', fontWeight: 'bold' }),
      ], { alignItems: 'center' }),
      OS.ui.stack([
        OS.ui.label('平均執行時間', S.subText),
        OS.ui.label(fmtMs(perf.avgExecutionTime), { fontSize: '20px', color: '#f5c542', fontWeight: 'bold' }),
      ], { alignItems: 'center' }),
    ], { flexDirection: 'row', justifyContent: 'space-around' }),
  ], S.cardHighlight);

  // Process lifecycle overview
  var procCards = OS.ui.panel([
    OS.ui.stack([
      OS.ui.stack([
        OS.ui.label('已啟動', S.subText),
        OS.ui.label('' + proc.totalLaunched, { fontSize: '18px', color: '#6be68a', fontWeight: 'bold' }),
      ], { alignItems: 'center' }),
      OS.ui.stack([
        OS.ui.label('已終止', S.subText),
        OS.ui.label('' + proc.totalTerminated, { fontSize: '18px', color: '#ff6b6b', fontWeight: 'bold' }),
      ], { alignItems: 'center' }),
      OS.ui.stack([
        OS.ui.label('執行中', S.subText),
        OS.ui.label('' + proc.activeProcesses, { fontSize: '18px', color: '#67b8ff', fontWeight: 'bold' }),
      ], { alignItems: 'center' }),
    ], { flexDirection: 'row', justifyContent: 'space-around' }),
  ], S.card);

  // Per-app process stats
  var appRows = [];
  appRows.push(OS.ui.label('應用程式統計', S.sectionTitle));
  var appKeys = [];
  for (var k in proc.byApp) { appKeys.push(k); }
  appKeys.sort(function(a, b) { return proc.byApp[b].launched - proc.byApp[a].launched; });
  for (var i = 0; i < appKeys.length; i++) {
    var appId = appKeys[i];
    var ap = proc.byApp[appId];
    var active = ap.launched - ap.terminated;
    appRows.push(OS.ui.panel([
      OS.ui.stack([
        OS.ui.label(truncate(appId, 24), { fontSize: '12px', color: '#d8e8ff', flex: '1' }),
        OS.ui.label('啟動 ' + ap.launched, { fontSize: '11px', color: '#6be68a', minWidth: '50px', textAlign: 'right' }),
        OS.ui.label('終止 ' + ap.terminated, { fontSize: '11px', color: '#ff6b6b', minWidth: '50px', textAlign: 'right' }),
        OS.ui.label(active > 0 ? '●' + active : '', { fontSize: '11px', color: '#67b8ff', minWidth: '30px', textAlign: 'right' }),
      ], { flexDirection: 'row', alignItems: 'center', gap: '6px' }),
    ], { padding: '6px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.02)' }));
  }

  // Recent executions
  var recentRows = [];
  recentRows.push(OS.ui.label('最近執行紀錄', S.sectionTitle));
  var recExec = perf.recentExecutions;
  for (var i = 0; i < recExec.length && i < 12; i++) {
    var ex = recExec[i];
    var durColor = ex.duration > 50 ? '#ff6b6b' : ex.duration > 10 ? '#f5c542' : '#6be68a';
    recentRows.push(OS.ui.stack([
      OS.ui.label(fmtTime(ex.timestamp), { fontSize: '11px', color: 'rgba(216,232,255,0.35)', fontFamily: 'monospace', minWidth: '64px' }),
      OS.ui.label('PID ' + ex.pid, { fontSize: '11px', color: 'rgba(216,232,255,0.5)', minWidth: '50px' }),
      OS.ui.panel([
        OS.ui.panel([], {
          width: Math.min(Math.max(ex.duration / 100 * 100, 3), 100) + '%',
          height: '100%',
          background: durColor,
          borderRadius: '2px',
        })
      ], { height: '4px', flex: '1', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }),
      OS.ui.label(fmtMs(ex.duration), { fontSize: '11px', color: durColor, minWidth: '55px', textAlign: 'right', fontFamily: 'monospace' }),
    ], { flexDirection: 'row', gap: '8px', padding: '2px 0', alignItems: 'center' }));
  }

  // System totals
  var systemInfo = OS.ui.stack([
    OS.ui.label('事件: ' + snap.events.totalEmits + ' 次', S.dimText),
    OS.ui.label('API: ' + snap.api.totalCalls + ' 次', S.dimText),
    OS.ui.label('權限: ' + snap.permissions.totalChecks + ' 次 (' + snap.permissions.totalDenied + ' 拒絕)', S.dimText),
  ], { flexDirection: 'row', gap: '16px' });

  return OS.ui.stack([
    summary,
    procCards,
    OS.ui.stack(appRows, { gap: '4px' }),
    OS.ui.stack(recentRows, { gap: '0', flex: '1', overflow: 'auto' }),
    OS.ui.panel([systemInfo], S.statusBar),
  ], { gap: '8px', flexDirection: 'column', flex: '1', padding: '8px 0' });
}

// ── Storage Tab ─────────────────────────────────────────────
function renderStorageTab() {
  var usageResult = OS.storage.storageUsage();
  if (!usageResult.success) {
    return OS.ui.panel([
      OS.ui.label('無法取得儲存空間資訊: ' + (usageResult.error || '未知錯誤'), {
        fontSize: '13px', color: '#ff6b6b', padding: '24px', textAlign: 'center',
      })
    ], { flex: '1' });
  }

  var data = usageResult.data;
  var tiers = data.tiers;
  var tierNames = { sys: '系統', app: '應用程式', user: '使用者', cache: '快取' };
  var tierColors = { sys: '#a78bfa', app: '#67b8ff', user: '#6be68a', cache: '#f5c542' };
  var tierKeys = ['sys', 'app', 'user', 'cache'];

  var totalUsed = 0;
  var totalCap = data.totalCapacity;
  var cards = [];
  for (var i = 0; i < tierKeys.length; i++) {
    var k = tierKeys[i];
    var t = tiers[k];
    totalUsed += t.used;
    var ratio = pct(t.used, t.capacity);
    var bColor = barColor(ratio);

    cards.push(OS.ui.panel([
      OS.ui.stack([
        OS.ui.stack([
          OS.ui.label(tierNames[k], { fontSize: '13px', color: tierColors[k], fontWeight: 'bold' }),
          OS.ui.label(t.used + ' / ' + t.capacity + ' 筆', S.subText),
        ], { gap: '4px', flex: '1' }),
        OS.ui.label(ratio + '%', { fontSize: '20px', color: bColor, fontWeight: 'bold', width: '60px', textAlign: 'right' }),
      ], { flexDirection: 'row', alignItems: 'center', gap: '12px' }),
      progressBar(ratio, bColor, '6px'),
    ], S.card));
  }

  var totalRatio = pct(totalUsed, totalCap);
  var total = OS.ui.panel([
    OS.ui.stack([
      OS.ui.label('總容量', { fontSize: '13px', color: '#d8e8ff', fontWeight: 'bold' }),
      OS.ui.label(totalUsed + ' / ' + totalCap + ' 筆  (' + totalRatio + '%)', S.subText),
    ], { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }),
    progressBar(totalRatio, 'linear-gradient(90deg, #67b8ff, #a78bfa)', '8px'),
  ], S.cardHighlight);

  return OS.ui.stack([
    total,
    OS.ui.stack(cards, { gap: '8px' }),
    OS.ui.panel([
      OS.ui.label('資料項目總數: ' + data.totalEntries, S.dimText)
    ], S.statusBar),
  ], { gap: '10px', flexDirection: 'column', flex: '1', padding: '8px 0' });
}

// ── Main render ─────────────────────────────────────────────
function render() {
  if (!win.success) return;

  var tabContent;
  if (activeTab === 'events') {
    tabContent = renderEventsTab();
  } else if (activeTab === 'api') {
    tabContent = renderApiTab();
  } else if (activeTab === 'permissions') {
    tabContent = renderPermissionsTab();
  } else if (activeTab === 'performance') {
    tabContent = renderPerformanceTab();
  } else if (activeTab === 'storage') {
    tabContent = renderStorageTab();
  } else {
    tabContent = renderProcessesTab();
  }

  OS.ui.initialize(win.data, [
    OS.ui.stack([
      renderTabBar(),
      tabContent,
    ], {
      padding: '12px', gap: '6px', flexDirection: 'column', height: '100%',
    })
  ]);
}

render();

// Subscribe to process lifecycle events for auto-refresh
OS.subscribe('process.started');
OS.subscribe('process.stopped');

globalThis.onEvent = function() {
  if (activeTab === 'processes' || activeTab === 'performance') {
    render();
  }
};

globalThis.onWindowEvent = function(event) {
  var cid = event.controlId || '';

  // Tab switching
  if (cid.indexOf('tab-') === 0) {
    var tabId = cid.substring(4);
    if (tabId !== activeTab) {
      activeTab = tabId;
      render();
    }
    return;
  }

  // Process tab actions
  if (cid === 'action-refresh') {
    render();
    return;
  }

  if (cid === 'action-terminate' && selectedPid) {
    OS.system.terminateProcess(selectedPid);
    selectedPid = null;
    render();
    return;
  }

  // Select process row
  if (cid.indexOf('select-') === 0) {
    var pid = parseInt(cid.substring(7), 10);
    selectedPid = (selectedPid === pid) ? null : pid;
    render();
  }
};
