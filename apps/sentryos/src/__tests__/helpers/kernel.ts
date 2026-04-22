/**
 * Test helpers — creates minimal Kernel stubs for unit testing core services.
 *
 * Most core modules depend on Kernel only to resolve 'permissions' and
 * optionally 'systemMonitor'.  This helper wires those up with real
 * instances so tests exercise actual logic without needing a full boot.
 */

import { Kernel } from '../../kernel/Kernel';
import { PermissionsManager } from '../../permissions/PermissionsManager';

/**
 * Build a Kernel that has PermissionsManager registered and fully initialized.
 * The returned `systemAppId` has WILDCARD (*) permissions.
 */
export function buildKernelWithPermissions(): { kernel: Kernel; systemAppId: string } {
  const kernel = new Kernel();
  const permissions = new PermissionsManager(kernel);
  kernel.register('permissions', permissions);

  const result = permissions.init();
  if (!result.success || !result.data) {
    throw new Error('PermissionsManager.init() failed during test setup');
  }
  const systemAppId = result.data as string;

  return { kernel, systemAppId };
}

/**
 * Build a Kernel with PermissionsManager + a no-op SystemMonitor stub.
 * The stub records nothing but satisfies Kernel.has('systemMonitor') checks.
 */
export function buildKernelWithMonitor(): { kernel: Kernel; systemAppId: string } {
  const { kernel, systemAppId } = buildKernelWithPermissions();

  // Minimal stub — only the methods PermissionsManager / EventBus call
  const monitorStub = {
    recordPermissionCheck: () => undefined,
    recordEventSubscribe: () => undefined,
    recordEventUnsubscribe: () => undefined,
    recordEventEmit: () => undefined,
  };
  // SystemMonitor has many methods; cast via unknown to avoid listing them all
  kernel.register(
    'systemMonitor',
    monitorStub as unknown as Parameters<typeof kernel.register<'systemMonitor'>>[1],
  );

  return { kernel, systemAppId };
}
