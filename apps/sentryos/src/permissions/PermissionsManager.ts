import type { PermissionResult } from "../kernel/types";
import { ID_PREFIX_SYSTEM, ID_PREFIX_USER, ID_PREFIX_APP_INSTANCE, Permissions } from '../kernel/constants';
import type { Kernel } from '../kernel/Kernel';

type Permission = string;

function matchesPermission(granted: Permission, required: Permission): boolean {
    const grantedParts = granted.split('.');
    const requiredParts = required.split('.');
    
    if (grantedParts.length > requiredParts.length) {
        return false;
    }
    
    return grantedParts.every((part, index) => 
        part === '*' || part === requiredParts[index]
    );
}

class PermissionsManager {
    private appPermissions: Map<string, Set<string>>;
    private inited = false;
    private readonly kernel: Kernel;
    private idCounter = 0;
    constructor(kernel: Kernel) {
        this.kernel = kernel;
        this.appPermissions = new Map();
    }

    /** 產生唯一 ID，結合時間戳與遞增計數器避免碰撞 */
    private generateId(prefix: string): string {
        let id: string;
        do {
            id = `${prefix}${Date.now()}_${this.idCounter++}`;
        } while (this.appPermissions.has(id));
        return id;
    }

    private get monitor() { return this.kernel.has('systemMonitor') ? this.kernel.resolve('systemMonitor') : null; }
    init(): PermissionResult {
        if (this.inited) return { success: false, error: 'AlreadyInitialized' };
        // Load permissions from storage or initialize defaults
        this.inited = true;
        const systemAppId = this.generateId(ID_PREFIX_SYSTEM);
        this.appPermissions.set(systemAppId, new Set([Permissions.WILDCARD]));
        return { success: true, data: systemAppId };
    }
    /**
     * 建立使用者權限實體，權限範圍由呼叫者指定。
     * 需要 MANAGE_PERMISSIONS 權限（通常由 systemAppId 呼叫）。
     */
    createUser(fromAppId: string, permissions: string[]): PermissionResult {
        if (!this.inited) {
            return { success: false, error: 'NotInitialized' };
        }
        if (!this.has(fromAppId, Permissions.MANAGE_PERMISSIONS)) {
            return { success: false, error: 'PermissionDenied' };
        }
        const userAppId = this.generateId(ID_PREFIX_USER);
        this.appPermissions.set(userAppId, new Set(permissions));
        return { success: true, data: userAppId };
    }
    new(fromAppId: string, permissions: string[]): PermissionResult {
        if (!this.inited) {
            return { success: false, error: 'NotInitialized' };
        }
        if (!this.has(fromAppId, Permissions.NEW_APP)) {
            return { success: false, error: 'PermissionDenied' };
        }
        const newAppId = this.generateId(ID_PREFIX_APP_INSTANCE);
        // 使用 has() 做萬用字元匹配，確保父應用持有 * 時子應用能繼承具體權限
        const allowedPermissions = permissions.filter(p => this.has(fromAppId, p));
        this.appPermissions.set(newAppId, new Set(allowedPermissions));
        return { success: true, data: newAppId };
    }
    has(appId: string, permission: string): boolean {
        const perms = this.appPermissions.get(appId);
        let granted = false;
        if (perms) {
            for (const p of perms) {
                if (matchesPermission(p, permission)) { granted = true; break; }
            }
        }
        this.monitor?.recordPermissionCheck(appId, permission, granted);
        return granted;
    }
    /**
     * 以指定的 appId 直接註冊權限實體（用於插件等內部機制）。
     * 需要 MANAGE_PERMISSIONS 權限。
     */
    registerAppId(fromAppId: string, appId: string, permissions: string[]): PermissionResult {
        if (!this.inited) {
            return { success: false, error: 'NotInitialized' };
        }
        if (!this.has(fromAppId, Permissions.MANAGE_PERMISSIONS)) {
            return { success: false, error: 'PermissionDenied' };
        }
        if (this.appPermissions.has(appId)) {
            return { success: false, error: 'UnknownError' };
        }
        const allowedPermissions = permissions.filter(p => this.has(fromAppId, p));
        this.appPermissions.set(appId, new Set(allowedPermissions));
        return { success: true, data: appId };
    }
    /** 檢查應用程式是否持有指定命名空間下的任一權限 */
    hasAnyUnder(appId: string, namespace: string): boolean {
        const perms = this.appPermissions.get(appId);
        if (!perms) return false;
        const prefix = namespace + '.';
        return Array.from(perms).some(p => {
            if (p === '*') return true;
            if (p === namespace) return true;
            if (p.startsWith(prefix)) return true;
            // 支援 'namespace.*' 及 'namespace.sub.*' 等萬用字元格式
            if (p.endsWith('.*') && (namespace + '.').startsWith(p.slice(0, -1))) return true;
            return false;
        });
    }
    grant(fromAppId: string, toAppId: string, permission: string): PermissionResult {
        if (!this.inited) {
            return { success: false, error: 'NotInitialized' };
        }
        if (!this.has(fromAppId, Permissions.MANAGE_PERMISSIONS)) {
            return { success: false, error: 'PermissionDenied' };
        }
        if (!this.appPermissions.has(toAppId)) {
            return { success: false, error: 'UnknownError' };
        }
        if (!this.has(fromAppId, permission)) {
            return { success: false, error: 'PermissionDenied' };
        }
        this.appPermissions.get(toAppId)!.add(permission);
        return { success: true };
    }
    revoke(fromAppId: string, toAppId: string, permission: string): PermissionResult {
        if (!this.inited) {
            return { success: false, error: 'NotInitialized' };
        }
        if (!this.has(fromAppId, Permissions.MANAGE_PERMISSIONS)) {
            return { success: false, error: 'PermissionDenied' };
        }
        if (!this.appPermissions.has(toAppId)) {
            return { success: false, error: 'UnknownError' };
        }
        this.appPermissions.get(toAppId)!.delete(permission);
        return { success: true };
    }
    removeApp(fromAppId: string, targetAppId: string): PermissionResult {
        if (!this.inited) {
            return { success: false, error: 'NotInitialized' };
        }
        if (!this.has(fromAppId, Permissions.REMOVE_APP)) {
            return { success: false, error: 'PermissionDenied' };
        }
        this.appPermissions.delete(targetAppId);
        return { success: true };
    }
    getPermissions(fromAppId: string, targetAppId: string): PermissionResult {
        if (!this.inited) {
            return { success: false, error: 'NotInitialized' };
        }
        if (!this.has(fromAppId, Permissions.MANAGE_PERMISSIONS)) {
            return { success: false, error: 'PermissionDenied' };
        }
        if (!this.appPermissions.has(targetAppId)) {
            return { success: false, error: 'UnknownError' };
        }
        return { success: true, data: Array.from(this.appPermissions.get(targetAppId)!) };
    }
}

export { PermissionsManager };
