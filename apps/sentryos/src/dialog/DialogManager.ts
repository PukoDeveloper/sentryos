import type { Kernel } from '../kernel/Kernel';

// ── Types ───────────────────────────────────────────────────

export type DialogMode = 'file' | 'folder' | 'save';

export interface DialogOptions {
	mode: DialogMode;
	title?: string;
	extensions?: string[];        // e.g. ['.txt', '.md']
	defaultPath?: string;         // initial folder/file
}

export interface DialogResult {
	cancelled: boolean;
	path?: string;                // 選中的檔案/資料夾 key
	tier?: string;                // 所在 tier
	filename?: string;            // 純檔名
}

interface PendingDialog {
	dialogId: string;
	callerProcessAppId: string;   // 呼叫端 processAppId
	callerWindowId: string;       // 呼叫端被鎖定的 windowId
	pickerProcessAppId?: string;  // picker 程序的 processAppId
	options: DialogOptions;
}

// ── DialogManager ───────────────────────────────────────────

export class DialogManager {
	private readonly kernel: Kernel;
	private readonly pending = new Map<string, PendingDialog>();
	/** picker processAppId → dialogId 的反查表 */
	private readonly pickerToDialog = new Map<string, string>();
	private dialogCounter = 0;

	constructor(kernel: Kernel) {
		this.kernel = kernel;
	}

	/**
	 * 建立一個新的對話框請求。
	 * @returns dialogId 用於後續 resolve/cancel
	 */
	openDialog(callerProcessAppId: string, callerWindowId: string, options: DialogOptions): string {
		const dialogId = `dialog_${Date.now()}_${this.dialogCounter++}`;
		this.pending.set(dialogId, {
			dialogId,
			callerProcessAppId,
			callerWindowId,
			options,
		});

		// 鎖定呼叫端視窗
		const windowManager = this.kernel.resolve('windowManager');
		windowManager.setWindowBlocked(callerWindowId, true);

		return dialogId;
	}

	/**
	 * 將 picker 程序關聯到 dialogId。
	 * 當 picker 的視窗關閉時可據此自動取消。
	 */
	bindPicker(dialogId: string, pickerProcessAppId: string): void {
		const dialog = this.pending.get(dialogId);
		if (!dialog) return;
		dialog.pickerProcessAppId = pickerProcessAppId;
		this.pickerToDialog.set(pickerProcessAppId, dialogId);
	}

	/**
	 * Picker 完成選擇，回傳結果給呼叫端。
	 */
	resolve(dialogId: string, result: DialogResult): void {
		const dialog = this.pending.get(dialogId);
		if (!dialog) return;

		this.deliverResult(dialog, result);
		this.cleanup(dialog);
	}

	/**
	 * 取消對話框。
	 */
	cancel(dialogId: string): void {
		const dialog = this.pending.get(dialogId);
		if (!dialog) return;

		this.deliverResult(dialog, { cancelled: true });
		this.cleanup(dialog);
	}

	/**
	 * 當 picker 程序被終止（視窗關閉）時，自動取消對應 dialog。
	 * 由 bootstrap windowChangeListener 呼叫。
	 */
	onPickerProcessTerminated(processAppId: string): void {
		const dialogId = this.pickerToDialog.get(processAppId);
		if (!dialogId) return;
		this.cancel(dialogId);
	}

	/**
	 * 取得某個 dialogId 的選項。
	 * Picker app 可透過此方法取得初始化資訊。
	 */
	getDialogOptions(dialogId: string): DialogOptions | null {
		return this.pending.get(dialogId)?.options ?? null;
	}

	/** 是否有進行中的 dialog */
	hasPending(dialogId: string): boolean {
		return this.pending.has(dialogId);
	}

	// ── Private ─────────────────────────────────────────────

	private deliverResult(dialog: PendingDialog, result: DialogResult): void {
		const runtime = this.kernel.resolve('runtime');
		try {
			runtime.dispatchDialogResult(dialog.callerProcessAppId, result as unknown as Record<string, unknown>);
		} catch { /* caller may be gone */ }
	}

	private cleanup(dialog: PendingDialog): void {
		// 先從 pending 移除，防止 terminate → windowClose → onPickerProcessTerminated 重入
		this.pending.delete(dialog.dialogId);
		if (dialog.pickerProcessAppId) {
			this.pickerToDialog.delete(dialog.pickerProcessAppId);
		}

		// 解除呼叫端視窗鎖定
		const windowManager = this.kernel.resolve('windowManager');
		windowManager.setWindowBlocked(dialog.callerWindowId, false);

		// 延遲終止 picker，避免在 picker 自身的 QuickJS runtime 執行期間同步銷毀
		if (dialog.pickerProcessAppId) {
			const pickerAppId = dialog.pickerProcessAppId;
			const launcher = this.kernel.resolve('applicationLauncher');
			setTimeout(() => {
				try {
					launcher.terminateApplication(pickerAppId, 'dialog-closed');
				} catch { /* may already be gone */ }
			}, 0);
		}
	}
}
