

const console = {
    log: function(...args) {
        OS.writeLine(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' '));
    }
}
export default console;