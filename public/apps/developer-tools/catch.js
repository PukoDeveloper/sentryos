
var counter = 0;

function test(fn) {
    OS.console.writeLine("... Catching global errors for debugging ... (" + (++counter) + ")");
    runTimeout();
}

function runTimeout() {
    setTimeout(test, 1);
}

function run() {
    setInterval(() => {
        OS.console.writeLine("... Catching global errors for debugging ... (" + (++counter) + ")");
        // run();
    }, 1);
}
// run();
runTimeout();

// var _loadResult = OS.env.loadLibrary('stdlib/UI Utils');
// if (!_loadResult.success) {
//   throw new Error('Failed to load UI library: ' + (_loadResult.error || 'Unknown'));
// }
// while (true) {
//     var app = UI.createApp({
//         title: 'Developer Tools',
//         width: 800,
//         height: 600,
//         render: function (state, self) {
//             return OS.ui.code_editor({ id: 'editor', language: 'javascript', value: '// Developer Tools\n\nconsole.log("Hello, SentryOS!");' });
//         }
//     })
// }

function onConsoleInput(command) {
    OS.console.writeLine("You entered: " + command);
}