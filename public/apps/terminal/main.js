// Terminal — SentryOS terminal application

consoleApi.writeLine('=== SentryOS Terminal ===');
consoleApi.writeLine('Type "help" for available commands.');
consoleApi.writeLine('');

function padRight(s, len) {
    s = String(s);
    while (s.length < len) s += ' ';
    return s;
}

function onConsoleInput(line) {
    var input = line.trim();
    if (input === '') return;

    var parts = input.split(' ');
    var cmd = parts[0].toLowerCase();
    var args = parts.slice(1);

    if (cmd === 'help') {
        consoleApi.writeLine('Application commands:');
        consoleApi.writeLine('  help              - Show this help message');
        consoleApi.writeLine('  echo <msg>        - Echo a message');
        consoleApi.writeLine('  clear             - Clear the console');
        consoleApi.writeLine('  eval <expr>       - Evaluate a JavaScript expression');
        consoleApi.writeLine('  exit              - Terminate this app');
        consoleApi.writeLine('');
        consoleApi.writeLine('Library commands:');
        consoleApi.writeLine('  libs              - List available libraries');
        consoleApi.writeLine('  load <lib>        - Load a library into this session');
        consoleApi.writeLine('');
        consoleApi.writeLine('System commands:');
        consoleApi.writeLine('  ps                - List running processes');
        consoleApi.writeLine('  kill <pid>        - Terminate a process');
        consoleApi.writeLine('  apps              - List installed applications');
        consoleApi.writeLine('  launch <name|id>  - Launch an application');
        consoleApi.writeLine('  windows           - List open windows');
        consoleApi.writeLine('  sysinfo           - Show system information');
        consoleApi.writeLine('  commands          - List registered CLI commands');
        consoleApi.writeLine('');
        consoleApi.writeLine('CLI commands from libraries can be invoked directly.');
        consoleApi.writeLine('Example: factorial 10, reverse hello');
    } else if (cmd === 'echo') {
        consoleApi.writeLine(args.join(' '));
    } else if (cmd === 'clear') {
        consoleApi.clear();
    } else if (cmd === 'libs') {
        var result = envApi.listLibraries();
        if (!result.success) {
            consoleApi.writeLine('Error: ' + (result.error || 'Unknown'));
            return;
        }
        var ids = result.data;
        if (ids.length === 0) {
            consoleApi.writeLine('No libraries available.');
        } else {
            consoleApi.writeLine('Available libraries (' + ids.length + '):');
            for (var i = 0; i < ids.length; i++) {
                consoleApi.writeLine('  ' + ids[i]);
            }
        }
    } else if (cmd === 'load') {
        var libId = args.join(' ');
        if (!libId) {
            consoleApi.writeLine('Usage: load <library-id>');
            return;
        }
        var loadResult = envApi.loadLibrary(libId);
        if (loadResult.success) {
            consoleApi.writeLine('Library loaded: ' + libId);
        } else {
            consoleApi.writeLine('Failed: ' + (loadResult.error || 'Unknown'));
        }
    } else if (cmd === 'eval') {
        var expr = args.join(' ');
        if (!expr) {
            consoleApi.writeLine('Usage: eval <expression>');
            return;
        }
        try {
            var evalResult = eval(expr);
            consoleApi.writeLine(String(evalResult));
        } catch (e) {
            consoleApi.writeLine('Error: ' + e.message);
        }
    } else if (cmd === 'ps') {
        var psResult = shellApi.listProcesses();
        if (!psResult.success) {
            consoleApi.writeLine('Error: ' + (psResult.error || 'Unknown'));
            return;
        }
        var procs = psResult.data;
        consoleApi.writeLine(padRight('PID', 6) + padRight('STATUS', 10) + padRight('TYPE', 10) + 'APP');
        consoleApi.writeLine('---   ------    --------  ---');
        for (var i = 0; i < procs.length; i++) {
            var p = procs[i];
            consoleApi.writeLine(
                padRight(p.pid, 6) +
                padRight(p.status, 10) +
                padRight(p.type, 10) +
                p.appDefId
            );
        }
    } else if (cmd === 'kill') {
        if (args.length === 0) {
            consoleApi.writeLine('Usage: kill <pid>');
            return;
        }
        var killPid = parseInt(args[0], 10);
        if (isNaN(killPid)) {
            consoleApi.writeLine('Invalid PID: ' + args[0]);
            return;
        }
        var killResult = shellApi.killProcess(killPid);
        if (killResult.success) {
            consoleApi.writeLine('Process ' + killPid + ' terminated.');
        } else {
            consoleApi.writeLine('Failed: ' + (killResult.error || 'Unknown'));
        }
    } else if (cmd === 'apps') {
        var appsResult = shellApi.listApps();
        if (!appsResult.success) {
            consoleApi.writeLine('Error: ' + (appsResult.error || 'Unknown'));
            return;
        }
        var appList = appsResult.data;
        consoleApi.writeLine(padRight('NAME', 20) + padRight('TYPE', 10) + padRight('VER', 10) + 'PACKAGE');
        consoleApi.writeLine('------------------  --------  --------  -------');
        for (var i = 0; i < appList.length; i++) {
            var a = appList[i];
            consoleApi.writeLine(
                padRight(a.name, 20) +
                padRight(a.type, 10) +
                padRight(a.version, 10) +
                a.package
            );
        }
    } else if (cmd === 'launch') {
        var appName = args.join(' ');
        if (!appName) {
            consoleApi.writeLine('Usage: launch <name|id>');
            return;
        }
        var launchResult = shellApi.launch(appName);
        if (launchResult.success) {
            consoleApi.writeLine('Launching: ' + launchResult.data);
        } else {
            consoleApi.writeLine('Failed: ' + (launchResult.error || 'Unknown'));
        }
    } else if (cmd === 'windows') {
        var winResult = shellApi.listWindows();
        if (!winResult.success) {
            consoleApi.writeLine('Error: ' + (winResult.error || 'Unknown'));
            return;
        }
        var wins = winResult.data;
        if (wins.length === 0) {
            consoleApi.writeLine('No windows open.');
        } else {
            consoleApi.writeLine(padRight('TITLE', 25) + padRight('STATE', 12) + 'PROCESS');
            consoleApi.writeLine('-----------------------  ----------  -------');
            for (var i = 0; i < wins.length; i++) {
                var w = wins[i];
                consoleApi.writeLine(
                    padRight(w.title, 25) +
                    padRight(w.state, 12) +
                    w.processAppId
                );
            }
        }
    } else if (cmd === 'sysinfo') {
        var infoResult = shellApi.sysinfo();
        if (!infoResult.success) {
            consoleApi.writeLine('Error: ' + (infoResult.error || 'Unknown'));
            return;
        }
        var info = infoResult.data;
        consoleApi.writeLine('SentryOS System Information');
        consoleApi.writeLine('  Uptime:      ' + info.uptime);
        consoleApi.writeLine('  Processes:   ' + info.processes.running + ' running / ' + info.processes.total + ' total');
        consoleApi.writeLine('  Windows:     ' + info.windows);
        consoleApi.writeLine('  Libraries:   ' + info.libraries);
        consoleApi.writeLine('  Commands:    ' + info.commands + ' registered');
        consoleApi.writeLine('  Apps:        ' + info.apps + ' installed');
    } else if (cmd === 'exit') {
        consoleApi.writeLine('Goodbye!');
        processApi.terminateSelf();
    } else if (cmd === 'commands') {
        var cmdResult = shellApi.listCommands();
        if (!cmdResult.success) {
            consoleApi.writeLine('Error: ' + (cmdResult.error || 'Unknown'));
            return;
        }
        var cmds = cmdResult.data;
        if (cmds.length === 0) {
            consoleApi.writeLine('No commands registered.');
        } else {
            consoleApi.writeLine(padRight('COMMAND', 16) + padRight('DESCRIPTION', 35) + 'LIBRARY');
            consoleApi.writeLine('--------------  ---------------------------------  -------');
            for (var i = 0; i < cmds.length; i++) {
                var c = cmds[i];
                consoleApi.writeLine(
                    padRight(c.name, 16) +
                    padRight(c.description, 35) +
                    c.libraryId
                );
            }
        }
    } else {
        // ── Auto-dispatch: resolve from command registry ──
        var resolved = shellApi.resolveCommand(cmd);
        if (resolved.success) {
            var cmdInfo = resolved.data;
            // Auto-load the library if handler not yet available
            if (!globalThis.__commands || typeof globalThis.__commands[cmd] !== 'function') {
                var lr = envApi.loadLibrary(cmdInfo.libraryId);
                if (!lr.success) {
                    consoleApi.writeLine('Failed to load library: ' + cmdInfo.libraryId);
                    return;
                }
            }
            if (globalThis.__commands && typeof globalThis.__commands[cmd] === 'function') {
                var output = globalThis.__commands[cmd](args);
                if (output !== undefined && output !== null) {
                    consoleApi.writeLine(String(output));
                }
            } else {
                consoleApi.writeLine('Command handler not found: ' + cmd);
            }
        } else {
            consoleApi.writeLine('Unknown command: ' + cmd);
            consoleApi.writeLine('Type "help" or "commands" for available commands.');
        }
    }
}