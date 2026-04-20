// stdlib/String Utils — SentryOS standard string library

// ── Padding / repetition ──────────────────────────────────────

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

// ── Case transforms ───────────────────────────────────────────

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Title-case every word: "hello world" → "Hello World" */
function titleCase(str) {
    return String(str).replace(/\b\w/g, function(ch) { return ch.toUpperCase(); });
}

/**
 * camelCase: "hello world foo" → "helloWorldFoo"
 * Also handles snake_case and kebab-case input.
 */
function camelCase(str) {
    return String(str)
        .replace(/[-_]+/g, ' ')
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .split(' ')
        .filter(function(w) { return w.length > 0; })
        .map(function(w, i) { return i === 0 ? w.toLowerCase() : capitalize(w.toLowerCase()); })
        .join('');
}

/**
 * snake_case: "Hello World" → "hello_world"
 */
function snakeCase(str) {
    return String(str)
        .replace(/[-\s]+/g, '_')
        .replace(/[A-Z]/g, function(ch, i) { return (i > 0 ? '_' : '') + ch.toLowerCase(); })
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

/**
 * kebab-case: "Hello World" → "hello-world"
 */
function kebabCase(str) {
    return snakeCase(str).replace(/_/g, '-');
}

/**
 * URL-safe slug: removes accents, lowercases, replaces spaces/punctuation with hyphens.
 * "Héllo Wörld!" → "hello-world"
 */
function slugify(str) {
    var s = String(str).toLowerCase();
    // Normalize common accented characters
    var map = {
        'à':'a','á':'a','â':'a','ã':'a','ä':'a','å':'a',
        'è':'e','é':'e','ê':'e','ë':'e',
        'ì':'i','í':'i','î':'i','ï':'i',
        'ò':'o','ó':'o','ô':'o','õ':'o','ö':'o',
        'ù':'u','ú':'u','û':'u','ü':'u',
        'ý':'y','ÿ':'y','ñ':'n','ç':'c','ß':'ss',
    };
    s = s.replace(/[àáâãäåèéêëìíîïòóôõöùúûüýÿñçß]/g, function(ch) { return map[ch] || ch; });
    return s.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Transforms ────────────────────────────────────────────────

function reverse(str) {
    return String(str).split('').reverse().join('');
}

/**
 * Truncate a string to maxLen characters, appending suffix (default "…") if cut.
 */
function truncate(str, maxLen, suffix) {
    str = String(str);
    if (suffix === undefined) suffix = '…';
    if (str.length <= maxLen) return str;
    return str.slice(0, Math.max(0, maxLen - suffix.length)) + suffix;
}

/**
 * Simple template interpolation: replace {{key}} placeholders.
 * template("Hello {{name}}!", { name: "World" }) → "Hello World!"
 */
function template(str, params) {
    if (!params || typeof params !== 'object') return String(str);
    var result = String(str);
    var keys = Object.keys(params);
    for (var i = 0; i < keys.length; i++) {
        var pattern = '{{' + keys[i] + '}}';
        while (result.indexOf(pattern) !== -1) {
            result = result.replace(pattern, String(params[keys[i]]));
        }
    }
    return result;
}

// ── Analysis ──────────────────────────────────────────────────

function wordCount(str) {
    var trimmed = String(str).trim();
    if (trimmed.length === 0) return 0;
    return trimmed.split(/\s+/).length;
}

/** Count how many times needle appears in haystack. */
function countOccurrences(haystack, needle) {
    if (!needle) return 0;
    var count = 0;
    var idx = 0;
    while ((idx = String(haystack).indexOf(needle, idx)) !== -1) {
        count++;
        idx += needle.length;
    }
    return count;
}

// ── Export ────────────────────────────────────────────────────

globalThis.StringUtils = {
    // Padding / repetition
    repeat: repeat,
    padLeft: padLeft,
    padRight: padRight,
    // Case transforms
    capitalize: capitalize,
    titleCase: titleCase,
    camelCase: camelCase,
    snakeCase: snakeCase,
    kebabCase: kebabCase,
    slugify: slugify,
    // Transforms
    reverse: reverse,
    truncate: truncate,
    template: template,
    // Analysis
    wordCount: wordCount,
    countOccurrences: countOccurrences,
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

globalThis.__commands.uppercase = function(args) {
    if (args.length === 0) return 'Usage: uppercase <text>';
    return args.join(' ').toUpperCase();
};

globalThis.__commands.lowercase = function(args) {
    if (args.length === 0) return 'Usage: lowercase <text>';
    return args.join(' ').toLowerCase();
};

globalThis.__commands.titlecase = function(args) {
    if (args.length === 0) return 'Usage: titlecase <text>';
    return titleCase(args.join(' '));
};

globalThis.__commands.truncate = function(args) {
    if (args.length < 2) return 'Usage: truncate <text> <maxLen>';
    var maxLen = parseInt(args[args.length - 1], 10);
    if (isNaN(maxLen)) return 'Usage: truncate <text> <maxLen>';
    return truncate(args.slice(0, -1).join(' '), maxLen);
};

globalThis.__commands.slugify = function(args) {
    if (args.length === 0) return 'Usage: slugify <text>';
    return slugify(args.join(' '));
};

globalThis.__commands.count = function(args) {
    if (args.length < 2) return 'Usage: count <needle> <haystack...>';
    var needle = args[0];
    var haystack = args.slice(1).join(' ');
    return String(countOccurrences(haystack, needle));
};
