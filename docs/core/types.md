# 共用型別定義

本文件彙整跨模組使用的 Result 型別與錯誤型別。

---

## 通用 Result

```typescript
type Result<DataT, ErrorT> = {
  success: boolean;
  data?: DataT;
  error?: ErrorT;
};
```

---

## EventBus

```typescript
type EventBusError = 'PermissionDenied' | 'EventNotFound' | 'UnknownError';
type EventBusResult = Result<any, EventBusError> & { success: boolean; error?: EventBusError };
```

---

## Permissions

```typescript
type PermissionError = 'PermissionDenied' | 'InvalidPermission' | 'NotInitialized' | 'UnknownError';
type PermissionResult = Result<any, PermissionError> & { success: boolean; error?: PermissionError };
```

---

## Process

```typescript
type ProcessError =
  | 'PermissionDenied'
  | 'AppNotFound'
  | 'MaxInstancesReached'
  | 'ParentNotFound'
  | 'NotFound'
  | 'UnknownError';
type ProcessResult = Result<number, ProcessError> & { success: boolean; error?: ProcessError };
```

---

## Storage

```typescript
type StorageError =
  | 'PermissionDenied' | 'NotFound' | 'AlreadyExists'
  | 'CapacityExceeded' | 'InvalidTier' | 'InvalidKey' | 'UnknownError';
type StorageResult<TData = unknown> = Result<TData, StorageError> & { success: boolean; error?: StorageError };
```

---

## WindowSystem

```typescript
type WindowSystemError =
  | 'PermissionDenied' | 'WindowNotFound' | 'NodeNotFound'
  | 'Closed' | 'InvalidOperation' | 'RateLimitExceeded';
type WindowSystemResult<TData = unknown> = { success: boolean; data?: TData; error?: WindowSystemError };
```

---

## ApplicationCatalog

```typescript
type ApplicationCatalogError = 'ManifestNotFound' | 'InvalidManifest' | 'LoadFailed';
type ApplicationCatalogResult<TData> = Result<TData, ApplicationCatalogError> & { success: boolean; error?: ApplicationCatalogError };
```

---

## Runtime

```typescript
type RuntimeError = 'ProcessNotFound' | 'ProcessNotRunning' | 'RuntimeError' | 'PermissionDenied' | 'InvalidTarget';
type RuntimeResult<T> = { success: boolean; data?: T; error?: RuntimeError };
```
