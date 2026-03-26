// ────────────────────────────────────────────────────────────
// EnvironmentManager — 自動啟動註冊、環境變數、程式庫快取、命令註冊表
// ────────────────────────────────────────────────────────────

interface CommandEntry {
    name: string;
    libraryId: string;
    description: string;
    usage?: string;
}

class EnvironmentManager {
    /** appDefId 集合，標記開機時自動啟動的應用程式 */
    private autoStartApps = new Set<string>();
    /** 環境變數 key → value */
    private variables = new Map<string, string>();
    /** libraryId → 原始碼快取 */
    private libraryCodeCache = new Map<string, string>();
    /** 命令名稱 → CommandEntry */
    private commandRegistry = new Map<string, CommandEntry>();

    // ── Auto-start ────────────────────────────────────

    registerAutoStart(appDefId: string): void {
        this.autoStartApps.add(appDefId);
    }

    unregisterAutoStart(appDefId: string): void {
        this.autoStartApps.delete(appDefId);
    }

    isAutoStart(appDefId: string): boolean {
        return this.autoStartApps.has(appDefId);
    }

    getAutoStartApps(): string[] {
        return Array.from(this.autoStartApps);
    }

    // ── Environment Variables ─────────────────────────

    setVariable(key: string, value: string): void {
        this.variables.set(key, value);
    }

    getVariable(key: string): string | undefined {
        return this.variables.get(key);
    }

    removeVariable(key: string): boolean {
        return this.variables.delete(key);
    }

    getAllVariables(): Record<string, string> {
        return Object.fromEntries(this.variables);
    }

    // ── Library Code Cache ────────────────────────────

    registerLibrary(libraryId: string, code: string): void {
        this.libraryCodeCache.set(libraryId, code);
    }

    getLibraryCode(libraryId: string): string | undefined {
        return this.libraryCodeCache.get(libraryId);
    }

    hasLibrary(libraryId: string): boolean {
        return this.libraryCodeCache.has(libraryId);
    }

    getLibraryIds(): string[] {
        return Array.from(this.libraryCodeCache.keys());
    }

    // ── Command Registry ─────────────────────────────────────

    registerCommand(name: string, entry: Omit<CommandEntry, 'name'>): void {
        this.commandRegistry.set(name, { name, ...entry });
    }

    getCommand(name: string): CommandEntry | undefined {
        return this.commandRegistry.get(name);
    }

    hasCommand(name: string): boolean {
        return this.commandRegistry.has(name);
    }

    getAllCommands(): CommandEntry[] {
        return Array.from(this.commandRegistry.values());
    }
}

export { EnvironmentManager, type CommandEntry };
