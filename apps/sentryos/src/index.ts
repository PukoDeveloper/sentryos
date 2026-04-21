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
//   });
//
// The host page is responsible for styling the container element
// (minimum: `width`, `height`, `position: relative` or `absolute`).
// SentryOS will fill the container completely.
// ─────────────────────────────────────────────────────────────────────────────

export { createSentryOS } from './bootstrap/systemBootstrap';
export type { SentryOSOptions, SentryOSInstance } from './bootstrap/systemBootstrap';
export type { PluginModule } from './plugin/PluginManager';
