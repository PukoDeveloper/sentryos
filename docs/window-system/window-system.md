# 視窗系統

**型別定義**：`src/window/types.ts`

本文件描述視窗系統的所有型別定義。視窗管理邏輯請參考 [WindowManager](../core/window-manager.md)。

---

## WindowState

```typescript
type WindowState = 'normal' | 'minimized' | 'maximized' | 'closed';
```

---

## WindowCommand

```typescript
type WindowCommand = 'close' | 'maximize' | 'minimize' | 'focus' | 'restore';
```

---

## WindowInitOptions

```typescript
interface WindowInitOptions {
  title: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  useDefaultFrame?: boolean;   // 預設 true
  alwaysOnTop?: boolean;       // 預設 false
  resizable?: boolean;         // 預設 true
  style?: WindowStyle;
}
```

---

## WindowStyle

```typescript
interface WindowStyle {
  background?: string;
  color?: string;
  borderRadius?: string;
  border?: string;
  boxShadow?: string;
}
```

---

## WindowBounds

```typescript
interface WindowBounds {
  width: number;
  height: number;
  x: number;
  y: number;
}
```

---

## WindowDescriptor

```typescript
interface WindowDescriptor {
  id: string;
  processAppId: string;
  appDefId: string;
  title: string;
  state: WindowState;
  bounds: WindowBounds;
  useDefaultFrame: boolean;
  alwaysOnTop: boolean;
  resizable: boolean;
  zIndex: number;
  root: HTMLDivElement;
  frame: HTMLDivElement;
  content: HTMLDivElement;
  titleLabel: HTMLDivElement;
  style?: WindowStyle;
  icon?: string;
  stateBeforeMinimize?: WindowState;
}
```

---

## UI 控制項類型

```typescript
type WindowControlType =
  | 'label' | 'button' | 'stack' | 'panel'
  | 'input' | 'textarea' | 'checkbox' | 'select'
  | 'image' | 'separator' | 'progress' | 'list';
```

---

## WindowUiStyle

```typescript
interface WindowUiStyle {
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
  [key: string]: string | undefined;  // 允許任意 CSS 屬性
}
```

---

## WindowUiNode

所有 UI 節點共用基礎介面：

```typescript
interface WindowUiNodeBase {
  id?: string;
  type: WindowControlType;
  style?: WindowUiStyle;
  events?: WindowUiEventType[];
}
```

具體節點類型：

| 類型 | 專有屬性 |
|------|---------|
| `label` | `text` |
| `button` | `text`, `eventType?` |
| `panel` | `children?` |
| `stack` | `children?` |
| `input` | `value?`, `placeholder?` |
| `textarea` | `value?`, `placeholder?`, `rows?` |
| `checkbox` | `checked?`, `label?` |
| `select` | `options: {value, label}[]`, `value?` |
| `image` | `src`, `alt?` |
| `separator` | （無） |
| `progress` | `value`, `color?` |
| `list` | `children?` |

---

## WindowUiNodePatch

用於 `updateUi()` 的局部更新：

```typescript
interface WindowUiNodePatch {
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
```

---

## WindowUiEvent

```typescript
interface WindowUiEvent {
  eventId: string;
  windowId: string;
  processAppId: string;
  type: WindowUiEventType;   // 'click' | 'change' | 'submit' | 'dblclick' | 'contextmenu' | 'contextmenu-select'
  controlId?: string;
  value?: unknown;
  x?: number;                // contextmenu 的滑鼠座標
  y?: number;
}
```

---

## WindowLifecycleEvent

```typescript
interface WindowLifecycleEvent {
  type: 'created' | 'closed' | 'minimized' | 'maximized' | 'restored' | 'focused' | 'resized';
  windowId: string;
  processAppId: string;
  title: string;
  state: WindowState;
  bounds?: WindowBounds;
}
```

---

## ContextMenu

```typescript
interface ContextMenuItem { id: string; label: string; danger?: boolean; }
interface ContextMenuSeparator { separator: true; }
type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;
```

---

## 錯誤類型

```typescript
type WindowSystemError =
  | 'PermissionDenied'
  | 'WindowNotFound'
  | 'NodeNotFound'
  | 'Closed'
  | 'InvalidOperation'
  | 'RateLimitExceeded';
```
