

function setup(context) {
    // 在這裡初始化插件，例如註冊命令、事件等
    console.log("開發工具插件已啟動");

    globalThis.getLog = () => {
        const permissions = context.kernel.resolve("permissions");
        const runtime = context.kernel.resolve("runtime");
        const processManager = context.kernel.resolve("processManager");
        console.log(permissions)
        console.log(runtime)
        console.log(processManager)
    }

}

function teardown(context) {
    // 在這裡清理插件，例如取消註冊命令、事件等
    console.log("開發工具插件已卸載");
}

export default {
    pluginName: "開發工具",
    pluginVersion: "0.1.0",
    pluginDescription: "提供系統資訊和調試工具的插件。",
    setup,
    teardown
}