import type { Kernel } from '../kernel/Kernel';
import type { DialogMode } from '../dialog/DialogManager';
import { Permissions } from '../kernel/constants';

export function registerDialogApi(kernel: Kernel): void {
	const runtimeRegistry = kernel.resolve('runtimeRegistry');
	const permissions = kernel.resolve('permissions');
	const dialogManager = kernel.resolve('dialogManager');
	const windowManager = kernel.resolve('windowManager');
	const launcher = kernel.resolve('applicationLauncher');
	const catalogApps = kernel.get('catalogApps');

	// ── Caller-side API (任何 App 都可呼叫) ──────────────────

	runtimeRegistry.registerApi('dialogApi', ({ process }) => {
		const appId = process.processAppId;

		return {
			/**
			 * 開啟檔案選擇對話框。
			 * @param options { mode, title?, extensions?, defaultPath? }
			 * @returns { success, data: dialogId }
			 */
			pickFile: (options?: Record<string, unknown>) => {
				if (!permissions.has(appId, Permissions.DIALOG_OPEN)) {
					return { success: false, error: 'PermissionDenied' };
				}

				const mode: DialogMode = (options?.mode === 'folder' || options?.mode === 'save')
					? options.mode as DialogMode
					: 'file';

				const dialogOptions = {
					mode,
					title: options?.title ? String(options.title) : undefined,
					extensions: Array.isArray(options?.extensions)
						? (options!.extensions as unknown[]).map(String)
						: undefined,
					defaultPath: options?.defaultPath ? String(options.defaultPath) : undefined,
				};

				// 取得呼叫端目前聚焦的 windowId
				const callerWindows = windowManager.getWindowsByProcess(appId);
				if (callerWindows.length === 0) {
					return { success: false, error: 'NoWindow' };
				}
				const callerWindowId = callerWindows[0];

				// 建立 dialog
				const dialogId = dialogManager.openDialog(appId, callerWindowId, dialogOptions);

				// 啟動 file-picker 程序
				const pickerApp = catalogApps.find((a: { name: string }) => a.name === 'File Picker');
				if (!pickerApp) {
					dialogManager.cancel(dialogId);
					return { success: false, error: 'PickerAppNotFound' };
				}

				const fileArgs = {
					dialogId,
					...dialogOptions,
				};

				launcher.launchApplication({
					app: pickerApp,
					type: pickerApp.runtimeType,
					fileArgs,
				});

				return { success: true, data: dialogId };
			},
		};
	}, [Permissions.DIALOG_OPEN], 'dialog');

	// ── Picker-side API (僅 file-picker App 使用) ────────────

	runtimeRegistry.registerApi('dialogResolveApi', ({ process }) => {
		return {
			/**
			 * Picker 自我註冊到 dialog，用於視窗關閉時自動取消。
			 */
			bind: (dialogId: unknown) => {
				if (!dialogId || typeof dialogId !== 'string') {
					return { success: false, error: 'InvalidDialogId' };
				}
				if (!dialogManager.hasPending(String(dialogId))) {
					return { success: false, error: 'DialogNotFound' };
				}
				dialogManager.bindPicker(String(dialogId), process.processAppId);
				return { success: true, data: true };
			},

			/**
			 * Picker 回報選擇結果。
			 */
			resolve: (dialogId: unknown, result: unknown) => {
				if (!dialogId || typeof dialogId !== 'string') {
					return { success: false, error: 'InvalidDialogId' };
				}

				if (!dialogManager.hasPending(String(dialogId))) {
					return { success: false, error: 'DialogNotFound' };
				}

				const res = (result && typeof result === 'object')
					? result as Record<string, unknown>
					: {};

				dialogManager.resolve(String(dialogId), {
					cancelled: false,
					path: res.path ? String(res.path) : undefined,
					tier: res.tier ? String(res.tier) : 'user',
					filename: res.filename ? String(res.filename) : undefined,
				});

				return { success: true, data: true };
			},

			/**
			 * Picker 主動取消。
			 */
			cancel: (dialogId: unknown) => {
				if (!dialogId || typeof dialogId !== 'string') {
					return { success: false, error: 'InvalidDialogId' };
				}

				dialogManager.cancel(String(dialogId));
				return { success: true, data: true };
			},
		};
	}, [Permissions.DIALOG_RESOLVE], 'dialog');
}
