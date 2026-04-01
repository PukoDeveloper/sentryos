
OS.writeLine('Developer Tools Process Info:');

const result = OS.listProcesses();

if (result.success) {
    const processes = result.data;
    // OS.writeLine(JSON.stringify(processes));
    for (var i = 0; i < processes.length; i++) {
        var p = processes[i];
        OS.writeLine(p.appName);
    }
}
else {
    OS.writeLine('Failed to list processes: ' + (result.error || 'Unknown error'));
}
