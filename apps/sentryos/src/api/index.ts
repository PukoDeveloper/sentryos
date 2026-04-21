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
import { registerRegistryApi } from './registryApi';
import { registerDialogApi } from './dialogApi';
import { registerInstallApi } from './installApi';
import { registerClipboardApi } from './clipboardApi';
import { registerAudioApi } from './audioApi';
import { registerRuntimeApi } from './runtimeApi';
import { registerIntrospectApi } from './introspectApi';

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
  registerRegistryApi(kernel);
  registerDialogApi(kernel);
  registerInstallApi(kernel);
  registerClipboardApi(kernel);
  registerAudioApi(kernel);
  registerRuntimeApi(kernel);
  registerIntrospectApi(kernel);
}
