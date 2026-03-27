import type { ScriptRuntime } from '../core/ScriptRuntime';
import type { ApiDependencies } from './types';
import { registerUiApi } from './uiApi';
import { registerSystemApi } from './systemApi';
import { registerStorageApi } from './storageApi';
import { registerEnvApi } from './envApi';
import { registerConsoleApi } from './consoleApi';
import { registerShellApi } from './shellApi';
import { registerNotificationApi } from './notificationApi';
import { registerMonitorApi } from './monitorApi';

export function registerAllHostApis(runtime: ScriptRuntime, deps: ApiDependencies): void {
  registerUiApi(runtime, deps);
  registerSystemApi(runtime, deps);
  registerStorageApi(runtime, deps);
  registerEnvApi(runtime, deps);
  registerConsoleApi(runtime, deps);
  registerShellApi(runtime, deps);
  registerNotificationApi(runtime, deps);
  registerMonitorApi(runtime, deps);
}

export { type ApiDependencies, type LaunchContext } from './types';
