// ─────────────────────────────────────────────────────────────────────────────
// SentryOS — Library entry point
//
// Import this module when embedding SentryOS inside a host application:
//
//   import { createSentryOS } from 'sentryos';
//   import myPlugin from 'sentryos-plugin-example';
//
//   const instance = await createSentryOS({
//     container: document.getElementById('os-frame')!,
//     onRestart: () => instance.shutdown().then(() => createSentryOS({ ... })),
//     pluginInstances: [myPlugin],
//     system: {
//       appCatalogEntries: [],          // package mode: no built-in apps by default
//       enableBuiltinKernelConsole: false,
//     },
//   });
//
// The host page is responsible for styling the container element
// (minimum: `width`, `height`, `position: relative` or `absolute`).
// SentryOS will fill the container completely.
// ─────────────────────────────────────────────────────────────────────────────

export { createSentryOS } from './bootstrap/systemBootstrap';
export type { SentryOSOptions, SentryOSInstance } from './bootstrap/systemBootstrap';
export { DEFAULT_REGISTRY_ROLE_MAP, DEFAULT_REGISTRY_FILE_TYPE_MAP } from './bootstrap/systemBootstrap';
export type { PluginModule } from './plugin/PluginManager';

// ── Filesystem ────────────────────────────────────────────────────────────────
// Re-exported so that host applications can implement a custom FileSystemAdapter
// and pass it to `createSentryOS({ fileSystem: (kernel) => new MyAdapter(kernel) })`.
export { WebFileSystemAdapter } from './storage/FileSystem';
export type {
  FileSystemAdapter,
  FileSystemOptions,
  StorageTier,
  StorageData,
  StorageRecord,
  StorageEntry,
  StorageError,
  StorageResult,
  StorageUsage,
  WriteOptions,
} from './storage/FileSystem';

// ── Kernel ────────────────────────────────────────────────────────────────────
// Exported so that host applications can type factory parameters, e.g.
//   fileSystem: (kernel: Kernel) => FileSystemAdapter
export { Kernel } from './kernel/Kernel';
export type { ServiceMap, ValueMap } from './kernel/Kernel';
export { USER_DEFAULT_PERMISSIONS } from './kernel/constants';
