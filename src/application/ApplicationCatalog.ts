import type { Application } from './ApplicationManager';
import type { Result } from '../kernel/types';
import type { AppType } from '../kernel/constants';

type ApplicationCatalogError = 'ManifestNotFound' | 'InvalidManifest' | 'LoadFailed';

type ApplicationCatalogResult<TData> = Result<TData, ApplicationCatalogError> & {
    success: boolean;
    error?: ApplicationCatalogError;
};

// ── Manifest Formats ────────────────────────────────────────

/** 新格式：套件清單，每個套件可包含多個應用程式 */
type PackageManifest = {
    name: string;
    version: string;
    description?: string;
    author?: string;
    permissions?: string[];
    apps: AppEntryManifest[];
};

/** 套件內的單一應用程式定義 */
type AppEntryManifest = {
    id: string;
    name: string;
    main: string;
    type?: AppType;
    icon?: string;
    permissions?: string[];
    maxInstances?: number;
    autoStart?: boolean;
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
};

// ── Catalog Loader ──────────────────────────────────────────

async function loadApplicationCatalog(): Promise<ApplicationCatalogResult<RegisteredApplication[]>> {
    try {
        const response = await fetch('/app.json');
        if (!response.ok) {
            return { success: false, error: 'ManifestNotFound' };
        }

        const entries = await response.json() as string[];
        if (!Array.isArray(entries)) {
            return { success: false, error: 'InvalidManifest' };
        }

        const applications: RegisteredApplication[] = [];
        for (const entry of entries) {
            const manifestPath = normalizeCatalogEntry(entry);
            const manifestResponse = await fetch(manifestPath);
            if (!manifestResponse.ok) {
                return { success: false, error: 'ManifestNotFound' };
            }

            const raw = await manifestResponse.json();
            const basePath = manifestPath.slice(0, manifestPath.lastIndexOf('/'));

            if (isPackageManifest(raw)) {
                const pkg = raw as PackageManifest;
                for (const app of pkg.apps) {
                    if (!isValidAppEntry(app)) {
                        return { success: false, error: 'InvalidManifest' };
                    }
                    applications.push(toRegisteredApp(pkg, app, basePath));
                }
            } else if (isLegacyManifest(raw)) {
                const legacy = raw as LegacyManifest;
                applications.push(legacyToRegisteredApp(legacy, basePath));
            } else {
                return { success: false, error: 'InvalidManifest' };
            }
        }

        return { success: true, data: applications };
    } catch {
        return { success: false, error: 'LoadFailed' };
    }
}

// ── Helpers ─────────────────────────────────────────────────

function normalizeCatalogEntry(entry: string): string {
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
        && typeof obj.name === 'string'
        && typeof obj.version === 'string';
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

function toRegisteredApp(pkg: PackageManifest, entry: AppEntryManifest, basePath: string): RegisteredApplication {
    const runtimeType: AppType = entry.type ?? 'Window';
    return {
        name: entry.name,
        version: pkg.version,
        permissions: entry.permissions ?? pkg.permissions ?? [],
        maxInstances: entry.maxInstances,
        packageName: pkg.name,
        manifestId: entry.id,
        description: pkg.description,
        author: pkg.author,
        icon: entry.icon ? `${basePath}/${entry.icon}` : undefined,
        entryPath: basePath,
        mainPath: `${basePath}/${entry.main}`,
        runtimeType,
        autoStart: entry.autoStart ?? defaultAutoStart(runtimeType),
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
        icon: manifest.icon ? `${basePath}/${manifest.icon}` : undefined,
        entryPath: basePath,
        mainPath: `${basePath}/${manifest.main}`,
        runtimeType,
        autoStart: defaultAutoStart(runtimeType),
    };
}

export type {
    ApplicationCatalogError,
    ApplicationCatalogResult,
    PackageManifest,
    AppEntryManifest,
    LegacyManifest,
    RegisteredApplication,
};

export {
    loadApplicationCatalog,
};
