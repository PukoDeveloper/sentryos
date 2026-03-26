# 共用型別

**檔案**：`src/core/types.ts`

定義所有核心元件共用的基礎型別。

---

## Result

所有核心操作的統一回傳格式：

```typescript
type Result<DataT, ErrorT> = {
  success: boolean;
  data?: DataT;
  error?: ErrorT;
};
```

---

## EventBusResult

```typescript
type EventBusError = 'PermissionDenied' | 'EventNotFound' | 'UnknownError';

type EventBusResult = {
  success: boolean;
  error?: EventBusError;
} & Result<any, EventBusError>;
```

---

## PermissionResult

```typescript
type PermissionError = 'PermissionDenied' | 'InvalidPermission' | 'NotInitialized' | 'UnknownError';

type PermissionResult = {
  success: boolean;
  error?: PermissionError;
} & Result<any, PermissionError>;
```

---

## ProcessResult

```typescript
type ProcessError =
  | 'PermissionDenied'
  | 'AppNotFound'
  | 'MaxInstancesReached'
  | 'ParentNotFound'
  | 'NotFound'
  | 'UnknownError';

type ProcessResult = {
  success: boolean;
  error?: ProcessError;
} & Result<number, ProcessError>;
```
