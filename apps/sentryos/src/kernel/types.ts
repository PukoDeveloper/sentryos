
type Result<DataT, ErrorT> = {
    success: boolean;
    data?: DataT;
    error?: ErrorT;
}

type EventBusError = 'PermissionDenied' | 'EventNotFound' | 'MaxListenersReached' | 'UnknownError';

type EventBusResult = {
    success: boolean;
    error?: EventBusError;
} & Result<any, EventBusError>;

type PermissionError = 'PermissionDenied' | 'InvalidPermission' | 'NotInitialized' | 'AlreadyInitialized' | 'UnknownError';

type PermissionResult = {
    success: boolean;
    error?: PermissionError;
} & Result<any, PermissionError>;



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

export type {
    Result,
    EventBusResult,
    EventBusError,
    PermissionResult,
    PermissionError,
    ProcessError,
    ProcessResult,
}
