// stdlib/String Utils — SentryOS standard string library

function repeat(str, count) {
    if (count < 0) return '';
    var result = '';
    for (var i = 0; i < count; i++) result += str;
    return result;
}

function padLeft(str, length, ch) {
    str = String(str);
    ch = ch || ' ';
    while (str.length < length) str = ch + str;
    return str;
}

function padRight(str, length, ch) {
    str = String(str);
    ch = ch || ' ';
    while (str.length < length) str = str + ch;
    return str;
}

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function reverse(str) {
    return String(str).split('').reverse().join('');
}

function wordCount(str) {
    var trimmed = String(str).trim();
    if (trimmed.length === 0) return 0;
    return trimmed.split(/\s+/).length;
}

globalThis.StringUtils = {
    repeat: repeat,
    padLeft: padLeft,
    padRight: padRight,
    capitalize: capitalize,
    reverse: reverse,
    wordCount: wordCount,
};

// ── CLI command handlers ──────────────────────────────────────

globalThis.__commands = globalThis.__commands || {};

globalThis.__commands.reverse = function(args) {
    if (args.length === 0) return 'Usage: reverse <text>';
    return reverse(args.join(' '));
};

globalThis.__commands.capitalize = function(args) {
    if (args.length === 0) return 'Usage: capitalize <text>';
    return capitalize(args.join(' '));
};

globalThis.__commands.wordcount = function(args) {
    if (args.length === 0) return 'Usage: wordcount <text...>';
    return String(wordCount(args.join(' ')));
};

globalThis.__commands.repeat = function(args) {
    if (args.length < 2) return 'Usage: repeat <text> <n>';
    var n = parseInt(args[args.length - 1], 10);
    if (isNaN(n)) return 'Usage: repeat <text> <n>';
    var text = args.slice(0, -1).join(' ');
    return repeat(text, n);
};
