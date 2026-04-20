// ─────────────────────────────────────────────────────────────
// SentryOS SDK — Runtime & API Types
// ─────────────────────────────────────────────────────────────

import type { AppType } from './types';

// ── Process View ────────────────────────────────────────────

export interface ProcessView {
  pid: number;
  appDefId: string;
  processAppId: string;
  type: AppType;
  parentPid: number | null;
  status: 'running' | 'stopped' | 'suspended';
  children: Set<number>;
}

// ── API Factory ─────────────────────────────────────────────

export interface ApiFactoryContext {
  pid: number;
  process: ProcessView;
}

export type HostApiValue =
  | string | number | boolean | null | undefined
  | HostApiValue[]
  | { [k: string]: HostApiValue }
  | ((...args: unknown[]) => unknown);

export type ApiFactory = (ctx: ApiFactoryContext) => Record<string, HostApiValue>;

// ── IRuntime ────────────────────────────────────────────────

export interface RuntimeResult<T> {
  success: boolean;
  data?: T;
  error?: 'ProcessNotFound' | 'ProcessNotRunning' | 'RuntimeError' | 'PermissionDenied' | 'InvalidTarget';
}

export interface IRuntime {
  execute(pid: number, code: string, timeoutMs?: number, entryPath?: string): RuntimeResult<unknown>;
  evaluateInContext(pid: number, code: string): RuntimeResult<unknown>;
  destroyProcessRuntime(pid: number): void;
  destroyAll(): void;
  dispatchUiEvent(processAppId: string, event: Record<string, unknown>): RuntimeResult<unknown>;
  dispatchConsoleInput(processAppId: string, line: string): RuntimeResult<unknown>;
  dispatchKeyboardEvent(processAppId: string, event: Record<string, unknown>): RuntimeResult<unknown>;
  dispatchFileOpen(processAppId: string, fileInfo: Record<string, unknown>): RuntimeResult<unknown>;
  dispatchDialogResult(processAppId: string, result: Record<string, unknown>): RuntimeResult<unknown>;
}

// ── RuntimeAdapter ──────────────────────────────────────────

export interface RuntimeAdapter {
  createSandbox(pid: number): unknown;
  injectGlobals(sandbox: unknown, apiSurface: Record<string, HostApiValue>): void;
  execute(sandbox: unknown, code: string, timeoutMs?: number): unknown;
  destroy(sandbox: unknown): void;
  callHandler(sandbox: unknown, handlerName: string, arg: unknown): unknown;
}

// ── BaseRuntime ─────────────────────────────────────────────

export declare abstract class BaseRuntime implements IRuntime {
  protected readonly kernel: unknown;
  protected readonly processStates: Map<number, unknown>;

  constructor(kernel: unknown);

  abstract execute(pid: number, code: string, timeoutMs?: number, entryPath?: string): RuntimeResult<unknown>;
  abstract evaluateInContext(pid: number, code: string): RuntimeResult<unknown>;
  abstract destroyProcessRuntime(pid: number): void;
  abstract destroyAll(): void;

  dispatchUiEvent(processAppId: string, event: Record<string, unknown>): RuntimeResult<unknown>;
  dispatchConsoleInput(processAppId: string, line: string): RuntimeResult<unknown>;
  dispatchKeyboardEvent(processAppId: string, event: Record<string, unknown>): RuntimeResult<unknown>;
  dispatchFileOpen(processAppId: string, fileInfo: Record<string, unknown>): RuntimeResult<unknown>;
  dispatchDialogResult(processAppId: string, result: Record<string, unknown>): RuntimeResult<unknown>;

  protected invokeHandler(pid: number, handlerName: string, arg: unknown): RuntimeResult<unknown>;
  protected buildApiSurface(process: ProcessView): Record<string, HostApiValue>;
  protected normalizeReturnValue(value: unknown): HostApiValue;
  protected getProcess(pid: number): ProcessView | undefined;
}
