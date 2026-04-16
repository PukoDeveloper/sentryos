import type { Kernel } from '../kernel/Kernel';
import { Permissions } from '../kernel/constants';

// ── ANSI 轉義碼常數（暴露給沙盒 App 使用）─────────────────

const ANSI_CODES: Record<string, string> = {
  RESET:          '\x1b[0m',
  BOLD:           '\x1b[1m',
  DIM:            '\x1b[2m',
  ITALIC:         '\x1b[3m',
  UNDERLINE:      '\x1b[4m',
  INVERSE:        '\x1b[7m',
  STRIKETHROUGH:  '\x1b[9m',
  BLACK:          '\x1b[30m',
  RED:            '\x1b[31m',
  GREEN:          '\x1b[32m',
  YELLOW:         '\x1b[33m',
  BLUE:           '\x1b[34m',
  MAGENTA:        '\x1b[35m',
  CYAN:           '\x1b[36m',
  WHITE:          '\x1b[37m',
  BRIGHT_BLACK:   '\x1b[90m',
  BRIGHT_RED:     '\x1b[91m',
  BRIGHT_GREEN:   '\x1b[92m',
  BRIGHT_YELLOW:  '\x1b[93m',
  BRIGHT_BLUE:    '\x1b[94m',
  BRIGHT_MAGENTA: '\x1b[95m',
  BRIGHT_CYAN:    '\x1b[96m',
  BRIGHT_WHITE:   '\x1b[97m',
  BG_BLACK:       '\x1b[40m',
  BG_RED:         '\x1b[41m',
  BG_GREEN:       '\x1b[42m',
  BG_YELLOW:      '\x1b[43m',
  BG_BLUE:        '\x1b[44m',
  BG_MAGENTA:     '\x1b[45m',
  BG_CYAN:        '\x1b[46m',
  BG_WHITE:       '\x1b[47m',
};

export function registerConsoleApi(kernel: Kernel): void {
  const runtime = kernel.resolve('runtime');
  const permissions = kernel.resolve('permissions');
  const launcher = kernel.resolve('applicationLauncher');

  runtime.registerApi('consoleApi', ({ process }) => {
    const controller = launcher.getConsoleControllers().get(process.processAppId);
    return {
      writeLine: (text: unknown) => {
        if (!permissions.has(process.processAppId, Permissions.CONSOLE_WRITE)) {
          return { success: false, error: 'PermissionDenied' };
        }
        if (controller) controller.appendLine(String(text));
        return { success: true, data: null };
      },
      write: (text: unknown) => {
        if (!permissions.has(process.processAppId, Permissions.CONSOLE_WRITE)) {
          return { success: false, error: 'PermissionDenied' };
        }
        if (controller) controller.appendText(String(text));
        return { success: true, data: null };
      },
      clear: () => {
        if (!permissions.has(process.processAppId, Permissions.CONSOLE_WRITE)) {
          return { success: false, error: 'PermissionDenied' };
        }
        if (controller) controller.clear();
        return { success: true, data: null };
      },
      /** ANSI 色彩/樣式常數，例如 OS.console.ANSI.RED */
      ANSI: ANSI_CODES,
      /** 產生 256 色前景碼 */
      fg256: (n: unknown) => `\x1b[38;5;${Number(n)}m`,
      /** 產生 256 色背景碼 */
      bg256: (n: unknown) => `\x1b[48;5;${Number(n)}m`,
      /** 產生 RGB 前景碼 */
      fgRgb: (r: unknown, g: unknown, b: unknown) => `\x1b[38;2;${Number(r)};${Number(g)};${Number(b)}m`,
      /** 產生 RGB 背景碼 */
      bgRgb: (r: unknown, g: unknown, b: unknown) => `\x1b[48;2;${Number(r)};${Number(g)};${Number(b)}m`,
      /** 將文字以指定色彩包裝（便利函式） */
      colorize: (text: unknown, color: unknown) => {
        const colorStr = String(color);
        const code = ANSI_CODES[colorStr] ?? colorStr;
        return code + String(text) + '\x1b[0m';
      },
    };
  }, ['console'], 'console');
}
