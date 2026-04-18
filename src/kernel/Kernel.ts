import type { PermissionsManager } from '../permissions/PermissionsManager';
import type { EventBus } from '../events/EventBus';
import type { ApplicationManager } from '../application/ApplicationManager';
import type { ProcessManager } from '../process/ProcessManager';
import type { IRuntime } from '../runtime/IRuntime';
import type { RuntimeRegistry } from '../runtime/RuntimeRegistry';
import type { FileSystemAdapter } from '../storage/FileSystem';
import type { WindowManager } from '../window/WindowManager';
import type { EnvironmentManager } from '../environment/EnvironmentManager';
import type { NotificationManager } from '../notification/NotificationManager';
import type { SystemMonitor } from '../monitor/SystemMonitor';
import type { DesktopShell } from '../ui/DesktopShell';
import type { ApplicationLauncher } from '../application/ApplicationLauncher';
import type { SystemAlert } from '../notification/SystemAlert';
import type { KernelConsole } from '../console/KernelConsole';
import type { RegisteredApplication } from '../application/ApplicationCatalog';
import type { NetworkAdapter } from '../network/NetworkAdapter';
import type { SystemRegistry } from '../registry/SystemRegistry';
import type { DialogManager } from '../dialog/DialogManager';
import type { PluginManager } from '../plugin/PluginManager';
import type { LanguageManager } from '../language/LanguageManager';

export interface ServiceMap {
  permissions: PermissionsManager;
  eventBus: EventBus;
  appManager: ApplicationManager;
  processManager: ProcessManager;
  runtime: IRuntime;
  runtimeRegistry: RuntimeRegistry;
  fileSystem: FileSystemAdapter;
  windowManager: WindowManager;
  environmentManager: EnvironmentManager;
  notificationManager: NotificationManager;
  systemMonitor: SystemMonitor;
  desktopShell: DesktopShell;
  applicationLauncher: ApplicationLauncher;
  systemAlert: SystemAlert;
  kernelConsole: KernelConsole;
  networkManager: NetworkAdapter;
  systemRegistry: SystemRegistry;
  dialogManager: DialogManager;
  pluginManager: PluginManager;
  languageManager: LanguageManager;
}

export interface ValueMap {
  systemAppId: string;
  userAppId: string;
  bootStartTime: number;
  catalogApps: RegisteredApplication[];
  iconMap: Map<string, string>;
}

class Kernel {
  private readonly services = new Map<string, unknown>();
  private readonly values = new Map<string, unknown>();

  register<K extends keyof ServiceMap>(key: K, service: ServiceMap[K]): void {
    if (this.services.has(key)) {
      throw new Error(`Service "${key}" is already registered`);
    }
    this.services.set(key, service);
  }

  resolve<K extends keyof ServiceMap>(key: K): ServiceMap[K] {
    const service = this.services.get(key);
    if (!service) {
      throw new Error(`Service "${key}" is not registered`);
    }
    return service as ServiceMap[K];
  }

  has(key: keyof ServiceMap): boolean {
    return this.services.has(key);
  }

  set<K extends keyof ValueMap>(key: K, value: ValueMap[K]): void {
    this.values.set(key, value);
  }

  get<K extends keyof ValueMap>(key: K): ValueMap[K] {
    const value = this.values.get(key);
    if (value === undefined) {
      throw new Error(`Value "${key}" is not set`);
    }
    return value as ValueMap[K];
  }
}

export { Kernel };
