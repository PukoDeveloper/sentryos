// ── SentryOS i18n Library (stdlib-i18n) ─────────────────────
// 提供應用程式內的多語言翻譯支援。
// 載入方式: OS.env.loadLibrary('stdlib/i18n')
//
// 功能：
//   I18n.register(pack)   — 註冊翻譯包 { locale: { key: value } }
//   I18n.t(key, params?)  — 取得翻譯文字，支援 {{param}} 插值
//   I18n.locale()         — 取得目前語系
//   I18n.onChange(fn)     — 註冊語言變更回呼
//   I18n.off(fn)          — 移除語言變更回呼
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
   * 取得翻譯文字。
   * @param {string} key - 翻譯鍵
   * @param {Object} [params] - 插值參數，用於替換 {{param}}
   * @returns {string} 翻譯文字，找不到時回傳 key
   */
  function t(key, params) {
    var dict = packs[currentLocale];
    var text = (dict && dict[key]) || (packs[defaultLocale] && packs[defaultLocale][key]) || key;

    if (params && typeof params === 'object') {
      var paramKeys = Object.keys(params);
      for (var i = 0; i < paramKeys.length; i++) {
        var pk = paramKeys[i];
        // 使用正則全域替換 {{paramKey}}
        var pattern = '{{' + pk + '}}';
        while (text.indexOf(pattern) !== -1) {
          text = text.replace(pattern, String(params[pk]));
        }
      }
    }

    return text;
  }

  /**
   * 取得目前語系。
   * @returns {string}
   */
  function locale() {
    return currentLocale;
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

    var previous = currentLocale;
    currentLocale = newLocale;

    // 通知所有已註冊的回呼
    for (var i = 0; i < changeCallbacks.length; i++) {
      try {
        changeCallbacks[i]({ locale: newLocale, previous: previous });
      } catch (e) {
        // 忽略回呼錯誤，避免影響其他回呼
      }
    }
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
    locale: locale,
    registeredLocales: registeredLocales,
    onChange: onChange,
    off: off,
  };
})();
