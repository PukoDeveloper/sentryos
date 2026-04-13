// Terminal — SentryOS terminal application

OS.writeLine('=== SentryOS Terminal ===');
OS.writeLine('Type "help" for available commands.');
OS.writeLine('');

function onKeyboardEvent(e) {
    OS.writeLine('Key event: ' + e.type + ' - ' + e.key);
}

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
        OS.writeLine('Application commands:');
        OS.writeLine('  help              - Show this help message');
        OS.writeLine('  echo <msg>        - Echo a message');
        OS.writeLine('  clear             - Clear the console');
        OS.writeLine('  eval <expr>       - Evaluate a JavaScript expression');
        OS.writeLine('  exit              - Terminate this app');
        OS.writeLine('');
        OS.writeLine('Library commands:');
        OS.writeLine('  libs              - List available libraries');
        OS.writeLine('  load <lib>        - Load a library into this session');
        OS.writeLine('');
        OS.writeLine('System commands:');
        OS.writeLine('  ps                - List running processes');
        OS.writeLine('  kill <pid>        - Terminate a process');
        OS.writeLine('  apps              - List installed applications');
        OS.writeLine('  launch <name|id>  - Launch an application');
        OS.writeLine('  windows           - List open windows');
        OS.writeLine('  sysinfo           - Show system information');
        OS.writeLine('  commands          - List registered CLI commands');
        OS.writeLine('');
        OS.writeLine('CLI commands from libraries can be invoked directly.');
        OS.writeLine('Example: factorial 10, reverse hello');
    } else if (cmd === 'echo') {
        OS.writeLine(args.join(' '));
    } else if (cmd === 'clear') {
        OS.clear();
    } else if (cmd === 'libs') {
        var result = OS.listLibraries();
        if (!result.success) {
            OS.writeLine('Error: ' + (result.error || 'Unknown'));
            return;
        }
        var ids = result.data;
        if (ids.length === 0) {
            OS.writeLine('No libraries available.');
        } else {
            OS.writeLine('Available libraries (' + ids.length + '):');
            for (var i = 0; i < ids.length; i++) {
                OS.writeLine('  ' + ids[i]);
            }
        }
    } else if (cmd === 'load') {
        var libId = args.join(' ');
        if (!libId) {
            OS.writeLine('Usage: load <library-id>');
            return;
        }
        var loadResult = OS.loadLibrary(libId);
        if (loadResult.success) {
            OS.writeLine('Library loaded: ' + libId);
        } else {
            OS.writeLine('Failed: ' + (loadResult.error || 'Unknown'));
        }
    } else if (cmd === 'eval') {
        var expr = args.join(' ');
        if (!expr) {
            OS.writeLine('Usage: eval <expression>');
            return;
        }
        try {
            var evalResult = eval(expr);
            OS.writeLine(String(evalResult));
        } catch (e) {
            OS.writeLine('Error: ' + e.message);
        }
    } else if (cmd === 'ps') {
        var psResult = OS.listProcesses();
        if (!psResult.success) {
            OS.writeLine('Error: ' + (psResult.error || 'Unknown'));
            return;
        }
        var procs = psResult.data;
        OS.writeLine(padRight('PID', 6) + padRight('STATUS', 10) + padRight('TYPE', 10) + 'APP');
        OS.writeLine('---   ------    --------  ---');
        for (var i = 0; i < procs.length; i++) {
            var p = procs[i];
            OS.writeLine(
                padRight(p.pid, 6) +
                padRight(p.status, 10) +
                padRight(p.type, 10) +
                p.appDefId
            );
        }
    } else if (cmd === 'kill') {
        if (args.length === 0) {
            OS.writeLine('Usage: kill <pid>');
            return;
        }
        var killPid = parseInt(args[0], 10);
        if (isNaN(killPid)) {
            OS.writeLine('Invalid PID: ' + args[0]);
            return;
        }
        var killResult = OS.killProcess(killPid);
        if (killResult.success) {
            OS.writeLine('Process ' + killPid + ' terminated.');
        } else {
            OS.writeLine('Failed: ' + (killResult.error || 'Unknown'));
        }
    } else if (cmd === 'apps') {
        var appsResult = OS.listApps();
        if (!appsResult.success) {
            OS.writeLine('Error: ' + (appsResult.error || 'Unknown'));
            return;
        }
        var appList = appsResult.data;
        OS.writeLine(padRight('NAME', 20) + padRight('TYPE', 10) + padRight('VER', 10) + 'PACKAGE');
        OS.writeLine('------------------  --------  --------  -------');
        for (var i = 0; i < appList.length; i++) {
            var a = appList[i];
            OS.writeLine(
                padRight(a.name, 20) +
                padRight(a.type, 10) +
                padRight(a.version, 10) +
                a.package
            );
        }
    } else if (cmd === 'launch') {
        var appName = args.join(' ');
        if (!appName) {
            OS.writeLine('Usage: launch <name|id>');
            return;
        }
        var launchResult = OS.launch(appName);
        if (launchResult.success) {
            OS.writeLine('Launching: ' + launchResult.data);
        } else {
            OS.writeLine('Failed: ' + (launchResult.error || 'Unknown'));
        }
    } else if (cmd === 'windows') {
        var winResult = OS.listWindows();
        if (!winResult.success) {
            OS.writeLine('Error: ' + (winResult.error || 'Unknown'));
            return;
        }
        var wins = winResult.data;
        if (wins.length === 0) {
            OS.writeLine('No windows open.');
        } else {
            OS.writeLine(padRight('TITLE', 25) + padRight('STATE', 12) + 'PROCESS');
            OS.writeLine('-----------------------  ----------  -------');
            for (var i = 0; i < wins.length; i++) {
                var w = wins[i];
                OS.writeLine(
                    padRight(w.title, 25) +
                    padRight(w.state, 12) +
                    w.processAppId
                );
            }
        }
    } else if (cmd === 'sysinfo') {
        var infoResult = OS.sysinfo();
        if (!infoResult.success) {
            OS.writeLine('Error: ' + (infoResult.error || 'Unknown'));
            return;
        }
        var info = infoResult.data;
        OS.writeLine('SentryOS System Information');
        OS.writeLine('  Uptime:      ' + info.uptime);
        OS.writeLine('  Processes:   ' + info.processes.running + ' running / ' + info.processes.total + ' total');
        OS.writeLine('  Windows:     ' + info.windows);
        OS.writeLine('  Libraries:   ' + info.libraries);
        OS.writeLine('  Commands:    ' + info.commands + ' registered');
        OS.writeLine('  Apps:        ' + info.apps + ' installed');
    } else if (cmd === 'exit') {
        OS.writeLine('Goodbye!');
        OS.terminateSelf();
    } else if (cmd === 'commands') {
        var cmdResult = OS.listCommands();
        if (!cmdResult.success) {
            OS.writeLine('Error: ' + (cmdResult.error || 'Unknown'));
            return;
        }
        var cmds = cmdResult.data;
        if (cmds.length === 0) {
            OS.writeLine('No commands registered.');
        } else {
            OS.writeLine(padRight('COMMAND', 16) + padRight('DESCRIPTION', 35) + 'LIBRARY');
            OS.writeLine('--------------  ---------------------------------  -------');
            for (var i = 0; i < cmds.length; i++) {
                var c = cmds[i];
                OS.writeLine(
                    padRight(c.name, 16) +
                    padRight(c.description, 35) +
                    c.libraryId
                );
            }
        }
    } else {
        // ── Auto-dispatch: resolve from command registry ──
        var resolved = OS.resolveCommand(cmd);
        if (resolved.success) {
            var cmdInfo = resolved.data;
            // Auto-load the library if handler not yet available
            if (!globalThis.__commands || typeof globalThis.__commands[cmd] !== 'function') {
                var lr = OS.loadLibrary(cmdInfo.libraryId);
                if (!lr.success) {
                    OS.writeLine('Failed to load library: ' + cmdInfo.libraryId);
                    return;
                }
            }
            if (globalThis.__commands && typeof globalThis.__commands[cmd] === 'function') {
                var output = globalThis.__commands[cmd](args);
                if (output !== undefined && output !== null) {
                    OS.writeLine(String(output));
                }
            } else {
                OS.writeLine('Command handler not found: ' + cmd);
            }
        } else {
            OS.writeLine('Unknown command: ' + cmd);
            OS.writeLine('Type "help" or "commands" for available commands.');
        }
    }
}