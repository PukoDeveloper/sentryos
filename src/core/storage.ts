import PermissionsManager from './PermissionsManager';
import type { Result } from './types';
import { STORAGE_TOTAL_CAPACITY, STORAGE_TIER_CAPACITIES, Permissions } from './constants';

type StorageTier = 'sys' | 'app' | 'user' | 'cache';

type StoragePrimitive = string | number | boolean | null;

type StorageData =
	| StoragePrimitive
	| StoragePrimitive[]
	| { [key: string]: StoragePrimitive | StoragePrimitive[] | StorageRecord };

interface StorageRecord {
	[key: string]: StoragePrimitive | StoragePrimitive[] | StorageRecord;
}

interface StorageEntry<TData extends StorageData = StorageData> {
	key: string;
	tier: StorageTier;
	ownerAppId: string;
	data: TData;
	createdAt: number;
	updatedAt: number;
	metadata?: Record<string, string | number | boolean | null>;
}

interface StorageUsage {
	totalEntries: number;
	totalCapacity: number;
	tiers: Record<StorageTier, { used: number; capacity: number }>;
}

type StorageError =
	| 'PermissionDenied'
	| 'NotFound'
	| 'AlreadyExists'
	| 'CapacityExceeded'
	| 'InvalidTier'
	| 'InvalidKey'
	| 'UnknownError';

type StorageResult<TData = unknown> = Result<TData, StorageError> & {
	success: boolean;
	error?: StorageError;
};

type StorageGuardResult =
	| { success: true }
	| { success: false; error: StorageError };

interface WriteOptions {
	metadata?: Record<string, string | number | boolean | null>;
	overwrite?: boolean;
}

interface FileSystemAdapter {
	read<TData extends StorageData>(appId: string, tier: StorageTier, key: string): StorageResult<StorageEntry<TData>>;
	write<TData extends StorageData>(
		appId: string,
		tier: StorageTier,
		key: string,
		data: TData,
		options?: WriteOptions
	): StorageResult<StorageEntry<TData>>;
	delete(appId: string, tier: StorageTier, key: string): StorageResult<string>;
	list(appId: string, tier?: StorageTier): StorageResult<StorageEntry[]>;
	exists(appId: string, tier: StorageTier, key: string): StorageResult<boolean>;
	usage(appId: string): StorageResult<StorageUsage>;
	configureCapacity(appId: string, tier: StorageTier, capacity: number): StorageResult<number>;
}

interface FileSystemOptions {
	totalCapacity?: number;
	tierCapacities?: Partial<Record<StorageTier, number>>;
}

const STORAGE_TIERS: StorageTier[] = ['sys', 'app', 'user', 'cache'];

const DEFAULT_TOTAL_CAPACITY = STORAGE_TOTAL_CAPACITY;

const DEFAULT_TIER_CAPACITIES: Record<StorageTier, number> = { ...STORAGE_TIER_CAPACITIES };

function makeStoragePermission(action: 'read' | 'write' | 'delete' | 'list', tier: StorageTier): string {
	return Permissions.fileAction(action, tier);
}

function isStorageRecord(value: StorageData): value is StorageRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneStorageData<TData extends StorageData>(value: TData): TData {
	if (typeof structuredClone === 'function') {
		return structuredClone(value);
	}

	return JSON.parse(JSON.stringify(value)) as TData;
}

function isValidKey(key: string): boolean {
	return key.trim().length > 0 && !key.includes('..');
}

class WebFileSystemAdapter implements FileSystemAdapter {
	private readonly permissions: PermissionsManager;
	private readonly totalCapacity: number;
	private readonly tierCapacities: Record<StorageTier, number>;
	private readonly storage = new Map<StorageTier, Map<string, StorageEntry>>();

	constructor(permissions: PermissionsManager, options: FileSystemOptions = {}) {
		this.permissions = permissions;
		this.totalCapacity = options.totalCapacity ?? DEFAULT_TOTAL_CAPACITY;
		this.tierCapacities = {
			...DEFAULT_TIER_CAPACITIES,
			...options.tierCapacities,
		};

		for (const tier of STORAGE_TIERS) {
			this.storage.set(tier, new Map());
		}
	}

	read<TData extends StorageData>(appId: string, tier: StorageTier, key: string): StorageResult<StorageEntry<TData>> {
		const entry = this.getEntry<TData>(appId, 'read', tier, key);
		if (!entry.success) {
			return entry;
		}

		const currentEntry = entry.data;
		if (!currentEntry) {
			return { success: false, error: 'UnknownError' };
		}

		return {
			success: true,
			data: {
				...currentEntry,
				data: cloneStorageData(currentEntry.data),
			},
		};
	}

	write<TData extends StorageData>(
		appId: string,
		tier: StorageTier,
		key: string,
		data: TData,
		options: WriteOptions = {}
	): StorageResult<StorageEntry<TData>> {
		const guard = this.validateOperation(appId, 'write', tier, key);
		if (!guard.success) {
			return { success: false, error: guard.error };
		}

		const tierStorage = this.storage.get(tier)!;
		const existingEntry = tierStorage.get(key) as StorageEntry<TData> | undefined;
		if (existingEntry && options.overwrite === false) {
			return { success: false, error: 'AlreadyExists' };
		}

		const willCreate = !existingEntry;
		if (willCreate) {
			const capacityCheck = this.checkCapacity(tier);
			if (!capacityCheck.success) {
				return { success: false, error: capacityCheck.error };
			}
		}

		const now = Date.now();
		const nextEntry: StorageEntry<TData> = {
			key,
			tier,
			ownerAppId: existingEntry?.ownerAppId ?? appId,
			data: cloneStorageData(data),
			createdAt: existingEntry?.createdAt ?? now,
			updatedAt: now,
			metadata: options.metadata,
		};

		tierStorage.set(key, nextEntry);
		return {
			success: true,
			data: {
				...nextEntry,
				data: cloneStorageData(nextEntry.data),
			},
		};
	}

	delete(appId: string, tier: StorageTier, key: string): StorageResult<string> {
		const guard = this.validateOperation(appId, 'delete', tier, key);
		if (!guard.success) {
			return { success: false, error: guard.error };
		}

		const tierStorage = this.storage.get(tier)!;
		if (!tierStorage.has(key)) {
			return { success: false, error: 'NotFound' };
		}

		tierStorage.delete(key);
		return { success: true, data: key };
	}

	list(appId: string, tier?: StorageTier): StorageResult<StorageEntry[]> {
		if (tier) {
			const tierCheck = this.validateTier(tier);
			if (!tierCheck.success) {
				return { success: false, error: tierCheck.error };
			}

			if (!this.permissions.has(appId, makeStoragePermission('list', tier))) {
				return { success: false, error: 'PermissionDenied' };
			}

			return {
				success: true,
				data: this.cloneEntries(Array.from(this.storage.get(tier)!.values())),
			};
		}

		const entries: StorageEntry[] = [];
		for (const currentTier of STORAGE_TIERS) {
			if (!this.permissions.has(appId, makeStoragePermission('list', currentTier))) {
				continue;
			}
			entries.push(...Array.from(this.storage.get(currentTier)!.values()));
		}

		return { success: true, data: this.cloneEntries(entries) };
	}

	exists(appId: string, tier: StorageTier, key: string): StorageResult<boolean> {
		const guard = this.validateOperation(appId, 'read', tier, key);
		if (!guard.success && guard.error !== 'NotFound') {
			return { success: false, error: guard.error };
		}

		const tierStorage = this.storage.get(tier);
		return { success: true, data: tierStorage?.has(key) ?? false };
	}

	usage(appId: string): StorageResult<StorageUsage> {
		const tiers = {} as Record<StorageTier, { used: number; capacity: number }>;
		let totalEntries = 0;

		for (const tier of STORAGE_TIERS) {
			if (!this.permissions.has(appId, makeStoragePermission('list', tier))) {
				tiers[tier] = { used: 0, capacity: this.tierCapacities[tier] };
				continue;
			}

			const used = this.storage.get(tier)!.size;
			tiers[tier] = { used, capacity: this.tierCapacities[tier] };
			totalEntries += used;
		}

		return {
			success: true,
			data: {
				totalEntries,
				totalCapacity: this.totalCapacity,
				tiers,
			},
		};
	}

	configureCapacity(appId: string, tier: StorageTier, capacity: number): StorageResult<number> {
		if (!this.permissions.has(appId, Permissions.FILE_ADMIN_CONFIGURE)) {
			return { success: false, error: 'PermissionDenied' };
		}

		const tierCheck = this.validateTier(tier);
		if (!tierCheck.success) {
			return { success: false, error: tierCheck.error };
		}

		if (!Number.isInteger(capacity) || capacity < 0) {
			return { success: false, error: 'UnknownError' };
		}

		this.tierCapacities[tier] = capacity;
		return { success: true, data: capacity };
	}

	private getEntry<TData extends StorageData>(
		appId: string,
		action: 'read' | 'write' | 'delete',
		tier: StorageTier,
		key: string
	): StorageResult<StorageEntry<TData>> {
		const guard = this.validateOperation(appId, action, tier, key);
		if (!guard.success) {
			return { success: false, error: guard.error };
		}

		const entry = this.storage.get(tier)!.get(key) as StorageEntry<TData> | undefined;
		if (!entry) {
			return { success: false, error: 'NotFound' };
		}

		return { success: true, data: entry };
	}

	private validateOperation(
		appId: string,
		action: 'read' | 'write' | 'delete',
		tier: StorageTier,
		key: string
	): StorageGuardResult {
		const tierCheck = this.validateTier(tier);
		if (!tierCheck.success) {
			return tierCheck;
		}

		if (!isValidKey(key)) {
			return { success: false, error: 'InvalidKey' };
		}

		if (!this.permissions.has(appId, makeStoragePermission(action, tier))) {
			return { success: false, error: 'PermissionDenied' };
		}

		return { success: true };
	}

	private validateTier(tier: StorageTier): StorageGuardResult {
		if (!STORAGE_TIERS.includes(tier)) {
			return { success: false, error: 'InvalidTier' };
		}

		return { success: true };
	}

	private checkCapacity(tier: StorageTier): StorageGuardResult {
		const totalUsed = STORAGE_TIERS.reduce((count, currentTier) => count + this.storage.get(currentTier)!.size, 0);
		if (totalUsed >= this.totalCapacity) {
			return { success: false, error: 'CapacityExceeded' };
		}

		const tierUsed = this.storage.get(tier)!.size;
		if (tierUsed >= this.tierCapacities[tier]) {
			return { success: false, error: 'CapacityExceeded' };
		}

		return { success: true };
	}

	private cloneEntries(entries: StorageEntry[]): StorageEntry[] {
		return entries.map(entry => ({
			...entry,
			data: cloneStorageData(entry.data),
		}));
	}
}

export type {
	FileSystemAdapter,
	FileSystemOptions,
	StorageData,
	StorageEntry,
	StorageError,
	StorageRecord,
	StorageResult,
	StorageTier,
	StorageUsage,
	WriteOptions,
};

export {
	DEFAULT_TIER_CAPACITIES,
	DEFAULT_TOTAL_CAPACITY,
	WebFileSystemAdapter,
	makeStoragePermission,
	isStorageRecord,
};
