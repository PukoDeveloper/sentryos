function t(n) {
  console.log("Setting up Monaco Editor plugin with config:", n);
}
function e(n) {
  console.log("Tearing down Monaco Editor plugin with config:", n);
}
const o = {
  pluginName: "monaco-editor",
  pluginVersion: "0.0.1",
  pluginDescription: "A plugin that integrates the Monaco Editor into SentryOS.",
  author: "SentryOS Team",
  setup: t,
  teardown: e
};
export {
  o as default
};
