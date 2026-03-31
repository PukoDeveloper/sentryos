import type { Kernel } from '../kernel/Kernel';
import { registerUiApi } from './uiApi';
import { registerSystemApi } from './systemApi';
import { registerStorageApi } from './storageApi';
import { registerEnvApi } from './envApi';
import { registerConsoleApi } from './consoleApi';
import { registerShellApi } from './shellApi';
import { registerNotificationApi } from './notificationApi';
import { registerMonitorApi } from './monitorApi';
import { registerSettingsApi } from './settingsApi';
import { registerNetworkApi } from './networkApi';

export function registerAllHostApis(kernel: Kernel): void {
  registerUiApi(kernel);
  registerSystemApi(kernel);
  registerStorageApi(kernel);
  registerEnvApi(kernel);
  registerConsoleApi(kernel);
  registerShellApi(kernel);
  registerNotificationApi(kernel);
  registerMonitorApi(kernel);
  registerSettingsApi(kernel);
  registerNetworkApi(kernel);
}
