import type { Application } from '../ApplicationManager';
import { WindowManager } from './WindowManager';
import type {
    WindowButtonNode,
    WindowInitOptions,
    WindowLabelNode,
    WindowPanelNode,
    WindowProcessContext,
    WindowStackNode,
    WindowSystemResult,
    WindowUiNode,
    WindowUiStyle,
} from './types';

class ApplicationWindowApi {
    private readonly windowManager: WindowManager;
    private readonly processAppId: string;

    constructor(windowManager: WindowManager, processAppId: string) {
        this.windowManager = windowManager;
        this.processAppId = processAppId;
    }

    close(windowId: string): WindowSystemResult<string> {
        return this.windowManager.closeWindow(this.processAppId, windowId);
    }

    maximize(windowId: string): WindowSystemResult<string> {
        return this.windowManager.maximizeWindow(this.processAppId, windowId);
    }

    minimize(windowId: string): WindowSystemResult<string> {
        return this.windowManager.minimizeWindow(this.processAppId, windowId);
    }

    focus(windowId: string): WindowSystemResult<string> {
        return this.windowManager.focusWindow(this.processAppId, windowId);
    }

    restore(windowId: string): WindowSystemResult<string> {
        return this.windowManager.restoreWindow(this.processAppId, windowId);
    }
}

class WindowUiApi {
    private readonly windowManager: WindowManager;
    private readonly processContext: WindowProcessContext;

    constructor(windowManager: WindowManager, processContext: WindowProcessContext) {
        this.windowManager = windowManager;
        this.processContext = processContext;
    }

    createWindow(options: WindowInitOptions): WindowSystemResult<string> {
        return this.windowManager.createWindow(this.processContext, options);
    }

    initialize(windowId: string, tree: WindowUiNode[]): WindowSystemResult<string> {
        return this.windowManager.initializeUi(this.processContext.processAppId, windowId, tree);
    }

    label(text: string, style?: WindowUiStyle, id?: string): WindowLabelNode {
        return { type: 'label', text, style, id };
    }

    button(text: string, style?: WindowUiStyle, id?: string): WindowButtonNode {
        return { type: 'button', text, style, id };
    }

    stack(children: WindowUiNode[], style?: WindowUiStyle, id?: string): WindowStackNode {
        return { type: 'stack', children, style, id };
    }

    panel(children: WindowUiNode[], style?: WindowUiStyle, id?: string): WindowPanelNode {
        return { type: 'panel', children, style, id };
    }
}

function createWindowApis(
    windowManager: WindowManager,
    processAppId: string,
    application: Application,
): {
    events: ApplicationWindowApi;
    ui: WindowUiApi;
} {
    const context: WindowProcessContext = {
        processAppId,
        appDefId: application.appId ?? 'unknown-app',
        appName: application.name,
    };

    return {
        events: new ApplicationWindowApi(windowManager, processAppId),
        ui: new WindowUiApi(windowManager, context),
    };
}

export {
    ApplicationWindowApi,
    WindowUiApi,
    createWindowApis,
};
