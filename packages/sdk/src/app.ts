// ─────────────────────────────────────────────────────────────
// SentryOS SDK — App Development Types
// 供在 QuickJS 沙箱中運行的應用程式使用的 OS.* API 型別定義
// ─────────────────────────────────────────────────────────────

import type { AppType, NotificationType, DialogMode, HttpMethod } from './types';

// ── App Manifest ────────────────────────────────────────────

export interface AppManifest {
  id: string;
  name: string;
  version: string;
  main: string;
  type: AppType;
  icon?: string;
  description?: string;
  permissions?: string[];
  maxInstances?: number;
  autoStart?: boolean;
  hidden?: boolean;
  engine?: string;
  commands?: Array<{ name: string; description: string; usage?: string }>;
}

export interface PackageManifest {
  name: string;
  description?: string;
  author?: string;
  apps: AppManifest[];
}

// ── OS.process ──────────────────────────────────────────────

export interface OsProcess {
  pid(): number;
  appId(): string;
  processAppId(): string;
  type(): AppType;
  parentPid(): number | null;
  exit(code?: number): void;
  spawn(appDefId: string, options?: { fileArgs?: Record<string, unknown> }): number;
  getChildren(): number[];
  terminate(pid: number): boolean;
}

// ── OS.event ────────────────────────────────────────────────

export interface OsEvent {
  subscribe(event: string, callback: (...args: unknown[]) => void): boolean;
  unsubscribe(event: string, callback: (...args: unknown[]) => void): boolean;
  emit(event: string, ...args: unknown[]): boolean;
}

// ── OS.ipc ──────────────────────────────────────────────────

export interface OsIpc {
  sendToParent(channel: string, payload: unknown): boolean;
  sendToChild(pid: number, channel: string, payload: unknown): boolean;
  broadcastChildren(channel: string, payload: unknown): number;
  receive(channel: string, callback: (payload: unknown, fromPid: number) => void): void;
}

// ── OS.service ──────────────────────────────────────────────

export interface OsService {
  publishHealth(status: Record<string, unknown>): boolean;
}

// ── OS.ui ───────────────────────────────────────────────────

export interface OsUi {
  createWindow(options: { title: string; width?: number; height?: number; x?: number; y?: number; useDefaultFrame?: boolean; alwaysOnTop?: boolean; resizable?: boolean; style?: Record<string, unknown> }): string | null;
  initialize(windowId: string, tree: unknown[], options?: { preserveScroll?: boolean }): boolean;
  update(windowId: string, nodeId: string, patch: Record<string, unknown>): boolean;
  remove(windowId: string, nodeId: string): boolean;
  append(windowId: string, parentId: string, nodes: unknown[]): boolean;
  setWindowStyle(windowId: string, style: Record<string, unknown>): boolean;
  close(windowId: string): boolean;
  minimize(windowId: string): boolean;
  maximize(windowId: string): boolean;
  restore(windowId: string): boolean;
  focus(windowId: string): boolean;
  showContextMenu(windowId: string, controlId: string, x: number, y: number, items: Array<{ id: string; label: string; danger?: boolean } | { separator: true }>): boolean;
  label(id: string, text: string, style?: Record<string, unknown>): Record<string, unknown>;
  button(id: string, text: string, style?: Record<string, unknown>): Record<string, unknown>;
  stack(id: string, children: unknown[], style?: Record<string, unknown>): Record<string, unknown>;
  panel(id: string, children: unknown[], style?: Record<string, unknown>): Record<string, unknown>;
  input(id: string, options?: { value?: string; placeholder?: string }, style?: Record<string, unknown>): Record<string, unknown>;
  textarea(id: string, options?: { value?: string; placeholder?: string; rows?: number }, style?: Record<string, unknown>): Record<string, unknown>;
  checkbox(id: string, options?: { checked?: boolean; label?: string }, style?: Record<string, unknown>): Record<string, unknown>;
  select(id: string, options: Array<{ value: string; label: string }>, style?: Record<string, unknown>): Record<string, unknown>;
  image(id: string, src: string, style?: Record<string, unknown>): Record<string, unknown>;
  separator(id: string, style?: Record<string, unknown>): Record<string, unknown>;
  progress(id: string, value: number, style?: Record<string, unknown>): Record<string, unknown>;
  list(id: string, children: unknown[], style?: Record<string, unknown>): Record<string, unknown>;
}

// ── OS.system ───────────────────────────────────────────────

export interface OsSystem {
  terminateProcess(processAppId: string): boolean;
}

// ── OS.storage ──────────────────────────────────────────────

export interface OsStorage {
  readFile(path: string): unknown;
  writeFile(path: string, data: unknown, options?: { overwrite?: boolean }): boolean;
  deleteFile(path: string): boolean;
  listFiles(path?: string): unknown[];
  fileExists(path: string): boolean;
  storageUsage(): { total: number; used: number; tiers: Record<string, { capacity: number; used: number }> };
}

// ── OS.env ──────────────────────────────────────────────────

export interface OsEnv {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): boolean;
  loadLibrary(libraryId: string): string | undefined;
  registerCommand(name: string, description: string, usage?: string): void;
}

// ── OS.console ──────────────────────────────────────────────

export interface OsConsole {
  writeLine(text: string): void;
  write(text: string): void;
  clear(): void;
}

// ── OS.shell ────────────────────────────────────────────────

export interface OsShell {
  listProcesses(): Array<{ pid: number; appDefId: string; processAppId: string; type: string; status: string }>;
  listApps(): Array<{ appId: string; name: string; type: string }>;
  listWindows(): Array<{ windowId: string; processAppId: string; title: string; state: string }>;
  launch(appDefId: string, options?: { fileArgs?: Record<string, unknown> }): boolean;
  sysinfo(): Record<string, unknown>;
  getCommands(): Array<{ name: string; description: string; usage?: string }>;
  getCommand(name: string): { name: string; description: string; usage?: string } | null;
}

// ── OS.notification ─────────────────────────────────────────

export interface OsNotification {
  notify(options: { title: string; body?: string; type?: NotificationType; duration?: number }): string;
  dismiss(id: string): void;
}

// ── OS.monitor ──────────────────────────────────────────────

export interface OsMonitor {
  snapshot(): Record<string, unknown>;
  eventStats(): Record<string, unknown>;
  apiStats(): Record<string, unknown>;
  permissionStats(): Record<string, unknown>;
}

// ── OS.settings ─────────────────────────────────────────────

export interface OsSettings {
  getTheme(): unknown;
  setTheme(theme: unknown): void;
  getShellMode(): 'desktop' | 'mobile';
  getNotificationSettings(): unknown;
  setNotificationSettings(settings: unknown): void;
  getLanguage(): string;
  setLanguage(locale: string): boolean;
  getInstalledApps(): unknown[];
  uninstallApp(appDefId: string): boolean;
}

// ── OS.network ──────────────────────────────────────────────

export interface OsNetwork {
  request(options: { url: string; method?: HttpMethod; headers?: Record<string, string>; body?: string; timeout?: number }): Promise<{ status: number; statusText: string; headers: Record<string, string>; body: string }>;
  getAllowlist(): Array<{ pattern: string; description?: string }>;
  addAllowlistEntry(pattern: string, description?: string): boolean;
  removeAllowlistEntry(pattern: string): boolean;
  getStatus(): { enabled: boolean; allowlistCount: number; totalRequests: number; blockedRequests: number };
}

// ── OS.registry ─────────────────────────────────────────────

export interface OsRegistry {
  setDefaultApp(role: string, appDefId: string): void;
  getDefaultApp(role: string): string | undefined;
  setFileTypeHandler(extension: string, appDefId: string, mimeType?: string): void;
  getFileTypeHandler(extension: string): { extension: string; appDefId: string; mimeType?: string } | undefined;
  getAllRoles(): Record<string, string>;
  getAllFileTypeHandlers(): Array<{ extension: string; appDefId: string; mimeType?: string }>;
}

// ── OS.dialog ───────────────────────────────────────────────

export interface OsDialog {
  pickFile(options?: { mode?: DialogMode; title?: string; extensions?: string[]; defaultPath?: string }): Promise<{ cancelled: boolean; path?: string; tier?: string; filename?: string }>;
}

// ── Complete OS Global ──────────────────────────────────────

export interface OsApi {
  process: OsProcess;
  event: OsEvent;
  ipc: OsIpc;
  service: OsService;
  ui: OsUi;
  system: OsSystem;
  storage: OsStorage;
  env: OsEnv;
  console: OsConsole;
  shell: OsShell;
  notification: OsNotification;
  monitor: OsMonitor;
  settings: OsSettings;
  network: OsNetwork;
  registry: OsRegistry;
  dialog: OsDialog;
}

// ── Global Callbacks ────────────────────────────────────────

export interface AppGlobals {
  onWindowEvent: ((event: { type: string; controlId?: string; value?: unknown; windowId?: string }) => void) | undefined;
  onWindowChange: ((event: { type: string; windowId: string; state: string; bounds?: { width: number; height: number; x: number; y: number } }) => void) | undefined;
  onConsoleInput: ((line: string) => void) | undefined;
  onKeyboardEvent: ((event: { type: string; key: string; code: string; shift: boolean; ctrl: boolean; alt: boolean; meta: boolean }) => void) | undefined;
  onFileOpen: ((fileInfo: { path: string; tier: string; filename: string; data: unknown }) => void) | undefined;
  onDialogResult: ((result: { dialogId: string; cancelled: boolean; path?: string; tier?: string; filename?: string }) => void) | undefined;
}
