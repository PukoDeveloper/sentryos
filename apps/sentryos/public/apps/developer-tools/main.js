import console from "./test.api.js";

function traverseObject(obj, depth = 0) {
  const indent = "  ".repeat(depth); // 根據層級產生縮排

  for (let key in obj) {
    const value = obj[key];
    const type = typeof value;

    if (type === 'function') {
      // 顯示方法
      console.log(`${indent}[Method] ${key}: f()`);
    } else if (type === 'object' && value !== null) {
      // 顯示物件層級並遞歸
      console.log(`\x1b[38;2;0;255;0m${indent}[Node] ${key}:\x1b[0m`);
      traverseObject(value, depth + 1);
    } else {
      // 顯示基本數值
      console.log(`${indent}[Property] ${key}: ${value} (${type})`);
    }
  }
}

var _loadResult = OS.env.loadLibrary('stdlib/UI Utils');
if (!_loadResult.success) {
  throw new Error('Failed to load UI library: ' + (_loadResult.error || 'Unknown'));
}

var app = UI.createApp({
    title: 'Developer Tools',
    width: 800,
    height: 600,
    render: function (state, self) {
        return OS.ui.code_editor({id: 'editor', language: 'javascript', value: '// Developer Tools\n\nconsole.log("Hello, SentryOS!");'});
    }
})

traverseObject(globalThis);