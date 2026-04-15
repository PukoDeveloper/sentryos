// ────────────────────────────────────────────────────────────
// LanguageManager — 系統級語言管理
// 管理目前語系、支援語系清單、系統翻譯包，以及語言變更通知。
// ────────────────────────────────────────────────────────────

import type { Kernel } from '../kernel/Kernel';
import { Events } from '../kernel/constants';

/** 單一語系的翻譯字典：key → 翻譯文字 */
export type TranslationDict = Record<string, string>;

/** 語言包格式：locale → TranslationDict */
export type LanguagePack = Record<string, TranslationDict>;

/** 支援的語系描述 */
export interface LocaleDescriptor {
  code: string;      // e.g. 'zh-TW'
  name: string;      // e.g. '繁體中文'
  nativeName: string; // e.g. '繁體中文'
}

const DEFAULT_LOCALE = 'zh-TW';

const BUILTIN_LOCALES: LocaleDescriptor[] = [
  { code: 'zh-TW', name: '繁體中文', nativeName: '繁體中文' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ja', name: '日本語', nativeName: '日本語' },
];

class LanguageManager {
  private currentLocale: string = DEFAULT_LOCALE;
  private readonly supportedLocales: LocaleDescriptor[] = [...BUILTIN_LOCALES];
  /** 系統級翻譯包：namespace → locale → key → value */
  private readonly systemPacks: Map<string, LanguagePack> = new Map();
  private readonly kernel: Kernel;

  constructor(kernel: Kernel) {
    this.kernel = kernel;
  }

  // ── 語系查詢與切換 ─────────────────────────────────

  getCurrentLocale(): string {
    return this.currentLocale;
  }

  getSupportedLocales(): LocaleDescriptor[] {
    return [...this.supportedLocales];
  }

  /**
   * 切換系統語系。若語系有變更，會透過 EventBus 廣播 `language.changed` 事件，
   * 並更新環境變數 `SYSTEM_LANG`。
   * @returns 是否實際發生變更
   */
  setLocale(locale: string): boolean {
    if (!this.supportedLocales.some(l => l.code === locale)) {
      return false;
    }
    if (locale === this.currentLocale) {
      return false;
    }
    const previous = this.currentLocale;
    this.currentLocale = locale;

    // 同步環境變數
    if (this.kernel.has('environmentManager')) {
      this.kernel.resolve('environmentManager').setVariable('SYSTEM_LANG', locale);
    }

    // 廣播變更事件
    if (this.kernel.has('eventBus')) {
      const systemAppId = this.kernel.get('systemAppId');
      this.kernel.resolve('eventBus').emit(systemAppId, Events.LANGUAGE_CHANGED, {
        locale,
        previous,
      });
    }

    return true;
  }

  // ── 系統翻譯包管理 ────────────────────────────────

  /**
   * 註冊系統級翻譯包（供核心模組使用，例如 DesktopShell、BIOS）。
   * @param namespace 命名空間，例如 'desktop', 'bios'
   * @param pack 語言包 { locale: { key: value } }
   */
  registerSystemPack(namespace: string, pack: LanguagePack): void {
    const existing = this.systemPacks.get(namespace);
    if (existing) {
      // 合併而非覆蓋
      for (const [locale, dict] of Object.entries(pack)) {
        if (!existing[locale]) {
          existing[locale] = {};
        }
        Object.assign(existing[locale], dict);
      }
    } else {
      this.systemPacks.set(namespace, { ...pack });
    }
  }

  /**
   * 取得系統翻譯文字。
   * @param namespace 命名空間
   * @param key       翻譯鍵
   * @param locale    可選，預設使用目前語系
   * @returns 翻譯字串，若找不到回傳 key 本身
   */
  t(namespace: string, key: string, locale?: string): string {
    const lang = locale ?? this.currentLocale;
    const pack = this.systemPacks.get(namespace);
    if (!pack) return key;

    // 優先嘗試目前語系，再嘗試預設語系
    return pack[lang]?.[key] ?? pack[DEFAULT_LOCALE]?.[key] ?? key;
  }

  /**
   * 取得某個命名空間下目前語系的所有翻譯。
   */
  getSystemTranslations(namespace: string, locale?: string): TranslationDict {
    const lang = locale ?? this.currentLocale;
    const pack = this.systemPacks.get(namespace);
    if (!pack) return {};
    return { ...(pack[DEFAULT_LOCALE] ?? {}), ...(pack[lang] ?? {}) };
  }

  // ── 序列化 ────────────────────────────────────────

  /** 匯出設定（用於持久化） */
  exportSettings(): { locale: string } {
    return { locale: this.currentLocale };
  }

  /** 匯入設定（從持久化還原，不觸發事件） */
  importSettings(settings: { locale?: string }): void {
    if (settings.locale && this.supportedLocales.some(l => l.code === settings.locale)) {
      this.currentLocale = settings.locale;
    }
    // 同步環境變數
    if (this.kernel.has('environmentManager')) {
      this.kernel.resolve('environmentManager').setVariable('SYSTEM_LANG', this.currentLocale);
    }
  }
}

export { LanguageManager };
