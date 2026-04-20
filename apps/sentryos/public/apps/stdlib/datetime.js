// ── SentryOS DateTime Library (stdlib-datetime) ──────────────
// 日期與時間格式化工具。
// 載入方式: OS.env.loadLibrary('stdlib/DateTime')
//
// 功能：
//   DateUtils.now()                    — 取得目前 Date 物件
//   DateUtils.timestamp()              — 取得目前 Unix 時間戳（毫秒）
//   DateUtils.fromTimestamp(ms)        — 從毫秒時間戳建立 Date
//   DateUtils.parseISO(str)            — 解析 ISO 8601 字串為 Date
//   DateUtils.format(date, pattern)    — 格式化 Date（YYYY MM DD HH mm ss SSS）
//   DateUtils.toRelative(date)         — 相對時間（"3 分鐘前"）
//   DateUtils.formatDuration(ms)       — 格式化時長（"1h 23m 45s"）
//   DateUtils.startOf(date, unit)      — 取得 day/month/year 的起始 Date
//   DateUtils.add(date, amount, unit)  — 加上指定時間量
//   DateUtils.diff(a, b, unit)         — 計算兩個 Date 的差值
//
// CLI 指令：
//   date             — 顯示目前日期時間
//   timestamp        — 顯示目前 Unix 時間戳（ms）
//   duration <ms>    — 將毫秒格式化為可讀時長

(function () {

  // ── Core ──────────────────────────────────────────────────

  /** 取得目前 Date 物件。 */
  function now() {
    return new Date();
  }

  /** 取得目前 Unix 毫秒時間戳。 */
  function timestamp() {
    return Date.now();
  }

  /** 從毫秒時間戳建立 Date。 */
  function fromTimestamp(ms) {
    return new Date(Number(ms));
  }

  /** 解析 ISO 8601 字串（如 "2024-01-15T10:30:00Z"）為 Date。 */
  function parseISO(str) {
    return new Date(String(str));
  }

  // ── Formatting ────────────────────────────────────────────

  /**
   * 格式化 Date 為字串。
   * 支援的佔位符（大小寫敏感）：
   *   YYYY  四位年份        MM  兩位月份（01–12）   DD  兩位日（01–31）
   *   HH    兩位小時（00–23）mm  兩位分鐘（00–59）   ss  兩位秒（00–59）
   *   SSS   三位毫秒        dow 星期幾（如 Mon）     doy 全名星期（如 Monday）
   *   mon   月份縮寫        month 月份全名
   *
   * @param {Date|number} date
   * @param {string} [pattern='YYYY-MM-DD HH:mm:ss']
   * @returns {string}
   */
  function format(date, pattern) {
    if (!(date instanceof Date)) date = new Date(Number(date));
    if (isNaN(date.getTime())) return 'Invalid Date';
    pattern = pattern || 'YYYY-MM-DD HH:mm:ss';

    function pad2(n) { return n < 10 ? '0' + n : String(n); }
    function pad3(n) { return n < 100 ? (n < 10 ? '00' + n : '0' + n) : String(n); }

    var DAYS_SHORT  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var DAYS_FULL   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var MONTHS_FULL  = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];

    return pattern
      .replace('YYYY',  String(date.getFullYear()))
      .replace('MM',    pad2(date.getMonth() + 1))
      .replace('DD',    pad2(date.getDate()))
      .replace('HH',    pad2(date.getHours()))
      .replace('mm',    pad2(date.getMinutes()))
      .replace('ss',    pad2(date.getSeconds()))
      .replace('SSS',   pad3(date.getMilliseconds()))
      .replace('month', MONTHS_FULL[date.getMonth()])
      .replace('mon',   MONTHS_SHORT[date.getMonth()])
      .replace('doy',   DAYS_FULL[date.getDay()])
      .replace('dow',   DAYS_SHORT[date.getDay()]);
  }

  /**
   * 將日期轉換為相對時間描述（基於目前時間）。
   * 例："just now", "3 分鐘前", "2 小時前", "昨天"
   * @param {Date|number} date
   * @param {string} [lang='zh-TW'] 'zh-TW' 或 'en'
   * @returns {string}
   */
  function toRelative(date, lang) {
    if (!(date instanceof Date)) date = new Date(Number(date));
    lang = lang || 'zh-TW';
    var diffMs = Date.now() - date.getTime();
    var diffSec = Math.round(diffMs / 1000);
    var diffMin = Math.round(diffSec / 60);
    var diffHour = Math.round(diffMin / 60);
    var diffDay = Math.round(diffHour / 24);

    var future = diffMs < 0;
    diffSec = Math.abs(diffSec);
    diffMin = Math.abs(diffMin);
    diffHour = Math.abs(diffHour);
    diffDay = Math.abs(diffDay);

    if (lang === 'en') {
      var when;
      if (diffSec < 10)        when = 'just now';
      else if (diffSec < 60)   when = diffSec + ' seconds';
      else if (diffMin < 60)   when = diffMin + ' minute' + (diffMin > 1 ? 's' : '');
      else if (diffHour < 24)  when = diffHour + ' hour' + (diffHour > 1 ? 's' : '');
      else if (diffDay < 7)    when = diffDay + ' day' + (diffDay > 1 ? 's' : '');
      else if (diffDay < 30)   when = Math.round(diffDay / 7) + ' week' + (Math.round(diffDay / 7) > 1 ? 's' : '');
      else if (diffDay < 365)  when = Math.round(diffDay / 30) + ' month' + (Math.round(diffDay / 30) > 1 ? 's' : '');
      else                     when = Math.round(diffDay / 365) + ' year' + (Math.round(diffDay / 365) > 1 ? 's' : '');
      if (when === 'just now') return when;
      return future ? 'in ' + when : when + ' ago';
    }

    // zh-TW
    if (diffSec < 10)        return '剛剛';
    if (diffSec < 60)        return diffSec + ' 秒' + (future ? '後' : '前');
    if (diffMin < 60)        return diffMin + ' 分鐘' + (future ? '後' : '前');
    if (diffHour < 24)       return diffHour + ' 小時' + (future ? '後' : '前');
    if (diffDay === 1)       return future ? '明天' : '昨天';
    if (diffDay < 7)         return diffDay + ' 天' + (future ? '後' : '前');
    if (diffDay < 30)        return Math.round(diffDay / 7) + ' 週' + (future ? '後' : '前');
    if (diffDay < 365)       return Math.round(diffDay / 30) + ' 個月' + (future ? '後' : '前');
    return Math.round(diffDay / 365) + ' 年' + (future ? '後' : '前');
  }

  /**
   * 將毫秒時長格式化為可讀字串。
   * formatDuration(3661000) → "1h 1m 1s"
   * formatDuration(90)      → "90ms"
   * @param {number} ms
   * @returns {string}
   */
  function formatDuration(ms) {
    ms = Math.abs(Number(ms));
    if (ms < 1000) return ms + 'ms';
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    var h = Math.floor(m / 60);
    var d = Math.floor(h / 24);
    s = s % 60;
    m = m % 60;
    h = h % 24;
    var parts = [];
    if (d > 0) parts.push(d + 'd');
    if (h > 0) parts.push(h + 'h');
    if (m > 0) parts.push(m + 'm');
    if (s > 0) parts.push(s + 's');
    return parts.length > 0 ? parts.join(' ') : '0s';
  }

  // ── Arithmetic ────────────────────────────────────────────

  /**
   * 取得日期的「起始」時間點（歸零時分秒等）。
   * @param {Date|number} date
   * @param {'day'|'month'|'year'|'hour'|'minute'} unit
   * @returns {Date}
   */
  function startOf(date, unit) {
    var d = new Date(date instanceof Date ? date.getTime() : Number(date));
    switch (unit) {
      case 'year':   d.setMonth(0); /* fall through */
      case 'month':  d.setDate(1); /* fall through */
      case 'day':    d.setHours(0, 0, 0, 0); break;
      case 'hour':   d.setMinutes(0, 0, 0); break;
      case 'minute': d.setSeconds(0, 0); break;
    }
    return d;
  }

  /**
   * 在 date 上加上 amount 個 unit，回傳新的 Date。
   * @param {Date|number} date
   * @param {number} amount
   * @param {'ms'|'seconds'|'minutes'|'hours'|'days'|'months'|'years'} unit
   * @returns {Date}
   */
  function add(date, amount, unit) {
    var d = new Date(date instanceof Date ? date.getTime() : Number(date));
    switch (unit) {
      case 'ms':      d.setMilliseconds(d.getMilliseconds() + amount); break;
      case 'seconds': d.setSeconds(d.getSeconds() + amount); break;
      case 'minutes': d.setMinutes(d.getMinutes() + amount); break;
      case 'hours':   d.setHours(d.getHours() + amount); break;
      case 'days':    d.setDate(d.getDate() + amount); break;
      case 'months':  d.setMonth(d.getMonth() + amount); break;
      case 'years':   d.setFullYear(d.getFullYear() + amount); break;
    }
    return d;
  }

  /**
   * 計算兩個日期之間的差值。
   * @param {Date|number} a
   * @param {Date|number} b
   * @param {'ms'|'seconds'|'minutes'|'hours'|'days'} [unit='ms']
   * @returns {number} a - b (可為負值)
   */
  function diff(a, b, unit) {
    var ta = a instanceof Date ? a.getTime() : Number(a);
    var tb = b instanceof Date ? b.getTime() : Number(b);
    var ms = ta - tb;
    switch (unit) {
      case 'seconds': return ms / 1000;
      case 'minutes': return ms / 60000;
      case 'hours':   return ms / 3600000;
      case 'days':    return ms / 86400000;
      default:        return ms;
    }
  }

  // ── Export ────────────────────────────────────────────────

  globalThis.DateUtils = {
    now: now,
    timestamp: timestamp,
    fromTimestamp: fromTimestamp,
    parseISO: parseISO,
    format: format,
    toRelative: toRelative,
    formatDuration: formatDuration,
    startOf: startOf,
    add: add,
    diff: diff,
  };

  // ── CLI command handlers ─────────────────────────────────

  globalThis.__commands = globalThis.__commands || {};

  globalThis.__commands.date = function(args) {
    var pattern = args.length > 0 ? args.join(' ') : 'YYYY-MM-DD HH:mm:ss';
    return format(now(), pattern);
  };

  globalThis.__commands.timestamp = function() {
    return String(timestamp());
  };

  globalThis.__commands.duration = function(args) {
    var ms = parseFloat(args[0]);
    if (isNaN(ms)) return 'Usage: duration <milliseconds>';
    return formatDuration(ms);
  };

})();
