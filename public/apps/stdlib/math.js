// stdlib/Math Utils — SentryOS standard math library

// ── Number theory ─────────────────────────────────────────────

function factorial(n) {
    if (n < 0) return NaN;
    if (n <= 1) return 1;
    var result = 1;
    for (var i = 2; i <= n; i++) result *= i;
    return result;
}

function fibonacci(n) {
    if (n <= 0) return 0;
    if (n === 1) return 1;
    var a = 0, b = 1;
    for (var i = 2; i <= n; i++) {
        var tmp = a + b;
        a = b;
        b = tmp;
    }
    return b;
}

function isPrime(n) {
    if (n < 2) return false;
    if (n < 4) return true;
    if (n % 2 === 0 || n % 3 === 0) return false;
    for (var i = 5; i * i <= n; i += 6) {
        if (n % i === 0 || n % (i + 2) === 0) return false;
    }
    return true;
}

/** List the first n primes. */
function firstPrimes(n) {
    if (n <= 0) return [];
    var result = [];
    var candidate = 2;
    while (result.length < n) {
        if (isPrime(candidate)) result.push(candidate);
        candidate++;
    }
    return result;
}

function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) { var t = b; b = a % b; a = t; }
    return a;
}

function lcm(a, b) {
    return Math.abs(a * b) / gcd(a, b);
}

// ── Arithmetic helpers ────────────────────────────────────────

/** Clamp value between min and max (inclusive). */
function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
}

/** Linear interpolation between a and b by factor t (0–1). */
function lerp(a, b, t) {
    return a + (b - a) * t;
}

/** Round n to a given number of decimal places. */
function roundTo(n, decimals) {
    var factor = Math.pow(10, decimals || 0);
    return Math.round(n * factor) / factor;
}

/** Generate an array of numbers from start (inclusive) to end (exclusive) with optional step. */
function range(start, end, step) {
    step = step || 1;
    if (step === 0) return [];
    var result = [];
    if (step > 0) {
        for (var i = start; i < end; i += step) result.push(roundTo(i, 10));
    } else {
        for (var i = start; i > end; i += step) result.push(roundTo(i, 10));
    }
    return result;
}

// ── Angle conversions ─────────────────────────────────────────

/** Convert degrees to radians. */
function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

/** Convert radians to degrees. */
function rad2deg(rad) {
    return rad * (180 / Math.PI);
}

// ── Statistics ────────────────────────────────────────────────

/** Sum all numbers in an array. */
function sum(arr) {
    var total = 0;
    for (var i = 0; i < arr.length; i++) total += Number(arr[i]);
    return total;
}

/** Arithmetic mean of an array. */
function average(arr) {
    if (arr.length === 0) return NaN;
    return sum(arr) / arr.length;
}

/** Median of an array. */
function median(arr) {
    if (arr.length === 0) return NaN;
    var sorted = arr.slice().sort(function(a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Population standard deviation of an array. */
function stdDev(arr) {
    if (arr.length === 0) return NaN;
    var mean = average(arr);
    var variance = 0;
    for (var i = 0; i < arr.length; i++) {
        var diff = Number(arr[i]) - mean;
        variance += diff * diff;
    }
    return Math.sqrt(variance / arr.length);
}

// ── Export ────────────────────────────────────────────────────

globalThis.MathUtils = {
    // Number theory
    factorial: factorial,
    fibonacci: fibonacci,
    isPrime: isPrime,
    firstPrimes: firstPrimes,
    gcd: gcd,
    lcm: lcm,
    // Arithmetic helpers
    clamp: clamp,
    lerp: lerp,
    roundTo: roundTo,
    range: range,
    // Angle
    deg2rad: deg2rad,
    rad2deg: rad2deg,
    // Statistics
    sum: sum,
    average: average,
    median: median,
    stdDev: stdDev,
};

// ── CLI command handlers ──────────────────────────────────────

globalThis.__commands = globalThis.__commands || {};

globalThis.__commands.factorial = function(args) {
    var n = parseInt(args[0], 10);
    if (isNaN(n)) return 'Usage: factorial <number>';
    return String(factorial(n));
};

globalThis.__commands.fib = function(args) {
    var n = parseInt(args[0], 10);
    if (isNaN(n)) return 'Usage: fib <number>';
    return String(fibonacci(n));
};

globalThis.__commands.prime = function(args) {
    var n = parseInt(args[0], 10);
    if (isNaN(n)) return 'Usage: prime <number>';
    return isPrime(n) ? n + ' is prime' : n + ' is not prime';
};

globalThis.__commands.gcd = function(args) {
    var a = parseInt(args[0], 10), b = parseInt(args[1], 10);
    if (isNaN(a) || isNaN(b)) return 'Usage: gcd <a> <b>';
    return String(gcd(a, b));
};

globalThis.__commands.lcm = function(args) {
    var a = parseInt(args[0], 10), b = parseInt(args[1], 10);
    if (isNaN(a) || isNaN(b)) return 'Usage: lcm <a> <b>';
    return String(lcm(a, b));
};

globalThis.__commands.clamp = function(args) {
    var v = parseFloat(args[0]), lo = parseFloat(args[1]), hi = parseFloat(args[2]);
    if (isNaN(v) || isNaN(lo) || isNaN(hi)) return 'Usage: clamp <value> <min> <max>';
    return String(clamp(v, lo, hi));
};

globalThis.__commands.lerp = function(args) {
    var a = parseFloat(args[0]), b = parseFloat(args[1]), t = parseFloat(args[2]);
    if (isNaN(a) || isNaN(b) || isNaN(t)) return 'Usage: lerp <a> <b> <t>';
    return String(lerp(a, b, t));
};

globalThis.__commands.round = function(args) {
    var n = parseFloat(args[0]), d = parseInt(args[1], 10) || 0;
    if (isNaN(n)) return 'Usage: round <number> [decimals]';
    return String(roundTo(n, d));
};

globalThis.__commands.range = function(args) {
    var start = parseFloat(args[0]), end = parseFloat(args[1]);
    var step = args[2] !== undefined ? parseFloat(args[2]) : 1;
    if (isNaN(start) || isNaN(end)) return 'Usage: range <start> <end> [step]';
    return range(start, end, step).join(' ');
};

globalThis.__commands.sum = function(args) {
    if (args.length === 0) return 'Usage: sum <n1> <n2> ...';
    var nums = args.map(function(a) { return parseFloat(a); });
    if (nums.some(isNaN)) return 'All arguments must be numbers';
    return String(sum(nums));
};

globalThis.__commands.avg = function(args) {
    if (args.length === 0) return 'Usage: avg <n1> <n2> ...';
    var nums = args.map(function(a) { return parseFloat(a); });
    if (nums.some(isNaN)) return 'All arguments must be numbers';
    return String(roundTo(average(nums), 6));
};

globalThis.__commands.median = function(args) {
    if (args.length === 0) return 'Usage: median <n1> <n2> ...';
    var nums = args.map(function(a) { return parseFloat(a); });
    if (nums.some(isNaN)) return 'All arguments must be numbers';
    return String(median(nums));
};

globalThis.__commands.stddev = function(args) {
    if (args.length === 0) return 'Usage: stddev <n1> <n2> ...';
    var nums = args.map(function(a) { return parseFloat(a); });
    if (nums.some(isNaN)) return 'All arguments must be numbers';
    return String(roundTo(stdDev(nums), 6));
};
