// Terminal — SentryOS terminal application

OS.console.writeLine('=== SentryOS Terminal ===');
OS.console.writeLine('Type "help" for available commands.');
OS.console.writeLine('');

function onKeyboardEvent(e) {
    OS.console.writeLine('Key event: ' + e.type + ' - ' + e.key);
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
        OS.console.writeLine('Application commands:');
        OS.console.writeLine('  help              - Show this help message');
        OS.console.writeLine('  echo <msg>        - Echo a message');
        OS.console.writeLine('  clear             - Clear the console');
        OS.console.writeLine('  eval <expr>       - Evaluate a JavaScript expression');
        OS.console.writeLine('  exit              - Terminate this app');
        OS.console.writeLine('');
        OS.console.writeLine('Library commands:');
        OS.console.writeLine('  libs              - List available libraries');
        OS.console.writeLine('  load <lib>        - Load a library into this session');
        OS.console.writeLine('');
        OS.console.writeLine('System commands:');
        OS.console.writeLine('  ps                - List running processes');
        OS.console.writeLine('  kill <pid>        - Terminate a process');
        OS.console.writeLine('  apps              - List installed applications');
        OS.console.writeLine('  launch <name|id>  - Launch an application');
        OS.console.writeLine('  windows           - List open windows');
        OS.console.writeLine('  sysinfo           - Show system information');
        OS.console.writeLine('  commands          - List registered CLI commands');
        OS.console.writeLine('');
        OS.console.writeLine('CLI commands from libraries can be invoked directly.');
        OS.console.writeLine('Example: factorial 10, reverse hello');
    } else if (cmd === 'echo') {
        OS.console.writeLine(args.join(' '));
    } else if (cmd === 'clear') {
        OS.console.clear();
    } else if (cmd === 'libs') {
        var result = OS.env.listLibraries();
        if (!result.success) {
            OS.console.writeLine('Error: ' + (result.error || 'Unknown'));
            return;
        }
        var ids = result.data;
        if (ids.length === 0) {
            OS.console.writeLine('No libraries available.');
        } else {
            OS.console.writeLine('Available libraries (' + ids.length + '):');
            for (var i = 0; i < ids.length; i++) {
                OS.console.writeLine('  ' + ids[i]);
            }
        }
    } else if (cmd === 'load') {
        var libId = args.join(' ');
        if (!libId) {
            OS.console.writeLine('Usage: load <library-id>');
            return;
        }
        var loadResult = OS.env.loadLibrary(libId);
        if (loadResult.success) {
            OS.console.writeLine('Library loaded: ' + libId);
        } else {
            OS.console.writeLine('Failed: ' + (loadResult.error || 'Unknown'));
        }
    } else if (cmd === 'eval') {
        var expr = args.join(' ');
        if (!expr) {
            OS.console.writeLine('Usage: eval <expression>');
            return;
        }
        try {
            var evalResult = eval(expr);
            OS.console.writeLine(String(evalResult));
        } catch (e) {
            OS.console.writeLine('Error: ' + e.message);
        }
    } else if (cmd === 'ps') {
        var psResult = OS.shell.listProcesses();
        if (!psResult.success) {
            OS.console.writeLine('Error: ' + (psResult.error || 'Unknown'));
            return;
        }
        var procs = psResult.data;
        OS.console.writeLine(padRight('PID', 6) + padRight('STATUS', 10) + padRight('TYPE', 10) + 'APP');
        OS.console.writeLine('---   ------    --------  ---');
        for (var i = 0; i < procs.length; i++) {
            var p = procs[i];
            OS.console.writeLine(
                padRight(p.pid, 6) +
                padRight(p.status, 10) +
                padRight(p.type, 10) +
                p.appDefId
            );
        }
    } else if (cmd === 'kill') {
        if (args.length === 0) {
            OS.console.writeLine('Usage: kill <pid>');
            return;
        }
        var killPid = parseInt(args[0], 10);
        if (isNaN(killPid)) {
            OS.console.writeLine('Invalid PID: ' + args[0]);
            return;
        }
        var killResult = OS.shell.killProcess(killPid);
        if (killResult.success) {
            OS.console.writeLine('Process ' + killPid + ' terminated.');
        } else {
            OS.console.writeLine('Failed: ' + (killResult.error || 'Unknown'));
        }
    } else if (cmd === 'apps') {
        var appsResult = OS.shell.listApps();
        if (!appsResult.success) {
            OS.console.writeLine('Error: ' + (appsResult.error || 'Unknown'));
            return;
        }
        var appList = appsResult.data;
        OS.console.writeLine(padRight('NAME', 20) + padRight('TYPE', 10) + padRight('VER', 10) + 'PACKAGE');
        OS.console.writeLine('------------------  --------  --------  -------');
        for (var i = 0; i < appList.length; i++) {
            var a = appList[i];
            OS.console.writeLine(
                padRight(a.name, 20) +
                padRight(a.type, 10) +
                padRight(a.version, 10) +
                a.package
            );
        }
    } else if (cmd === 'launch') {
        var appName = args.join(' ');
        if (!appName) {
            OS.console.writeLine('Usage: launch <name|id>');
            return;
        }
        var launchResult = OS.shell.launch(appName);
        if (launchResult.success) {
            OS.console.writeLine('Launching: ' + launchResult.data);
        } else {
            OS.console.writeLine('Failed: ' + (launchResult.error || 'Unknown'));
        }
    } else if (cmd === 'windows') {
        var winResult = OS.shell.listWindows();
        if (!winResult.success) {
            OS.console.writeLine('Error: ' + (winResult.error || 'Unknown'));
            return;
        }
        var wins = winResult.data;
        if (wins.length === 0) {
            OS.console.writeLine('No windows open.');
        } else {
            OS.console.writeLine(padRight('TITLE', 25) + padRight('STATE', 12) + 'PROCESS');
            OS.console.writeLine('-----------------------  ----------  -------');
            for (var i = 0; i < wins.length; i++) {
                var w = wins[i];
                OS.console.writeLine(
                    padRight(w.title, 25) +
                    padRight(w.state, 12) +
                    w.processAppId
                );
            }
        }
    } else if (cmd === 'sysinfo') {
        var infoResult = OS.shell.sysinfo();
        if (!infoResult.success) {
            OS.console.writeLine('Error: ' + (infoResult.error || 'Unknown'));
            return;
        }
        var info = infoResult.data;
        OS.console.writeLine('SentryOS System Information');
        OS.console.writeLine('  Uptime:      ' + info.uptime);
        OS.console.writeLine('  Processes:   ' + info.processes.running + ' running / ' + info.processes.total + ' total');
        OS.console.writeLine('  Windows:     ' + info.windows);
        OS.console.writeLine('  Libraries:   ' + info.libraries);
        OS.console.writeLine('  Commands:    ' + info.commands + ' registered');
        OS.console.writeLine('  Apps:        ' + info.apps + ' installed');
    } else if (cmd === 'exit') {
        OS.console.writeLine('Goodbye!');
        OS.terminateSelf();
    } else if (cmd === 'commands') {
        var cmdResult = OS.shell.listCommands();
        if (!cmdResult.success) {
            OS.console.writeLine('Error: ' + (cmdResult.error || 'Unknown'));
            return;
        }
        var cmds = cmdResult.data;
        if (cmds.length === 0) {
            OS.console.writeLine('No commands registered.');
        } else {
            OS.console.writeLine(padRight('COMMAND', 16) + padRight('DESCRIPTION', 35) + 'LIBRARY');
            OS.console.writeLine('--------------  ---------------------------------  -------');
            for (var i = 0; i < cmds.length; i++) {
                var c = cmds[i];
                OS.console.writeLine(
                    padRight(c.name, 16) +
                    padRight(c.description, 35) +
                    c.libraryId
                );
            }
        }
    } else {
        // ── Auto-dispatch: resolve from command registry ──
        var resolved = OS.shell.resolveCommand(cmd);
        if (resolved.success) {
            var cmdInfo = resolved.data;
            // Auto-load the library if handler not yet available
            if (!globalThis.__commands || typeof globalThis.__commands[cmd] !== 'function') {
                var lr = OS.env.loadLibrary(cmdInfo.libraryId);
                if (!lr.success) {
                    OS.console.writeLine('Failed to load library: ' + cmdInfo.libraryId);
                    return;
                }
            }
            if (globalThis.__commands && typeof globalThis.__commands[cmd] === 'function') {
                var output = globalThis.__commands[cmd](args);
                if (output !== undefined && output !== null) {
                    OS.console.writeLine(String(output));
                }
            } else {
                OS.console.writeLine('Command handler not found: ' + cmd);
            }
        } else {
            OS.console.writeLine('Unknown command: ' + cmd);
            OS.console.writeLine('Type "help" or "commands" for available commands.');
        }
    }
}