// ─────────────────────────────────────────────────────────────
// SentryOS SDK — Core Result & Error Types
// ─────────────────────────────────────────────────────────────

export interface Result<DataT, ErrorT> {
  success: boolean;
  data?: DataT;
  error?: ErrorT;
}

// ── Error Types ─────────────────────────────────────────────

export type PermissionError = 'PermissionDenied' | 'InvalidPermission' | 'NotInitialized' | 'UnknownError';
export type PermissionResult = Result<unknown, PermissionError>;

export type ProcessError =
  | 'PermissionDenied' | 'AppNotFound' | 'MaxInstancesReached'
  | 'ParentNotFound' | 'NotFound' | 'UnknownError';
export type ProcessResult = Result<unknown, ProcessError>;

export type StorageTier = 'sys' | 'app' | 'user' | 'cache';
export type StorageError = 'PermissionDenied' | 'NotFound' | 'AlreadyExists' | 'CapacityExceeded' | 'InvalidTier' | 'InvalidKey' | 'UnknownError';
export type StorageResult<TData = unknown> = Result<TData, StorageError>;
export type StorageData = string | number | boolean | null | StorageData[] | { [key: string]: StorageData };

export interface StorageEntry<TData extends StorageData = StorageData> {
  key: string;
  tier: StorageTier;
  data: TData;
  createdAt: number;
  updatedAt: number;
}

export type WindowState = 'normal' | 'minimized' | 'maximized' | 'closed';
export type WindowSystemError = 'PermissionDenied' | 'WindowNotFound' | 'NodeNotFound' | 'Closed' | 'InvalidOperation' | 'RateLimitExceeded';
export type WindowSystemResult<TData = unknown> = Result<TData, WindowSystemError>;

export type NetworkError = 'PermissionDenied' | 'NotAllowed' | 'ConnectionFailed' | 'Timeout' | 'InvalidUrl' | 'Disabled' | 'UnknownError';
export type NetworkResult<T = unknown> = Result<T, NetworkError>;
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export type DialogMode = 'file' | 'folder' | 'save';
export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export type EventBusError = 'PermissionDenied' | 'EventNotFound' | 'UnknownError';
export interface EventBusResult {
  success: boolean;
  error?: EventBusError;
}

export type AppType = 'Service' | 'Window' | 'Console' | 'Library';
