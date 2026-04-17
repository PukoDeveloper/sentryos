// ────────────────────────────────────────────────────────────
// AnsiParser — ANSI 轉義序列解析器
// ────────────────────────────────────────────────────────────
// 支援 SGR (Select Graphic Rendition) 序列：
//   \x1b[<code>m  或  \x1b[<code>;<code>;...m
// 涵蓋：前景色 (30-37, 90-97)、背景色 (40-47, 100-107)、
//       256 色 (38;5;n / 48;5;n)、RGB (38;2;r;g;b / 48;2;r;g;b)、
//       粗體 (1)、淡色 (2)、斜體 (3)、底線 (4)、刪除線 (9)、重設 (0)

// ── 標準 4-bit 色彩對照表 ─────────────────────────────────

const COLORS_NORMAL: Record<number, string> = {
    0: '#1a1a2e', // black
    1: '#ff5555', // red
    2: '#50fa7b', // green
    3: '#f1fa8c', // yellow
    4: '#6272a4', // blue
    5: '#ff79c6', // magenta
    6: '#8be9fd', // cyan
    7: '#e0e0e0', // white
};

const COLORS_BRIGHT: Record<number, string> = {
    0: '#6272a4', // bright black (gray)
    1: '#ff6e6e', // bright red
    2: '#69ff94', // bright green
    3: '#ffffa5', // bright yellow
    4: '#d6acff', // bright blue
    5: '#ff92df', // bright magenta
    6: '#a4ffff', // bright cyan
    7: '#ffffff', // bright white
};

// ── 256 色表（0-255）────────────────────────────────────

function color256(n: number): string {
    if (n < 0 || n > 255) return COLORS_NORMAL[7]!;
    // 標準 16 色
    if (n < 8) return COLORS_NORMAL[n]!;
    if (n < 16) return COLORS_BRIGHT[n - 8]!;
    // 216 色立方 (16-231)
    if (n < 232) {
        const idx = n - 16;
        const r = Math.floor(idx / 36);
        const g = Math.floor((idx % 36) / 6);
        const b = idx % 6;
        const toHex = (v: number) => (v === 0 ? 0 : 55 + v * 40);
        return `rgb(${toHex(r)},${toHex(g)},${toHex(b)})`;
    }
    // 灰階 (232-255)
    const l = 8 + (n - 232) * 10;
    return `rgb(${l},${l},${l})`;
}

// ── SGR 狀態 ────────────────────────────────────────────

export interface AnsiStyle {
    fg: string | null;
    bg: string | null;
    bold: boolean;
    dim: boolean;
    italic: boolean;
    underline: boolean;
    strikethrough: boolean;
    inverse: boolean;
}

function defaultStyle(): AnsiStyle {
    return {
        fg: null, bg: null,
        bold: false, dim: false, italic: false,
        underline: false, strikethrough: false, inverse: false,
    };
}

function cloneStyle(s: AnsiStyle): AnsiStyle {
    return { ...s };
}

// ── 解析片段 ────────────────────────────────────────────

export interface AnsiSpan {
    text: string;
    style: AnsiStyle;
}

// ── 主解析函式 ──────────────────────────────────────────

const ESC_RE = /\x1b\[([0-9;]*)m/g;

/**
 * 將含 ANSI 轉義序列的字串解析為 AnsiSpan 陣列。
 * 不含轉義碼的文字直接以當前樣式輸出。
 */
export function parseAnsi(input: string): AnsiSpan[] {
    const spans: AnsiSpan[] = [];
    let style = defaultStyle();
    let lastIndex = 0;

    ESC_RE.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = ESC_RE.exec(input)) !== null) {
        // 收集 match 之前的純文字
        if (match.index > lastIndex) {
            spans.push({ text: input.slice(lastIndex, match.index), style: cloneStyle(style) });
        }
        // 解譯 SGR 參數
        style = applySgr(style, match[1]);
        lastIndex = ESC_RE.lastIndex;
    }

    // 剩餘尾段
    if (lastIndex < input.length) {
        spans.push({ text: input.slice(lastIndex), style: cloneStyle(style) });
    }

    return spans;
}

/**
 * 同 parseAnsi，但回傳的是已建好的 DOM 節點（<span> 陣列）。
 * 若整行都無 ANSI 碼，則回傳 null 表示可直接用 textContent。
 */
export function renderAnsiLine(text: string): HTMLElement | null {
    if (!text.includes('\x1b[')) return null;

    const spans = parseAnsi(text);
    if (spans.length === 0) return null;

    const frag = document.createElement('span');
    for (const s of spans) {
        if (s.text.length === 0) continue;
        const el = document.createElement('span');
        el.textContent = s.text;
        applyAnsiStyle(el, s.style);
        frag.appendChild(el);
    }
    return frag;
}

// ── SGR 參數解譯 ────────────────────────────────────────

function applySgr(base: AnsiStyle, paramStr: string): AnsiStyle {
    const style = cloneStyle(base);
    const codes = paramStr === '' ? [0] : paramStr.split(';').map(Number);

    for (let i = 0; i < codes.length; i++) {
        const c = codes[i];

        // ── 重設 ────────────────────────────────
        if (c === 0) {
            Object.assign(style, defaultStyle());
            continue;
        }

        // ── 文字屬性 ────────────────────────────
        if (c === 1) { style.bold = true; continue; }
        if (c === 2) { style.dim = true; continue; }
        if (c === 3) { style.italic = true; continue; }
        if (c === 4) { style.underline = true; continue; }
        if (c === 7) { style.inverse = true; continue; }
        if (c === 9) { style.strikethrough = true; continue; }
        if (c === 22) { style.bold = false; style.dim = false; continue; }
        if (c === 23) { style.italic = false; continue; }
        if (c === 24) { style.underline = false; continue; }
        if (c === 27) { style.inverse = false; continue; }
        if (c === 29) { style.strikethrough = false; continue; }

        // ── 標準前景色 30-37 ────────────────────
        if (c >= 30 && c <= 37) {
            style.fg = COLORS_NORMAL[c - 30]!;
            continue;
        }
        // ── 擴充前景色 38;5;n 或 38;2;r;g;b ────
        if (c === 38) {
            const mode = codes[++i];
            if (mode === 5) {
                style.fg = color256(codes[++i]);
            } else if (mode === 2) {
                const r = codes[++i], g = codes[++i], b = codes[++i];
                style.fg = `rgb(${r},${g},${b})`;
            }
            continue;
        }
        // ── 預設前景色 ─────────────────────────
        if (c === 39) { style.fg = null; continue; }

        // ── 標準背景色 40-47 ────────────────────
        if (c >= 40 && c <= 47) {
            style.bg = COLORS_NORMAL[c - 40]!;
            continue;
        }
        // ── 擴充背景色 48;5;n 或 48;2;r;g;b ────
        if (c === 48) {
            const mode = codes[++i];
            if (mode === 5) {
                style.bg = color256(codes[++i]);
            } else if (mode === 2) {
                const r = codes[++i], g = codes[++i], b = codes[++i];
                style.bg = `rgb(${r},${g},${b})`;
            }
            continue;
        }
        // ── 預設背景色 ─────────────────────────
        if (c === 49) { style.bg = null; continue; }

        // ── 亮色前景 90-97 ──────────────────────
        if (c >= 90 && c <= 97) {
            style.fg = COLORS_BRIGHT[c - 90]!;
            continue;
        }
        // ── 亮色背景 100-107 ────────────────────
        if (c >= 100 && c <= 107) {
            style.bg = COLORS_BRIGHT[c - 100]!;
            continue;
        }
    }

    return style;
}

// ── 將 AnsiStyle 套用到 HTMLElement ─────────────────────

function applyAnsiStyle(el: HTMLElement, style: AnsiStyle): void {
    let fg = style.fg;
    let bg = style.bg;

    if (style.inverse) {
        const tmp = fg;
        fg = bg ?? '#1a1a2e';
        bg = tmp ?? '#e0e0e0';
    }

    if (fg) el.style.color = fg;
    if (bg) {
        el.style.backgroundColor = bg;
        el.style.borderRadius = '2px';
    }
    if (style.bold) el.style.fontWeight = 'bold';
    if (style.dim) el.style.opacity = '0.6';
    if (style.italic) el.style.fontStyle = 'italic';

    const deco: string[] = [];
    if (style.underline) deco.push('underline');
    if (style.strikethrough) deco.push('line-through');
    if (deco.length) el.style.textDecoration = deco.join(' ');
}

// ── 匯出 ANSI 色彩常數供 App 使用 ──────────────────────

export const ANSI = {
    // 重設
    RESET:      '\x1b[0m',
    // 屬性
    BOLD:       '\x1b[1m',
    DIM:        '\x1b[2m',
    ITALIC:     '\x1b[3m',
    UNDERLINE:  '\x1b[4m',
    INVERSE:    '\x1b[7m',
    STRIKETHROUGH: '\x1b[9m',
    // 標準前景色
    BLACK:      '\x1b[30m',
    RED:        '\x1b[31m',
    GREEN:      '\x1b[32m',
    YELLOW:     '\x1b[33m',
    BLUE:       '\x1b[34m',
    MAGENTA:    '\x1b[35m',
    CYAN:       '\x1b[36m',
    WHITE:      '\x1b[37m',
    // 亮色前景
    BRIGHT_BLACK:   '\x1b[90m',
    BRIGHT_RED:     '\x1b[91m',
    BRIGHT_GREEN:   '\x1b[92m',
    BRIGHT_YELLOW:  '\x1b[93m',
    BRIGHT_BLUE:    '\x1b[94m',
    BRIGHT_MAGENTA: '\x1b[95m',
    BRIGHT_CYAN:    '\x1b[96m',
    BRIGHT_WHITE:   '\x1b[97m',
    // 標準背景色
    BG_BLACK:   '\x1b[40m',
    BG_RED:     '\x1b[41m',
    BG_GREEN:   '\x1b[42m',
    BG_YELLOW:  '\x1b[43m',
    BG_BLUE:    '\x1b[44m',
    BG_MAGENTA: '\x1b[45m',
    BG_CYAN:    '\x1b[46m',
    BG_WHITE:   '\x1b[47m',
    // 輔助函式
    fg256:  (n: number) => `\x1b[38;5;${n}m`,
    bg256:  (n: number) => `\x1b[48;5;${n}m`,
    fgRgb:  (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`,
    bgRgb:  (r: number, g: number, b: number) => `\x1b[48;2;${r};${g};${b}m`,
} as const;
