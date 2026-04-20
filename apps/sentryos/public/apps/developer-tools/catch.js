
var counter = 0;

function run() {
    setTimeout(() => {
        if (counter > 1000) {
            counter = 0;
            OS.console.clear();
        }
        OS.console.writeLine("... Catching global errors for debugging ... (" + (++counter) + ")");
        run();
    }, 1);
}
run();


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