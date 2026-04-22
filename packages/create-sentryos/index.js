#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// SentryOS Scaffold CLI
// 快速為插件或應用程式建立開發環境骨架
// ─────────────────────────────────────────────────────────────

import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = resolve(__dirname, '../..');

// ── ANSI Colours ─────────────────────────────────────────────

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m',
  red:    '\x1b[31m',
  gray:   '\x1b[90m',
};

function bold(s)   { return `${C.bold}${s}${C.reset}`; }
function green(s)  { return `${C.green}${s}${C.reset}`; }
function yellow(s) { return `${C.yellow}${s}${C.reset}`; }
function cyan(s)   { return `${C.cyan}${s}${C.reset}`; }
function gray(s)   { return `${C.gray}${s}${C.reset}`; }
function red(s)    { return `${C.red}${s}${C.reset}`; }

// ── Helpers ───────────────────────────────────────────────────

function writeFile(filePath, content) {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, content, 'utf8');
  console.log(`  ${green('✓')} ${gray(filePath.replace(MONOREPO_ROOT + '/', ''))}`);
}

function slugify(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

async function ask(rl, question, defaultValue) {
  const hint = defaultValue ? gray(` (${defaultValue})`) : '';
  const answer = await rl.question(`  ${question}${hint}: `);
  return answer.trim() || defaultValue || '';
}

async function askMenu(rl, question, options) {
  console.log(`\n  ${bold(question)}`);
  options.forEach((opt, i) => console.log(`    ${cyan(String(i + 1) + ')')} ${opt}`));
  while (true) {
    const raw = await rl.question(`  > `);
    const idx = parseInt(raw.trim(), 10) - 1;
    if (idx >= 0 && idx < options.length) return idx;
    console.log(`  ${yellow('!')} 請輸入 1–${options.length} 之間的數字`);
  }
}

// ── Template: Plugin ─────────────────────────────────────────

function buildPluginPackageJson(pkgName, description, author) {
  return JSON.stringify({
    name: pkgName,
    version: '1.0.0',
    type: 'module',
    description,
    license: 'MIT',
    main: './dist/index.js',
    module: './dist/index.js',
    types: './dist/index.d.ts',
    exports: {
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
      },
    },
    files: ['dist'],
    scripts: {
      build: 'tsc -p tsconfig.build.json',
      typecheck: 'tsc --noEmit',
    },
    ...(author ? { author } : {}),
    dependencies: {
      'sentryos-sdk': 'workspace:*',
    },
    devDependencies: {
      typescript: '~5.9.3',
    },
  }, null, 2) + '\n';
}

function buildPluginTsconfig() {
  return JSON.stringify({
    extends: '../../tsconfig.base.json',
    compilerOptions: { types: [] },
    include: ['src'],
  }, null, 2) + '\n';
}

function buildPluginTsconfigBuild() {
  return JSON.stringify({
    extends: '../../tsconfig.base.json',
    compilerOptions: {
      types: [],
      noEmit: false,
      declaration: true,
      declarationMap: true,
      sourceMap: true,
      outDir: './dist',
      rootDir: './src',
      allowImportingTsExtensions: false,
    },
    include: ['src'],
  }, null, 2) + '\n';
}

function buildPluginIndexTs(pluginName, pkgName, description, author) {
  return `import type { SentryPlugin, PluginContext } from 'sentryos-sdk';

function setup(context: PluginContext): void {
  // TODO: 在此初始化插件

  // 範例：註冊自訂 Host API
  // context.registerApi('${pluginName}', ({ pid }) => ({
  //   hello: () => \`Hello from process \${pid}\`,
  // }));

  // 範例：訂閱事件
  // context.on('some.event', (...args) => {
  //   context.log('INFO', \`Event received: \${JSON.stringify(args)}\`);
  // });

  context.log('INFO', '${pkgName}: Plugin initialized');
}

function teardown(context: PluginContext): void {
  context.log('INFO', '${pkgName}: Plugin unloaded');
}

const plugin: SentryPlugin = {
  pluginName: '${pkgName}',
  pluginVersion: '1.0.0',
  pluginDescription: '${description}',${author ? `\n  author: '${author}',` : ''}
  setup,
  teardown,
};

export default plugin;
`;
}

async function scaffoldPlugin(rl) {
  console.log(`\n${bold('── Plugin 設定 ──────────────────────────────')}`);

  const rawName   = await ask(rl, '插件名稱 (kebab-case)', 'my-plugin');
  const name      = slugify(rawName) || 'my-plugin';
  const pkgName   = name.startsWith('sentryos-plugin-') ? name : `sentryos-plugin-${name}`;
  const author    = await ask(rl, '作者名稱', '');
  const desc      = await ask(rl, '插件描述', `SentryOS plugin — ${name}`);

  const pluginDir = join(MONOREPO_ROOT, 'packages', pkgName);

  if (existsSync(pluginDir)) {
    console.log(`\n  ${red('✗')} 目錄已存在：${pluginDir}`);
    console.log(`  ${yellow('!')} 請先刪除舊目錄或改用其他名稱`);
    return;
  }

  console.log(`\n  ${bold('建立檔案：')}`);
  writeFile(join(pluginDir, 'package.json'),         buildPluginPackageJson(pkgName, desc, author));
  writeFile(join(pluginDir, 'tsconfig.json'),        buildPluginTsconfig());
  writeFile(join(pluginDir, 'tsconfig.build.json'),  buildPluginTsconfigBuild());
  writeFile(join(pluginDir, 'src', 'index.ts'),      buildPluginIndexTs(name, pkgName, desc, author));

  console.log(`
  ${green(bold('✓ Plugin 骨架已建立！'))}

  ${bold('下一步：')}
    ${cyan('cd')} packages/${pkgName}
    ${cyan('pnpm install')}           # 安裝依賴
    ${cyan('pnpm build')}             # 編譯 TypeScript → dist/

  ${bold('將插件載入 SentryOS：')}
    在宿主應用程式的 ${gray('createSentryOS({ pluginInstances: [...] })')} 中加入此插件實例：
    ${gray(`import ${name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}Plugin from '${pkgName}';`)}
    ${gray(`// pluginInstances: [${name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}Plugin]`)}

  ${bold('文件：')}
    ${gray('docs/plugin-development/guide.md')}
`);
}

// ── Template: App ─────────────────────────────────────────────

const APP_PERMISSION_PRESETS = {
  Window: [
    'window.create',
    'event.subscribe.window.ui',
    'event.emit.window.ui',
  ],
  Console: [
    'console.write',
    'console.read',
  ],
  Service: [
    'event.subscribe.*',
    'notification.send',
  ],
  Library: [],
};

const ENGINE_EXT = {
  javascript: 'js',
  lua:        'lua',
  python:     'py',
};

function buildAppManifest(packageName, desc, author, appId, appName, appType, engine, mainFile) {
  const appEntry = {
    id: appId,
    name: appName,
    version: '1.0.0',
    main: mainFile,
    type: appType,
    ...(engine !== 'javascript' ? { engine } : {}),
    permissions: APP_PERMISSION_PRESETS[appType] ?? [],
  };

  const pkg = {
    name: packageName,
    ...(desc   ? { description: desc }  : {}),
    ...(author ? { author }              : {}),
    apps: [appEntry],
  };

  return JSON.stringify(pkg, null, 4) + '\n';
}

function buildAppMainJs(appName, appType) {
  if (appType === 'Window') {
    return `/** @type {import('sentryos-sdk/app').OsApi} */
const os = OS;

var win = os.ui.createWindow({ title: '${appName}', width: 600, height: 400 });

os.ui.initialize(win, [
  os.ui.label('lbl-title', '${appName}'),
  os.ui.button('btn-hello', '點我打招呼'),
]);

onWindowEvent = function (event) {
  if (event.controlId === 'btn-hello' && event.type === 'click') {
    os.notification.notify({ title: '${appName}', body: 'Hello, SentryOS!', type: 'info' });
  }
};
`;
  }

  if (appType === 'Console') {
    return `/** @type {import('sentryos-sdk/app').OsApi} */
const os = OS;

os.console.writeLine('${appName} 已啟動。');
os.console.writeLine('輸入文字後按 Enter：');

onConsoleInput = function (line) {
  os.console.writeLine('你輸入了：' + line);
};
`;
  }

  if (appType === 'Service') {
    return `/** @type {import('sentryos-sdk/app').OsApi} */
const os = OS;

os.service.publishHealth({ status: 'running', message: '${appName} 服務已啟動' });
os.notification.notify({ title: '${appName}', body: '服務已成功啟動', type: 'info' });

os.event.subscribe('app.shutdown', function () {
  os.service.publishHealth({ status: 'stopped' });
  os.process.exit(0);
});
`;
  }

  // Library
  return `// ${appName} — Library
// 此模組由其他應用程式透過 OS.env.loadLibrary() 載入

/** @type {import('sentryos-sdk/app').OsApi} */
const os = OS;

// 向 EnvironmentManager 匯出公開的命名空間
var ${appName.replace(/\W+/g, '')} = {
  // TODO: 在此定義函式與常數
  version: '1.0.0',
};

// 讓 OS.env.loadLibrary() 取得此物件
globalThis['${appName.replace(/\W+/g, '')}'] = ${appName.replace(/\W+/g, '')};
`;
}

function buildAppMainLua(appName, appType) {
  if (appType === 'Window') {
    return `-- ${appName}
local windowId = OS.ui.createWindow({
  title = "${appName}",
  width = 600,
  height = 400,
}).data

OS.ui.initialize(windowId, {
  OS.ui.label("${appName}"),
  OS.ui.button("點我打招呼", {}, "btn-hello"),
})

function onWindowEvent(event)
  if event.controlId == "btn-hello" and event.type == "click" then
    OS.notification.notify({ title = "${appName}", body = "Hello from Lua!", type = "info" })
  end
end
`;
  }
  return `-- ${appName} (${appType})
OS.console.writeLine("${appName} 已啟動（Lua 引擎）")

function onConsoleInput(line)
  OS.console.writeLine("你輸入了：" .. line)
end
`;
}

function buildAppMainPy(appName, appType) {
  if (appType === 'Window') {
    return `# ${appName}
result = OS.ui.createWindow({"title": "${appName}", "width": 600, "height": 400})
win = result["data"]

OS.ui.initialize(win, [
    OS.ui.label("lbl-title", "${appName}"),
    OS.ui.button("btn-hello", "點我打招呼"),
])

def onWindowEvent(event):
    if event.get("controlId") == "btn-hello" and event.get("type") == "click":
        OS.notification.notify({"title": "${appName}", "body": "Hello from Python!", "type": "info"})
`;
  }
  return `# ${appName} (${appType})
OS.console.writeLine("${appName} 已啟動（Python 引擎）")

def onConsoleInput(line):
    OS.console.writeLine("你輸入了：" + line)
`;
}

async function scaffoldApp(rl) {
  console.log(`\n${bold('── App 設定 ──────────────────────────────────')}`);

  const rawId      = await ask(rl, 'App ID (全域唯一識別碼)', 'my-app');
  const appId      = slugify(rawId) || 'my-app';
  const appName    = await ask(rl, 'App 顯示名稱', appId);
  const pkgName    = await ask(rl, '套件名稱 (manifest name)', appName);
  const author     = await ask(rl, '作者名稱', '');
  const desc       = await ask(rl, 'App 描述', `SentryOS app — ${appName}`);

  const typeIdx    = await askMenu(rl, 'App 類型', ['Window（視窗應用）', 'Console（終端應用）', 'Service（背景服務）', 'Library（共用函式庫）']);
  const appType    = ['Window', 'Console', 'Service', 'Library'][typeIdx];

  const engineIdx  = await askMenu(rl, '執行引擎', ['JavaScript（預設）', 'Lua（需安裝 lua-runtime 插件）', 'Python（需安裝 python-runtime 插件）']);
  const engine     = ['javascript', 'lua', 'python'][engineIdx];
  const ext        = ENGINE_EXT[engine];

  const defaultOut = join('apps', 'sentryos', 'public', 'apps', appId);
  const rawOut     = await ask(rl, '輸出目錄', defaultOut);
  const outDir     = join(MONOREPO_ROOT, rawOut.trim() || defaultOut);

  if (existsSync(outDir)) {
    console.log(`\n  ${red('✗')} 目錄已存在：${outDir}`);
    console.log(`  ${yellow('!')} 請先刪除舊目錄或改用其他 App ID`);
    return;
  }

  const mainFile = `main.${ext}`;

  let mainContent;
  if (engine === 'lua') {
    mainContent = buildAppMainLua(appName, appType);
  } else if (engine === 'python') {
    mainContent = buildAppMainPy(appName, appType);
  } else {
    mainContent = buildAppMainJs(appName, appType);
  }

  console.log(`\n  ${bold('建立檔案：')}`);
  writeFile(join(outDir, 'manifest.json'), buildAppManifest(pkgName, desc, author, appId, appName, appType, engine, mainFile));
  writeFile(join(outDir, mainFile), mainContent);

  // Suggest app.json update
  const appJsonPath = join(MONOREPO_ROOT, 'apps', 'sentryos', 'public', 'app.json');
  let appJsonSuggestion = '';
  try {
    const catalog = JSON.parse(readFileSync(appJsonPath, 'utf8'));
    const relPath = `apps/${appId}`;
    if (!catalog.includes(relPath)) {
      appJsonSuggestion = `\n  ${bold('加入應用程式目錄：')}
    編輯 ${gray('apps/sentryos/public/app.json')}，在陣列末尾加入：
    ${cyan(`"${relPath}"`)}
`;
    }
  } catch {
    // ignore
  }

  const engineNote = engine !== 'javascript'
    ? `\n  ${yellow('!')} 使用 ${engine} 引擎，請確認已在 ${gray('createSentryOS({ pluginInstances: [...] })')} 中載入對應的 runtime 插件\n`
    : '';

  console.log(`
  ${green(bold('✓ App 骨架已建立！'))}
  ${engineNote}${appJsonSuggestion}
  ${bold('文件：')}
    ${gray('docs/app-development/guide.md')}
    ${gray('docs/app-development/host-api.md')}
    ${gray('docs/app-development/manifest.md')}
`);
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log(`
${bold(cyan('╔══════════════════════════════════════════╗'))}
${bold(cyan('║'))}   ${bold('SentryOS 開發環境快速建立工具')}         ${bold(cyan('║'))}
${bold(cyan('╚══════════════════════════════════════════╝'))}
`);

  // Handle --help / -h
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`用法：node packages/create-sentryos/index.js [plugin|app]

  ${bold('plugin')}   建立插件開發骨架（TypeScript 套件）
  ${bold('app')}      建立應用程式開發骨架（JS / Lua / Python）

若不傳入引數，將進入互動模式。
`);
    process.exit(0);
  }

  const rl = createInterface({ input, output, terminal: true });

  try {
    let choice;

    // Accept positional arg: `node index.js plugin` or `node index.js app`
    const positional = args[0]?.toLowerCase();
    if (positional === 'plugin') {
      choice = 0;
    } else if (positional === 'app') {
      choice = 1;
    } else {
      choice = await askMenu(rl, '要建立什麼？', [
        'Plugin（TypeScript 套件，擴充 Runtime / Host API）',
        'App（應用程式，JS / Lua / Python）',
      ]);
    }

    if (choice === 0) {
      await scaffoldPlugin(rl);
    } else {
      await scaffoldApp(rl);
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(`\n${red('✗')} 發生錯誤：${err.message}`);
  process.exit(1);
});
