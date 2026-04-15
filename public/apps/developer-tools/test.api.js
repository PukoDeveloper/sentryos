

const console = {
    log: function(...args) {
        OS.console.writeLine(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' '));
    }
}
export default console;