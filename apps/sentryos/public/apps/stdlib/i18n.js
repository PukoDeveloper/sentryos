// ── SentryOS i18n Library (stdlib-i18n) ─────────────────────
// 提供應用程式內的多語言翻譯支援。
// 載入方式: OS.env.loadLibrary('stdlib/i18n')
//
// 功能：
//   I18n.register(pack)        — 註冊翻譯包 { locale: { key: value } }
//   I18n.t(key, params?)       — 取得翻譯文字，支援 {{param}} 插值
//   I18n.tp(key, count, params?) — 複數化翻譯（key + '_plural' 為複數形）
//   I18n.has(key)              — 檢查鍵是否存在於目前語系
//   I18n.locale()              — 取得目前語系
//   I18n.setLocale(locale)     — 手動切換語系（不儲存到系統）
//   I18n.registeredLocales()   — 列出已載入語系
//   I18n.onChange(fn)          — 註冊語言變更回呼
//   I18n.off(fn)               — 移除語言變更回呼
//
// 自動行為：
//   載入時自動訂閱 language.changed 事件，
//   語系切換時會自動呼叫所有已註冊的回呼函式。
(function () {
  // ── 狀態 ──────────────────────────────────────────────────
  var currentLocale = 'zh-TW';
  var defaultLocale = 'zh-TW';
  var packs = {};          // locale → { key: value }
  var changeCallbacks = [];

  // 嘗試從環境變數取得目前語系
  if (typeof OS !== 'undefined' && OS.env && typeof OS.env.getVariable === 'function') {
    var langResult = OS.env.getVariable('SYSTEM_LANG');
    if (langResult && langResult.success && langResult.data) {
      currentLocale = langResult.data;
    }
  }

  // ── 翻譯包管理 ────────────────────────────────────────────

  /**
   * 註冊翻譯包。
   * @param {Object} pack - 格式 { 'zh-TW': { key: value }, 'en': { key: value } }
   */
  function register(pack) {
    if (!pack || typeof pack !== 'object') return;
    var locales = Object.keys(pack);
    for (var i = 0; i < locales.length; i++) {
      var locale = locales[i];
      var dict = pack[locale];
      if (!dict || typeof dict !== 'object') continue;
      if (!packs[locale]) {
        packs[locale] = {};
      }
      var keys = Object.keys(dict);
      for (var j = 0; j < keys.length; j++) {
        packs[locale][keys[j]] = dict[keys[j]];
      }
    }
  }

  /**
   * 內部插值工具函式（共用於 t 和 tp）。
   */
  function interpolate(text, params) {
    if (!params || typeof params !== 'object') return text;
    var paramKeys = Object.keys(params);
    for (var i = 0; i < paramKeys.length; i++) {
      var pk = paramKeys[i];
      var pattern = '{{' + pk + '}}';
      while (text.indexOf(pattern) !== -1) {
        text = text.replace(pattern, String(params[pk]));
      }
    }
    return text;
  }

  /**
   * 取得翻譯文字。
   * @param {string} key - 翻譯鍵
   * @param {Object} [params] - 插值參數，用於替換 {{param}}
   * @returns {string} 翻譯文字，找不到時回傳 key
   */
  function t(key, params) {
    var dict = packs[currentLocale];
    var text = (dict && dict[key]) || (packs[defaultLocale] && packs[defaultLocale][key]) || key;
    return interpolate(text, params);
  }

  /**
   * 複數化翻譯。count === 1 使用 key，否則使用 key + '_plural'。
   * 若 key_plural 不存在，回退到 key。
   * @param {string} key - 翻譯鍵
   * @param {number} count - 數量
   * @param {Object} [params] - 插值參數（count 自動加入為 {{count}}）
   * @returns {string}
   */
  function tp(key, count, params) {
    var resolvedKey = (count === 1) ? key : (key + '_plural');
    var dict = packs[currentLocale];
    var fallback = packs[defaultLocale];
    var text =
      (dict && dict[resolvedKey]) ||
      (fallback && fallback[resolvedKey]) ||
      (dict && dict[key]) ||
      (fallback && fallback[key]) ||
      key;
    var merged = { count: count };
    if (params && typeof params === 'object') {
      var paramKeys = Object.keys(params);
      for (var i = 0; i < paramKeys.length; i++) merged[paramKeys[i]] = params[paramKeys[i]];
    }
    return interpolate(text, merged);
  }

  /**
   * 確認目前語系（或預設語系）是否包含某個鍵。
   * @param {string} key
   * @returns {boolean}
   */
  function has(key) {
    var dict = packs[currentLocale];
    if (dict && key in dict) return true;
    var def = packs[defaultLocale];
    return !!(def && key in def);
  }

  /**
   * 取得目前語系。
   * @returns {string}
   */
  function locale() {
    return currentLocale;
  }

  /**
   * 手動切換語系（僅影響此 library 實例，不寫入系統設定）。
   * 若語系已是目前語系則無操作，否則觸發 onChange 回呼。
   * @param {string} newLocale
   */
  function setLocale(newLocale) {
    if (typeof newLocale !== 'string' || newLocale === currentLocale) return;
    var previous = currentLocale;
    currentLocale = newLocale;
    for (var i = 0; i < changeCallbacks.length; i++) {
      try {
        changeCallbacks[i]({ locale: newLocale, previous: previous });
      } catch (e) {
        // 忽略回呼錯誤
      }
    }
  }

  /**
   * 取得所有已註冊翻譯包的語系列表。
   * @returns {string[]}
   */
  function registeredLocales() {
    return Object.keys(packs);
  }

  /**
   * 註冊語言變更回呼。
   * @param {Function} fn - 回呼函式，接收 { locale, previous }
   */
  function onChange(fn) {
    if (typeof fn === 'function') {
      changeCallbacks.push(fn);
    }
  }

  /**
   * 移除語言變更回呼。
   * @param {Function} fn
   */
  function off(fn) {
    for (var i = changeCallbacks.length - 1; i >= 0; i--) {
      if (changeCallbacks[i] === fn) {
        changeCallbacks.splice(i, 1);
      }
    }
  }

  // ── 自動語言變更監聽 ──────────────────────────────────────

  function handleLanguageChanged(payload) {
    if (!payload || typeof payload !== 'object') return;
    var newLocale = payload.locale;
    if (typeof newLocale !== 'string' || newLocale === currentLocale) return;
    setLocale(newLocale);
  }

  // 訂閱語言變更事件
  if (typeof OS !== 'undefined' && OS.subscribe && typeof OS.subscribe === 'function') {
    OS.subscribe('language.changed');
  }

  // 攔截 onEvent，處理語言變更
  var originalOnEvent = globalThis.onEvent;
  globalThis.onEvent = function (channel, payload) {
    if (channel === 'language.changed') {
      handleLanguageChanged(payload);
    }
    // 繼續呼叫原始的 onEvent（如果有的話）
    if (typeof originalOnEvent === 'function') {
      originalOnEvent(channel, payload);
    }
  };

  // ── 匯出 ─────────────────────────────────────────────────

  globalThis.I18n = {
    register: register,
    t: t,
    tp: tp,
    has: has,
    locale: locale,
    setLocale: setLocale,
    registeredLocales: registeredLocales,
    onChange: onChange,
    off: off,
  };
})();
