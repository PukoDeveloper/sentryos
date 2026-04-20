import type { Kernel } from '../kernel/Kernel';

// ── Types ───────────────────────────────────────────────────────

/** 系統角色：代表系統內建功能的預設應用程式 */
export type SystemRole =
  | 'task-manager'
  | 'file-manager'
  | 'terminal'
  | 'settings'
  | 'text-editor';

/** 檔案類型關聯設定 */
export interface FileTypeAssociation {
  /** 副檔名（包含 .），例如 '.txt' */
  extension: string;
  /** 對應的 appDefId */
  appDefId: string;
  /** MIME type（選填） */
  mimeType?: string;
}

/** 預設應用程式註冊表完整快照 */
export interface RegistrySnapshot {
  roles: Record<string, string>;
  fileTypes: FileTypeAssociation[];
}

// ── Storage keys ────────────────────────────────────────────────
const REGISTRY_STORAGE_KEY = 'system-registry';
const REGISTRY_STORAGE_TIER = 'sys' as const;

// ── SystemRegistry ──────────────────────────────────────────────

class SystemRegistry {
  private readonly kernel: Kernel;

  /** role → appDefId */
  private readonly roles = new Map<string, string>();

  /** extension → FileTypeAssociation */
  private readonly fileTypes = new Map<string, FileTypeAssociation>();

  constructor(kernel: Kernel) {
    this.kernel = kernel;
  }

  // ── Role defaults ───────────────────────────────────────────

  /** 註冊（或更新）系統角色的預設 appDefId */
  setDefaultApp(role: string, appDefId: string): void {
    this.roles.set(role, appDefId);
  }

  /** 取得某個角色的預設 appDefId，若未設定回傳 undefined */
  getDefaultApp(role: string): string | undefined {
    return this.roles.get(role);
  }

  /** 移除角色的預設設定 */
  removeDefaultApp(role: string): boolean {
    return this.roles.delete(role);
  }

  /** 取得所有已註冊角色 */
  getAllRoles(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [role, appDefId] of this.roles) {
      out[role] = appDefId;
    }
    return out;
  }

  // ── File-type associations ──────────────────────────────────

  /** 設定副檔名對應的預設應用程式 */
  setFileTypeHandler(extension: string, appDefId: string, mimeType?: string): void {
    const ext = normalizeExtension(extension);
    this.fileTypes.set(ext, { extension: ext, appDefId, mimeType });
  }

  /** 取得副檔名的預設開啟應用程式 */
  getFileTypeHandler(extension: string): FileTypeAssociation | undefined {
    return this.fileTypes.get(normalizeExtension(extension));
  }

  /** 移除某副檔名的關聯 */
  removeFileTypeHandler(extension: string): boolean {
    return this.fileTypes.delete(normalizeExtension(extension));
  }

  /** 取得所有檔案類型關聯 */
  getAllFileTypeHandlers(): FileTypeAssociation[] {
    return [...this.fileTypes.values()];
  }

  // ── Persistence ─────────────────────────────────────────────

  /** 將目前設定持久化到 sys 層 */
  persist(): void {
    const systemAppId = this.kernel.get('systemAppId');
    const fs = this.kernel.resolve('fileSystem');
    const snapshot: RegistrySnapshot = {
      roles: this.getAllRoles(),
      fileTypes: this.getAllFileTypeHandlers(),
    };
    fs.write(systemAppId, REGISTRY_STORAGE_TIER, REGISTRY_STORAGE_KEY, snapshot as any);
  }

  /** 從 sys 層還原先前保存的設定（若存在）。回傳是否成功還原。 */
  restore(): boolean {
    const systemAppId = this.kernel.get('systemAppId');
    const fs = this.kernel.resolve('fileSystem');
    const result = fs.read(systemAppId, REGISTRY_STORAGE_TIER, REGISTRY_STORAGE_KEY);
    if (!result.success || !result.data) return false;

    const snapshot = result.data.data as unknown as RegistrySnapshot;
    if (snapshot.roles && typeof snapshot.roles === 'object') {
      for (const [role, appDefId] of Object.entries(snapshot.roles)) {
        if (typeof appDefId === 'string') {
          this.roles.set(role, appDefId);
        }
      }
    }
    if (Array.isArray(snapshot.fileTypes)) {
      for (const ft of snapshot.fileTypes) {
        if (typeof ft.extension === 'string' && typeof ft.appDefId === 'string') {
          this.fileTypes.set(normalizeExtension(ft.extension), {
            extension: normalizeExtension(ft.extension),
            appDefId: ft.appDefId,
            mimeType: ft.mimeType,
          });
        }
      }
    }
    return true;
  }

  // ── Snapshot (read-only) ────────────────────────────────────

  /** 取得完整註冊表快照 */
  getSnapshot(): RegistrySnapshot {
    return {
      roles: this.getAllRoles(),
      fileTypes: this.getAllFileTypeHandlers(),
    };
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function normalizeExtension(ext: string): string {
  const trimmed = ext.trim().toLowerCase();
  return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
}

export { SystemRegistry };
