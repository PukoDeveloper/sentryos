import { getQuickJS, type QuickJSWASMModule } from 'quickjs-emscripten';

let QuickJS: QuickJSWASMModule;

export async function initializeQuickJS(): Promise<void> {
    if (!QuickJS) {
        QuickJS = await getQuickJS();
    }
}

export function getQuickJSInstance(): QuickJSWASMModule {
    if (!QuickJS) {
        throw new Error('QuickJS has not been initialized. Call initializeQuickJS() first.');
    }
    return QuickJS;
}
