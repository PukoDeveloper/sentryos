// stdlib/Math Utils — SentryOS standard math library

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

function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) { var t = b; b = a % b; a = t; }
    return a;
}

function lcm(a, b) {
    return Math.abs(a * b) / gcd(a, b);
}

globalThis.MathUtils = {
    factorial: factorial,
    fibonacci: fibonacci,
    isPrime: isPrime,
    gcd: gcd,
    lcm: lcm,
};

// ── Register CLI commands ─────────────────────────────────────

envApi.registerCommand('factorial', 'Calculate factorial of a number', 'factorial <n>');
envApi.registerCommand('fib', 'Calculate Fibonacci number', 'fib <n>');
envApi.registerCommand('prime', 'Check if a number is prime', 'prime <n>');
envApi.registerCommand('gcd', 'Calculate GCD of two numbers', 'gcd <a> <b>');
envApi.registerCommand('lcm', 'Calculate LCM of two numbers', 'lcm <a> <b>');

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
