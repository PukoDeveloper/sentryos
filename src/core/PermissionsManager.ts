import type { PermissionResult } from "./types";
import { ID_PREFIX_SYSTEM, ID_PREFIX_APP_INSTANCE, Permissions } from './constants';
import type { Kernel } from './Kernel';

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
    private appPermissions: { [appId: string]: Set<string> };
    private inited = false;
    private readonly kernel: Kernel;
    constructor(kernel: Kernel) {
        this.kernel = kernel;
        this.appPermissions = {};
    }

    private get monitor() { return this.kernel.has('systemMonitor') ? this.kernel.resolve('systemMonitor') : null; }
    init(): PermissionResult {
        if (this.inited) return { success: false, error: 'UnknownError' };
        // Load permissions from storage or initialize defaults
        this.inited = true;
        const systemAppId = `${ID_PREFIX_SYSTEM}${Date.now()}`;
        this.appPermissions[systemAppId] = new Set([Permissions.WILDCARD]);
        return { success: true, data: systemAppId };
    }
    new(fromAppId: string, permissions: string[]): PermissionResult {
        if (!this.inited) {
            return { success: false, error: 'NotInitialized' };
        }
        if (!this.has(fromAppId, Permissions.NEW_APP)) {
            return { success: false, error: 'PermissionDenied' };
        }
        const newAppId = `${ID_PREFIX_APP_INSTANCE}${Date.now()}`;
        // 使用 has() 做萬用字元匹配，確保父應用持有 * 時子應用能繼承具體權限
        const allowedPermissions = permissions.filter(p => this.has(fromAppId, p));
        this.appPermissions[newAppId] = new Set(allowedPermissions);
        return { success: true, data: newAppId };
    }
    has(appId: string, permission: string): boolean {
        const granted = Array.from(this.appPermissions[appId] || []).some(p => matchesPermission(p, permission));
        this.monitor?.recordPermissionCheck(appId, permission, granted);
        return granted;
    }
    grant(fromAppId: string, toAppId: string, permission: string): PermissionResult {
        if (!this.inited) {
            return { success: false, error: 'NotInitialized' };
        }
        if (!this.has(fromAppId, Permissions.MANAGE_PERMISSIONS)) {
            return { success: false, error: 'PermissionDenied' };
        }
        if (!this.appPermissions[toAppId]) {
            return { success: false, error: 'UnknownError' };
        }
        if (!this.has(fromAppId, permission)) {
            return { success: false, error: 'PermissionDenied' };
        }
        this.appPermissions[toAppId].add(permission);
        return { success: true };
    }
    revoke(fromAppId: string, toAppId: string, permission: string): PermissionResult {
        if (!this.inited) {
            return { success: false, error: 'NotInitialized' };
        }
        if (!this.has(fromAppId, Permissions.MANAGE_PERMISSIONS)) {
            return { success: false, error: 'PermissionDenied' };
        }
        if (!this.appPermissions[toAppId]) {
            return { success: false, error: 'UnknownError' };
        }
        this.appPermissions[toAppId].delete(permission);
        return { success: true };
    }
    removeApp(fromAppId: string, targetAppId: string): PermissionResult {
        if (!this.inited) {
            return { success: false, error: 'NotInitialized' };
        }
        if (!this.has(fromAppId, Permissions.REMOVE_APP)) {
            return { success: false, error: 'PermissionDenied' };
        }
        delete this.appPermissions[targetAppId];
        return { success: true };
    }
    getPermissions(fromAppId: string, targetAppId: string): PermissionResult {
        if (!this.inited) {
            return { success: false, error: 'NotInitialized' };
        }
        if (!this.has(fromAppId, Permissions.MANAGE_PERMISSIONS)) {
            return { success: false, error: 'PermissionDenied' };
        }
        if (!this.appPermissions[targetAppId]) {
            return { success: false, error: 'UnknownError' };
        }
        return { success: true, data: Array.from(this.appPermissions[targetAppId]) };
    }
}

export { PermissionsManager };