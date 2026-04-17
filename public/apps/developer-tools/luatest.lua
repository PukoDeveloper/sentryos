local windowId = OS.ui.createWindow({
    title = "Lua Window Demo",
    width = 400,
    height = 300,
}).data;

OS.ui.initialize(windowId,{ OS.ui.label('Added!' )});