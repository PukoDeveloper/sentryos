// ─────────────────────────────────────────────────────────────
// SentryOS SDK — Window & UI Types
// ─────────────────────────────────────────────────────────────

import type { WindowState } from './types';

// ── UI Node Types ───────────────────────────────────────────

export type WindowUiEventType = 'click' | 'change' | 'submit' | 'dblclick' | 'contextmenu' | 'contextmenu-select';

export interface WindowUiStyle {
  className?: string;
  background?: string;
  color?: string;
  padding?: string;
  gap?: string;
  borderRadius?: string;
  border?: string;
  fontSize?: string;
  fontWeight?: string;
  justifyContent?: string;
  alignItems?: string;
  flexDirection?: 'row' | 'column';
  width?: string;
  height?: string;
  overflow?: string;
  textAlign?: string;
  flex?: string;
  margin?: string;
  opacity?: string;
  cursor?: string;
  [key: string]: string | undefined;
}

export interface WindowUiNodeBase {
  id?: string;
  type: string;
  style?: WindowUiStyle;
  events?: WindowUiEventType[];
}

export type WindowUiNode = WindowUiNodeBase & Record<string, unknown>;

export interface WindowUiNodePatch {
  text?: string;
  value?: string | number | boolean;
  checked?: boolean;
  style?: WindowUiStyle;
  options?: Array<{ value: string; label: string }>;
  children?: WindowUiNode[];
  src?: string;
  placeholder?: string;
  label?: string;
  color?: string;
  rows?: number;
}

export interface WindowUiEvent {
  eventId: string;
  windowId: string;
  processAppId: string;
  type: WindowUiEventType;
  controlId?: string;
  value?: unknown;
  x?: number;
  y?: number;
}

// ── Render Context ──────────────────────────────────────────

export interface RenderContext {
  windowId: string;
  processAppId: string;
  renderChild(node: WindowUiNode): HTMLElement;
  bindEvent(controlId: string | undefined, type: string): (extra?: Partial<WindowUiEvent>) => void;
  registerNode(nodeId: string | undefined, element: HTMLElement): void;
  applyStyle(element: HTMLElement, style?: WindowUiStyle): void;
}

export interface UiComponentRenderer {
  render(node: WindowUiNode, ctx: RenderContext): HTMLElement;
  patch?(element: HTMLElement, patch: WindowUiNodePatch, ctx: RenderContext): boolean;
}

export type UiComponentApiBuilder = (...args: unknown[]) => Record<string, unknown>;

// ── Window Manager Types ────────────────────────────────────

export interface WindowBounds { width: number; height: number; x: number; y: number; }

export interface WindowStyle {
  background?: string; color?: string; borderRadius?: string; border?: string; boxShadow?: string;
  titlebar?: { background?: string; color?: string; borderBottom?: string; };
}

export interface InitializeUiOptions { preserveScroll?: boolean; }

export interface WindowInitOptions {
  title: string; width: number; height: number; x?: number; y?: number;
  useDefaultFrame?: boolean; alwaysOnTop?: boolean; resizable?: boolean; style?: WindowStyle;
}

export interface WindowLifecycleEvent {
  type: 'created' | 'closed' | 'minimized' | 'maximized' | 'restored' | 'focused' | 'resized';
  windowId: string; processAppId: string; title: string; state: WindowState; bounds?: WindowBounds;
}

export interface WindowProcessContext { processAppId: string; appDefId: string; appName: string; icon?: string; }

export interface ContextMenuItem { id: string; label: string; danger?: boolean; }
export interface ContextMenuSeparator { separator: true; }
export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

export interface ConsoleWindowController {
  windowId: string; appendLine(text: string): void; appendText(text: string): void; clear(): void;
}
