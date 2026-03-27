import type PermissionsManager from '../core/PermissionsManager';
import type EventBus from '../core/EventBus';
import type { ApplicationManager, ProcessManager } from '../core/App';
import type { ScriptRuntime } from '../core/ScriptRuntime';
import type { WebFileSystemAdapter } from '../core/storage';
import type { WindowManager, ConsoleWindowController } from '../core/WindowSystem';
import type { EnvironmentManager } from '../core/EnvironmentManager';
import type { NotificationManager } from '../core/NotificationManager';
import type { SystemMonitor } from '../core/SystemMonitor';
import type { RegisteredApplication } from '../core/ApplicationCatalog';
import type { AppType } from '../core/constants';

export interface LaunchContext {
  app: RegisteredApplication;
  type: AppType;
}

export interface ApiDependencies {
  systemAppId: string;
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
  catalogApps: RegisteredApplication[];
  iconMap: Map<string, string>;
  bootStartTime: number;
  consoleControllers: Map<string, ConsoleWindowController>;
  terminateApplication: (processAppId: string, reason: string) => void;
  launchApplication: (context: LaunchContext) => Promise<void>;
}
