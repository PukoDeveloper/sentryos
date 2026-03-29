// styles.js — 共用樣式定義，透過 imports() 載入
exports.colors = {
  primary: '#67b8ff',
  success: '#6be68a',
  warning: '#ffb74d',
  error: '#ff5555',
  info: '#6dd5ff',
  text: '#d8e8ff',
  textMuted: 'rgba(216, 232, 255, 0.5)',
  textDim: 'rgba(216, 232, 255, 0.4)',
  background: 'rgba(0, 0, 0, 0.2)',
  cardBg: 'rgba(255, 255, 255, 0.08)',
};

exports.buttonStyle = function (bg, color) {
  return {
    background: bg,
    color: color,
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '12px',
  };
};

exports.notifButton = function (accent) {
  var r = parseInt(accent.slice(1, 3), 16);
  var g = parseInt(accent.slice(3, 5), 16);
  var b = parseInt(accent.slice(5, 7), 16);
  return {
    background: 'rgba(' + r + ',' + g + ',' + b + ',0.15)',
    color: accent,
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '12px',
  };
};
