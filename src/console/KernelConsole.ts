// ────────────────────────────────────────────────────────────
// KernelConsole — 內核級控制台
// ────────────────────────────────────────────────────────────
// 將控制台命令解譯從沙盒 App 層提升到內核層，
// 所有命令以 userAppId 的權限執行，不再受限於 App 的 manifest。
// 仍保留 QuickJS 用於 eval 與動態程式庫命令。

import type { Kernel } from '../kernel/Kernel';
import type { ConsoleWindowController } from '../window/types';
import { Permissions, BUILTIN_KERNEL_CONSOLE } from '../kernel/constants';

// ── Types ───────────────────────────────────────────────────

export interface ConsoleSession {
  id: string;
  processAppId: string;
  pid: number;
  controller: ConsoleWindowController;
}

export type CommandHandler = (ctx: CommandContext) => void;

export interface CommandContext {
  /** 命令參數（不含命令名稱本身） */
  args: string[];
  /** 原始輸入字串 */
  raw: string;
  /** 寫入一行文字（含換行） */
  writeLine: (text: string) => void;
  /** 寫入文字（不換行，附加至目前行尾） */
  write: (text: string) => void;
  /** 清除主控台輸出 */
  clear: () => void;
  /** 目前 session 資訊 */
  session: ConsoleSession;
}

// ── Helpers ─────────────────────────────────────────────────

function padRight(s: string, len: number): string {
  while (s.length < len) s += ' ';
  return s;
}

// ── KernelConsole ───────────────────────────────────────────

class KernelConsole {
  private readonly kernel: Kernel;
  private readonly sessions = new Map<string, ConsoleSession>();
  private readonly commands = new Map<string, CommandHandler>();
  private nextId = 1;

  constructor(kernel: Kernel) {
    this.kernel = kernel;
    this.registerBuiltinCommands();
  }

  // ── Kernel accessors ────────────────────────────────────

  private get userAppId() { return this.kernel.get('userAppId'); }
  private get permissions() { return this.kernel.resolve('permissions'); }
  private get processManager() { return this.kernel.resolve('processManager'); }
  private get windowManager() { return this.kernel.resolve('windowManager'); }
  private get environmentManager() { return this.kernel.resolve('environmentManager'); }
  private get launcher() { return this.kernel.resolve('applicationLauncher'); }
  private get runtime() { return this.kernel.resolve('runtime'); }

  // ── Session lifecycle ───────────────────────────────────

  /** 建立新的控制台 session 並附加到 process 的視窗控制器 */
  openSession(processAppId: string, pid: number, controller: ConsoleWindowController): string {
    const id = `kconsole_${this.nextId++}`;
    const session: ConsoleSession = { id, processAppId, pid, controller };
    this.sessions.set(id, session);

    controller.appendLine('=== SentryOS Terminal ===');
    controller.appendLine('Type "help" for available commands.');
    controller.appendLine('');

    return id;
  }

  /** 關閉 session（依 processAppId 查詢） */
  closeSessionByProcess(processAppId: string): void {
    for (const [id, session] of this.sessions) {
      if (session.processAppId === processAppId) {
        this.sessions.delete(id);
        return;
      }
    }
  }

  /** 處理來自控制台視窗的使用者輸入 */
  handleInput(sessionId: string, line: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const input = line.trim();
    if (!input) return;

    const parts = input.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    const handler = this.commands.get(cmd);
    if (handler) {
      handler(this.createContext(session, args, input));
    } else {
      this.dispatchDynamicCommand(session, cmd, args);
    }
  }

  // ── Command registration ────────────────────────────────

  /** 註冊自訂命令（供外部模組使用） */
  registerCommand(name: string, handler: CommandHandler): void {
    this.commands.set(name.toLowerCase(), handler);
  }

  // ── Private helpers ─────────────────────────────────────

  private createContext(session: ConsoleSession, args: string[], raw: string): CommandContext {
    return {
      args,
      raw,
      writeLine: (text) => session.controller.appendLine(text),
      write: (text) => session.controller.appendText(text),
      clear: () => session.controller.clear(),
      session,
    };
  }

  /** 嘗試從環境管理器的命令註冊表解析動態命令 */
  private dispatchDynamicCommand(session: ConsoleSession, cmd: string, args: string[]): void {
    const entry = this.environmentManager.getCommand(cmd);
    if (!entry) {
      session.controller.appendLine('Unknown command: ' + cmd);
      session.controller.appendLine('Type "help" or "commands" for available commands.');
      return;
    }

    // 確保程式庫已載入到 QuickJS context
    const source = this.environmentManager.getLibraryCode(entry.libraryId);
    if (source) {
      // 先嘗試載入（如果已載入，QuickJS 會跳過重複宣告）
      this.runtime.execute(session.pid, source);
    }

    // 在 QuickJS context 中呼叫命令處理函式
    const argsJson = JSON.stringify(args);
    const escapedCmd = cmd.replace(/'/g, "\\'");
    const code = `(function(){
      if(globalThis.__commands && typeof globalThis.__commands['${escapedCmd}']==='function'){
        var _r=globalThis.__commands['${escapedCmd}'](${argsJson});
        return _r!==undefined&&_r!==null?String(_r):'';
      }
      return '__CMD_NOT_FOUND__';
    })()`;

    const result = this.runtime.execute(session.pid, code);
    if (result.success) {
      if (result.data === '__CMD_NOT_FOUND__') {
        session.controller.appendLine('Command handler not found: ' + cmd);
      } else if (result.data) {
        session.controller.appendLine(String(result.data));
      }
    } else {
      session.controller.appendLine('Error: ' + String(result.data ?? result.error));
    }
  }

  // ── Permission check helper ────────────────────────────

  private checkPermission(ctx: CommandContext, permission: string): boolean {
    if (this.permissions.has(this.userAppId, permission)) return true;
    ctx.writeLine('Permission denied: ' + permission);
    return false;
  }

  // ── Built-in commands ──────────────────────────────────

  private registerBuiltinCommands(): void {
    this.commands.set('help', (ctx) => {
      ctx.writeLine('Application commands:');
      ctx.writeLine('  help              - Show this help message');
      ctx.writeLine('  echo <msg>        - Echo a message');
      ctx.writeLine('  clear             - Clear the console');
      ctx.writeLine('  eval <expr>       - Evaluate a JavaScript expression');
      ctx.writeLine('  exit              - Terminate this terminal');
      ctx.writeLine('');
      ctx.writeLine('Library commands:');
      ctx.writeLine('  libs              - List available libraries');
      ctx.writeLine('  load <lib>        - Load a library into this session');
      ctx.writeLine('');
      ctx.writeLine('System commands:');
      ctx.writeLine('  ps                - List running processes');
      ctx.writeLine('  kill <pid>        - Terminate a process');
      ctx.writeLine('  apps              - List installed applications');
      ctx.writeLine('  launch <name|id>  - Launch an application');
      ctx.writeLine('  windows           - List open windows');
      ctx.writeLine('  sysinfo           - Show system information');
      ctx.writeLine('  commands          - List registered CLI commands');
      ctx.writeLine('');
      ctx.writeLine('CLI commands from libraries can be invoked directly.');
      ctx.writeLine('Example: factorial 10, reverse hello');
    });

    this.commands.set('echo', (ctx) => {
      ctx.writeLine(ctx.args.join(' '));
    });

    this.commands.set('clear', (ctx) => {
      ctx.clear();
    });

    this.commands.set('exit', (ctx) => {
      ctx.writeLine('Goodbye!');
      setTimeout(() => this.launcher.terminateApplication(ctx.session.processAppId, 'User exit'), 0);
    });

    // ── eval ────────────────────────────────────────────

    this.commands.set('eval', (ctx) => {
      const expr = ctx.args.join(' ');
      if (!expr) { ctx.writeLine('Usage: eval <expression>'); return; }
      const result = this.runtime.execute(ctx.session.pid, expr);
      if (result.success) {
        ctx.writeLine(String(result.data));
      } else {
        ctx.writeLine('Error: ' + String(result.data ?? result.error));
      }
    });

    // ── Library commands ────────────────────────────────

    this.commands.set('libs', (ctx) => {
      if (!this.checkPermission(ctx, Permissions.ENV_READ)) return;
      const ids = this.environmentManager.getLibraryIds();
      if (ids.length === 0) {
        ctx.writeLine('No libraries available.');
      } else {
        ctx.writeLine('Available libraries (' + ids.length + '):');
        for (const id of ids) ctx.writeLine('  ' + id);
      }
    });

    this.commands.set('load', (ctx) => {
      if (!this.checkPermission(ctx, Permissions.ENV_LOAD_LIBRARY)) return;
      const libId = ctx.args.join(' ');
      if (!libId) { ctx.writeLine('Usage: load <library-id>'); return; }
      const source = this.environmentManager.getLibraryCode(libId);
      if (!source) { ctx.writeLine('Library not found: ' + libId); return; }
      const result = this.runtime.execute(ctx.session.pid, source);
      if (result.success) {
        ctx.writeLine('Library loaded: ' + libId);
      } else {
        ctx.writeLine('Failed: ' + String(result.data ?? result.error));
      }
    });

    // ── Process commands ────────────────────────────────

    this.commands.set('ps', (ctx) => {
      if (!this.checkPermission(ctx, Permissions.PROCESS_LIST)) return;
      const procs = this.processManager.getAllProcesses();
      ctx.writeLine(padRight('PID', 6) + padRight('STATUS', 10) + padRight('TYPE', 10) + 'APP');
      ctx.writeLine('---   ------    --------  ---');
      for (const p of procs) {
        ctx.writeLine(
          padRight(String(p.pid), 6) +
          padRight(p.status, 10) +
          padRight(p.type, 10) +
          p.appDefId
        );
      }
    });

    this.commands.set('kill', (ctx) => {
      if (!this.checkPermission(ctx, Permissions.PROCESS_TERMINATE)) return;
      if (ctx.args.length === 0) { ctx.writeLine('Usage: kill <pid>'); return; }
      const targetPid = parseInt(ctx.args[0], 10);
      if (isNaN(targetPid)) { ctx.writeLine('Invalid PID: ' + ctx.args[0]); return; }
      const target = this.processManager.get(targetPid);
      if (!target) { ctx.writeLine('Process not found: ' + targetPid); return; }
      const reason = target.pid === ctx.session.pid
        ? 'Self-terminated via shell'
        : `Killed by console session via shell`;
      setTimeout(() => this.launcher.terminateApplication(target.processAppId, reason), 0);
      ctx.writeLine('Process ' + targetPid + ' terminated.');
    });

    // ── App commands ────────────────────────────────────

    this.commands.set('apps', (ctx) => {
      if (!this.checkPermission(ctx, Permissions.SHELL_LIST_APPS)) return;
      const catalogApps = this.kernel.get('catalogApps');
      ctx.writeLine(padRight('NAME', 20) + padRight('TYPE', 10) + padRight('VER', 10) + 'PACKAGE');
      ctx.writeLine('------------------  --------  --------  -------');
      for (const a of catalogApps) {
        ctx.writeLine(
          padRight(a.name, 20) +
          padRight(a.runtimeType, 10) +
          padRight(a.version, 10) +
          a.packageName
        );
      }
    });

    this.commands.set('launch', (ctx) => {
      if (!this.checkPermission(ctx, Permissions.SHELL_LAUNCH)) return;
      const name = ctx.args.join(' ');
      if (!name) { ctx.writeLine('Usage: launch <name|id>'); return; }
      const catalogApps = this.kernel.get('catalogApps');
      const app = catalogApps.find(a => a.appId === name || a.name === name);
      if (!app) { ctx.writeLine('App not found: ' + name); return; }
      if (app.runtimeType === 'Library') { ctx.writeLine('Cannot launch a library'); return; }
      if (app.appId === BUILTIN_KERNEL_CONSOLE) {
        this.launcher.launchKernelConsole(BUILTIN_KERNEL_CONSOLE, app.name, app.icon);
      } else {
        this.launcher.launchApplication({ app, type: app.runtimeType });
      }
      ctx.writeLine('Launching: ' + app.name);
    });

    // ── Window commands ─────────────────────────────────

    this.commands.set('windows', (ctx) => {
      if (!this.checkPermission(ctx, Permissions.SHELL_WINDOWS)) return;
      const wins = this.windowManager.getOpenWindowSummaries();
      if (wins.length === 0) {
        ctx.writeLine('No windows open.');
      } else {
        ctx.writeLine(padRight('TITLE', 25) + padRight('STATE', 12) + 'PROCESS');
        ctx.writeLine('-----------------------  ----------  -------');
        for (const w of wins) {
          ctx.writeLine(
            padRight(w.title, 25) +
            padRight(w.state, 12) +
            w.processAppId
          );
        }
      }
    });

    // ── System info ─────────────────────────────────────

    this.commands.set('sysinfo', (ctx) => {
      if (!this.checkPermission(ctx, Permissions.SHELL_SYSINFO)) return;
      const allProcs = this.processManager.getAllProcesses();
      const running = allProcs.filter(p => p.status === 'running').length;
      const windows = this.windowManager.getOpenWindowSummaries().length;
      const libs = this.environmentManager.getLibraryIds();
      const cmds = this.environmentManager.getAllCommands();
      const bootStartTime = this.kernel.get('bootStartTime');
      const catalogApps = this.kernel.get('catalogApps');
      const uptimeMs = Date.now() - bootStartTime;
      const uptimeSec = Math.floor(uptimeMs / 1000);
      const uptimeMin = Math.floor(uptimeSec / 60);
      const uptimeH = Math.floor(uptimeMin / 60);
      const uptime = uptimeH > 0
        ? `${uptimeH}h ${uptimeMin % 60}m ${uptimeSec % 60}s`
        : uptimeMin > 0
          ? `${uptimeMin}m ${uptimeSec % 60}s`
          : `${uptimeSec}s`;

      ctx.writeLine('SentryOS System Information');
      ctx.writeLine('  Uptime:      ' + uptime);
      ctx.writeLine('  Processes:   ' + running + ' running / ' + allProcs.length + ' total');
      ctx.writeLine('  Windows:     ' + windows);
      ctx.writeLine('  Libraries:   ' + libs.length);
      ctx.writeLine('  Commands:    ' + cmds.length + ' registered');
      ctx.writeLine('  Apps:        ' + catalogApps.length + ' installed');
    });

    // ── Command registry ────────────────────────────────

    this.commands.set('commands', (ctx) => {
      const cmds = this.environmentManager.getAllCommands();
      if (cmds.length === 0) {
        ctx.writeLine('No commands registered.');
      } else {
        ctx.writeLine(padRight('COMMAND', 16) + padRight('DESCRIPTION', 35) + 'LIBRARY');
        ctx.writeLine('--------------  ---------------------------------  -------');
        for (const c of cmds) {
          ctx.writeLine(
            padRight(c.name, 16) +
            padRight(c.description, 35) +
            c.libraryId
          );
        }
      }
    });
  }
}

export { KernelConsole };
