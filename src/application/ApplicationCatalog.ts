import type { Application } from './ApplicationManager';
import type { Result } from '../kernel/types';
import type { AppType } from '../kernel/constants';
import { OS_VERSION } from '../kernel/constants';

type ApplicationCatalogError = 'ManifestNotFound' | 'InvalidManifest' | 'LoadFailed';

type ApplicationCatalogResult<TData> = Result<TData, ApplicationCatalogError> & {
    success: boolean;
    error?: ApplicationCatalogError;
};

/** OS 版本不相容而被略過的應用程式資訊 */
type OsRejectedApp = {
    /** 應用程式顯示名稱 */
    name: string;
    /** 套件名稱 */
    packageName: string;
    /** 不相容原因：outdated = OS 太新；requiresNewerOs = OS 太舊 */
    reason: 'outdated' | 'requiresNewerOs';
    /** manifest 中宣告的版本範圍 */
    requiredRange: { min?: string; max?: string };
};

/** loadApplicationCatalog / loadRemoteApplicationCatalog 成功時的資料形狀 */
type CatalogData = {
    apps: RegisteredApplication[];
    rejected: OsRejectedApp[];
};

// ── Manifest Formats ────────────────────────────────────────

/** 新格式：套件清單，每個套件可包含多個應用程式 */
type PackageManifest = {
    name: string;
    version?: string;
    description?: string;
    author?: string;
    apps: AppEntryManifest[];
};

/** 套件內的單一應用程式定義 */
type ManifestCommand = {
    name: string;
    description: string;
    usage?: string;
};

type AppEntryManifest = {
    id: string;
    name: string;
    main: string;
    version?: string;
    type?: AppType;
    icon?: string;
    permissions?: string[];
    maxInstances?: number;
    autoStart?: boolean;
    hidden?: boolean;
    /** 執行此應用程式所使用的 Runtime 引擎識別字串（例如 'quickjs'）。
     *  省略時預設使用 'quickjs'。 */
    engine?: string;
    /** Library 可在 manifest 中靜態宣告命令，開機時直接註冊。 */
    commands?: ManifestCommand[];
    /** 相容的作業系統版本範圍。min 為最低需求版本；max 為最高支援版本。
     *  省略代表無限制。 */
    osVersion?: { min?: string; max?: string };
};

/** 舊格式：單一應用程式清單（向下相容） */
type LegacyManifest = {
    name: string;
    description?: string;
    version: string;
    author?: string;
    main: string;
    icon?: string;
    type?: AppType;
    permissions?: string[];
    maxInstances?: number;
    /** 相容的作業系統版本範圍。min 為最低需求版本；max 為最高支援版本。 */
    osVersion?: { min?: string; max?: string };
};

// ── Registered Application ──────────────────────────────────

type RegisteredApplication = Application & {
    packageName: string;
    manifestId?: string;
    entryPath: string;
    mainPath: string;
    description?: string;
    author?: string;
    icon?: string;
    runtimeType: AppType;
    autoStart: boolean;
    hidden: boolean;
    /** 執行此應用程式所使用的 Runtime 引擎識別字串（例如 'quickjs'）。
     *  省略時預設使用 'quickjs'。 */
    engine?: string;
    /** manifest 中靜態宣告的命令 */
    commands?: ManifestCommand[];
};

// ── Catalog Loader ──────────────────────────────────────────

async function loadApplicationCatalog(): Promise<ApplicationCatalogResult<CatalogData>> {
    try {
        const response = await fetch('/app.json');
        if (!response.ok) {
            return { success: false, error: 'ManifestNotFound' };
        }

        const entries = await response.json() as string[];
        if (!Array.isArray(entries)) {
            return { success: false, error: 'InvalidManifest' };
        }

        // 並行載入所有 manifest，個別失敗不影響其他 App
        const manifestPaths = entries.map(normalizeCatalogEntry);
        const results = await Promise.allSettled(
            manifestPaths.map(async (manifestPath) => {
                const manifestResponse = await fetch(manifestPath);
                if (!manifestResponse.ok) {
                    throw new Error(`Manifest not found: ${manifestPath}`);
                }
                const raw = await manifestResponse.json();
                const basePath = manifestPath.slice(0, manifestPath.lastIndexOf('/'));
                return { raw, basePath };
            })
        );

        const applications: RegisteredApplication[] = [];
        const rejected: OsRejectedApp[] = [];
        for (const result of results) {
            if (result.status === 'rejected') {
                console.warn('[ApplicationCatalog]', result.reason);
                continue;
            }
            const { raw, basePath } = result.value;
            if (isPackageManifest(raw)) {
                const pkg = raw as PackageManifest;
                for (const app of pkg.apps) {
                    if (!isValidAppEntry(app)) {
                        console.warn('[ApplicationCatalog] Invalid app entry in package:', pkg.name);
                        continue;
                    }
                    const compat = checkOsCompatibility(app.osVersion, OS_VERSION);
                    if (compat !== 'compatible') {
                        rejected.push({ name: app.name, packageName: pkg.name, reason: compat, requiredRange: app.osVersion ?? {} });
                        continue;
                    }
                    applications.push(toRegisteredApp(pkg, app, basePath));
                }
            } else if (isLegacyManifest(raw)) {
                const legacy = raw as LegacyManifest;
                const compat = checkOsCompatibility(legacy.osVersion, OS_VERSION);
                if (compat !== 'compatible') {
                    rejected.push({ name: legacy.name, packageName: legacy.name, reason: compat, requiredRange: legacy.osVersion ?? {} });
                } else {
                    applications.push(legacyToRegisteredApp(legacy, basePath));
                }
            } else {
                console.warn('[ApplicationCatalog] Unknown manifest format in:', basePath);
            }
        }

        return { success: true, data: { apps: applications, rejected } };
    } catch {
        return { success: false, error: 'LoadFailed' };
    }
}

// ── Helpers ─────────────────────────────────────────────────

/** 比較兩個語義版本字串，回傳 -1（a < b）、0（a === b）、1（a > b） */
function compareVersion(a: string, b: string): -1 | 0 | 1 {
    const pa = a.split('.').map(s => parseInt(s, 10) || 0);
    const pb = b.split('.').map(s => parseInt(s, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const na = pa[i] ?? 0;
        const nb = pb[i] ?? 0;
        if (na < nb) return -1;
        if (na > nb) return 1;
    }
    return 0;
}

/** 依 osVersion 範圍與目前 OS 版本進行相容性檢查 */
function checkOsCompatibility(
    constraint: { min?: string; max?: string } | undefined,
    currentVersion: string
): 'compatible' | 'outdated' | 'requiresNewerOs' {
    if (!constraint) return 'compatible';
    if (constraint.min && compareVersion(currentVersion, constraint.min) < 0) {
        return 'requiresNewerOs';
    }
    if (constraint.max && compareVersion(currentVersion, constraint.max) > 0) {
        return 'outdated';
    }
    return 'compatible';
}

function normalizeCatalogEntry(entry: string): string {
    // 遠端 URL（http:// / https://）直接使用，不添加前導斜線
    if (/^https?:\/\//i.test(entry)) {
        const withoutTrailing = entry.replace(/\/+$/, '');
        return withoutTrailing.endsWith('manifest.json')
            ? withoutTrailing
            : `${withoutTrailing}/manifest.json`;
    }
    const trimmed = entry.replace(/^\/+/, '').replace(/\/+$/, '');
    if (trimmed.endsWith('manifest.json')) {
        return `/${trimmed}`;
    }
    if (trimmed.startsWith('apps/')) {
        return `/${trimmed}/manifest.json`;
    }
    return `/apps/${trimmed.replace(/^app\//, '')}/manifest.json`;
}

function isPackageManifest(raw: unknown): raw is PackageManifest {
    if (typeof raw !== 'object' || raw === null) return false;
    const obj = raw as Record<string, unknown>;
    return Array.isArray(obj.apps)
        && typeof obj.name === 'string';
}

function isLegacyManifest(raw: unknown): raw is LegacyManifest {
    if (typeof raw !== 'object' || raw === null) return false;
    const obj = raw as Record<string, unknown>;
    return typeof obj.name === 'string'
        && obj.name.length > 0
        && typeof obj.version === 'string'
        && typeof obj.main === 'string'
        && obj.main.length > 0;
}

function isValidAppEntry(entry: AppEntryManifest): boolean {
    return typeof entry.id === 'string'
        && entry.id.length > 0
        && typeof entry.name === 'string'
        && entry.name.length > 0
        && typeof entry.main === 'string'
        && entry.main.length > 0
        && (entry.permissions === undefined || Array.isArray(entry.permissions));
}

function defaultAutoStart(type: AppType): boolean {
    return type === 'Service' || type === 'Library';
}

const DEFAULT_APP_ICON = '/default-app-icon.svg';

/** icon 值是否看起來像檔案路徑（含副檔名） */
function isIconFilePath(icon: string): boolean {
    return /\.[a-z0-9]+$/i.test(icon);
}

/** 解析 icon：檔案路徑 → basePath 拼接；非檔案 → 預設圖示 */
function resolveIcon(icon: string | undefined, basePath: string): string {
    if (!icon) return DEFAULT_APP_ICON;
    return isIconFilePath(icon) ? `${basePath}/${icon}` : DEFAULT_APP_ICON;
}

function toRegisteredApp(pkg: PackageManifest, entry: AppEntryManifest, basePath: string): RegisteredApplication {
    const runtimeType: AppType = entry.type ?? 'Window';
    return {
        name: entry.name,
        version: entry.version ?? pkg.version ?? '1.0.0',
        permissions: entry.permissions ?? [],
        maxInstances: entry.maxInstances,
        packageName: pkg.name,
        manifestId: entry.id,
        description: pkg.description,
        author: pkg.author,
        icon: resolveIcon(entry.icon, basePath),
        entryPath: basePath,
        mainPath: `${basePath}/${entry.main}`,
        runtimeType,
        autoStart: entry.autoStart ?? defaultAutoStart(runtimeType),
        hidden: entry.hidden === true,
        engine: entry.engine,
        commands: entry.commands,
    };
}

function legacyToRegisteredApp(manifest: LegacyManifest, basePath: string): RegisteredApplication {
    const runtimeType: AppType = manifest.type ?? 'Window';
    return {
        name: manifest.name,
        version: manifest.version,
        permissions: manifest.permissions ?? [],
        maxInstances: manifest.maxInstances,
        packageName: manifest.name,
        description: manifest.description,
        author: manifest.author,
        icon: resolveIcon(manifest.icon, basePath),
        entryPath: basePath,
        mainPath: `${basePath}/${manifest.main}`,
        runtimeType,
        autoStart: defaultAutoStart(runtimeType),
        hidden: false,
    };
}

export type {
    ApplicationCatalogError,
    ApplicationCatalogResult,
    PackageManifest,
    AppEntryManifest,
    LegacyManifest,
    RegisteredApplication,
    OsRejectedApp,
    CatalogData,
};

/**
 * 從一組遠端 manifest URL 載入應用程式。
 * 每個 URL 應直接指向 manifest.json（PackageManifest 或 LegacyManifest 格式）。
 * 個別失敗不影響其他項目。
 */
async function loadRemoteApplicationCatalog(manifestUrls: string[]): Promise<ApplicationCatalogResult<CatalogData>> {
    if (manifestUrls.length === 0) {
        return { success: true, data: { apps: [], rejected: [] } };
    }

    try {
        const results = await Promise.allSettled(
            manifestUrls.map(async (url) => {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Remote manifest fetch failed (HTTP ${response.status}): ${url}`);
                }
                const raw = await response.json();
                const slashIndex = url.lastIndexOf('/');
                const basePath = slashIndex !== -1 ? url.slice(0, slashIndex) : url;
                return { raw, basePath };
            })
        );

        const applications: RegisteredApplication[] = [];
        const rejected: OsRejectedApp[] = [];
        for (const result of results) {
            if (result.status === 'rejected') {
                console.warn('[ApplicationCatalog] Remote manifest load failed:', result.reason);
                continue;
            }
            const { raw, basePath } = result.value;
            if (isPackageManifest(raw)) {
                const pkg = raw as PackageManifest;
                for (const app of pkg.apps) {
                    if (!isValidAppEntry(app)) {
                        console.warn('[ApplicationCatalog] Invalid remote app entry in package:', pkg.name);
                        continue;
                    }
                    const compat = checkOsCompatibility(app.osVersion, OS_VERSION);
                    if (compat !== 'compatible') {
                        rejected.push({ name: app.name, packageName: pkg.name, reason: compat, requiredRange: app.osVersion ?? {} });
                        continue;
                    }
                    applications.push(toRegisteredApp(pkg, app, basePath));
                }
            } else if (isLegacyManifest(raw)) {
                const legacy = raw as LegacyManifest;
                const compat = checkOsCompatibility(legacy.osVersion, OS_VERSION);
                if (compat !== 'compatible') {
                    rejected.push({ name: legacy.name, packageName: legacy.name, reason: compat, requiredRange: legacy.osVersion ?? {} });
                } else {
                    applications.push(legacyToRegisteredApp(legacy, basePath));
                }
            } else {
                console.warn('[ApplicationCatalog] Unknown remote manifest format at:', basePath);
            }
        }

        return { success: true, data: { apps: applications, rejected } };
    } catch (err) {
        console.warn('[ApplicationCatalog] Unexpected error loading remote catalog:', err);
        return { success: false, error: 'LoadFailed' };
    }
}

export {
    loadApplicationCatalog,
    loadRemoteApplicationCatalog,
    normalizeCatalogEntry,
};
