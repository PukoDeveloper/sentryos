import type { PermissionsManager } from './PermissionsManager';
import type { EventBus } from './EventBus';
import type { ApplicationManager } from './ApplicationManager';
import type { ProcessManager } from './ProcessManager';
import type { ScriptRuntime } from './runtime/ScriptRuntime';
import type { WebFileSystemAdapter } from './storage';
import type { WindowManager, ConsoleWindowController } from './window';
import type { EnvironmentManager } from './EnvironmentManager';
import type { NotificationManager } from './NotificationManager';
import type { SystemMonitor } from './SystemMonitor';
import type { ApplicationLauncher } from './ApplicationLauncher';
import type { DesktopShell } from '../ui/DesktopShell';
import type { RegisteredApplication } from './ApplicationCatalog';

export interface ServiceMap {
  permissions: PermissionsManager;
  eventBus: EventBus;
  appManager: ApplicationManager;
  processManager: ProcessManager;
  runtime: ScriptRuntime;
  fileSystem: WebFileSystemAdapter;
  windowManager: WindowManager;
  environmentManager: EnvironmentManager;
  notificationManager: NotificationManager;
  systemMonitor: SystemMonitor;
  desktopShell: DesktopShell;
  applicationLauncher: ApplicationLauncher;
}

export interface ValueMap {
  systemAppId: string;
  bootStartTime: number;
  catalogApps: RegisteredApplication[];
  iconMap: Map<string, string>;
  consoleControllers: Map<string, ConsoleWindowController>;
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
