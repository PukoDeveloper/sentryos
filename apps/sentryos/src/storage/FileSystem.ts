import type { Kernel } from '../kernel/Kernel';
import type { Result } from '../kernel/types';
import { STORAGE_TOTAL_CAPACITY, STORAGE_TIER_CAPACITIES, Permissions } from '../kernel/constants';

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
	totalBytes: number;
	totalCapacityBytes: number;
	totalEntries: number;
	tiers: Record<StorageTier, { usedBytes: number; capacityBytes: number; entries: number }>;
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
	/** 若提供，寫入時以此作為 ownerAppId（用於顯示穩定的擁有者識別） */
	ownerLabel?: string;
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
	listByPrefix(appId: string, tier: StorageTier, prefix: string): StorageResult<StorageEntry[]>;
	exists(appId: string, tier: StorageTier, key: string): StorageResult<boolean>;
	usage(appId: string): StorageResult<StorageUsage>;
	configureCapacity(appId: string, tier: StorageTier, capacity: number): StorageResult<number>;
}

interface FileSystemOptions {
	totalCapacity?: number;
	tierCapacities?: Partial<Record<StorageTier, number>>;
	persistenceKey?: string;
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
	return /^[\w\-.:]+$/.test(key);
}

const textEncoder = new TextEncoder();

function utf8ByteLength(str: string): number {
	return textEncoder.encode(str).length;
}

function calculateDataByteSize(data: StorageData): number {
	return utf8ByteLength(JSON.stringify(data));
}

function calculateEntryByteSize(entry: StorageEntry): number {
	let size = utf8ByteLength(entry.key);
	size += utf8ByteLength(entry.ownerAppId);
	size += utf8ByteLength(entry.tier);
	size += calculateDataByteSize(entry.data);
	if (entry.metadata) {
		size += utf8ByteLength(JSON.stringify(entry.metadata));
	}
	size += 16; // createdAt + updatedAt (two 8-byte timestamps)
	return size;
}

class WebFileSystemAdapter implements FileSystemAdapter {
	private readonly kernel: Kernel;
	private readonly totalCapacity: number;
	private readonly tierCapacities: Record<StorageTier, number>;
	private readonly storage = new Map<StorageTier, Map<string, StorageEntry>>();
	private readonly persistenceKey: string | null;
	/** 增量記錄每個 tier 的已用位元組數，避免每次寫入時全量掃描 */
	private readonly tierUsedBytes: Record<StorageTier, number> = { sys: 0, app: 0, user: 0, cache: 0 };
	private totalUsedBytes = 0;
	/** 節流：每個 tier 持久化的延遲計時器 */
	private readonly persistDebounceTimers: Partial<Record<StorageTier, ReturnType<typeof setTimeout>>> = {};
	private static readonly PERSIST_DEBOUNCE_MS = 100;

	constructor(kernel: Kernel, options: FileSystemOptions = {}) {
		this.kernel = kernel;
		this.totalCapacity = options.totalCapacity ?? DEFAULT_TOTAL_CAPACITY;
		this.tierCapacities = {
			...DEFAULT_TIER_CAPACITIES,
			...options.tierCapacities,
		};
		this.persistenceKey = options.persistenceKey ?? 'sentryos:fs';

		for (const tier of STORAGE_TIERS) {
			this.storage.set(tier, new Map());
		}

		this.loadFromStorage();
	}

	private get permissions() { return this.kernel.resolve('permissions'); }

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

		const incomingBytes = calculateDataByteSize(data) + utf8ByteLength(key) + utf8ByteLength(options.ownerLabel ?? appId) + utf8ByteLength(tier) + 16
			+ (options.metadata ? utf8ByteLength(JSON.stringify(options.metadata)) : 0);
		const existingBytes = existingEntry ? calculateEntryByteSize(existingEntry) : 0;
		const netBytes = incomingBytes - existingBytes;
		if (netBytes > 0) {
			const capacityCheck = this.checkCapacity(tier, netBytes);
			if (!capacityCheck.success) {
				return { success: false, error: capacityCheck.error };
			}
		}

		const now = Date.now();
		const nextEntry: StorageEntry<TData> = {
			key,
			tier,
			ownerAppId: existingEntry?.ownerAppId ?? options.ownerLabel ?? appId,
			data: cloneStorageData(data),
			createdAt: existingEntry?.createdAt ?? now,
			updatedAt: now,
			metadata: options.metadata,
		};

		// Update counters after the storage operation succeeds
		tierStorage.set(key, nextEntry);
		this.tierUsedBytes[tier] += netBytes;
		this.totalUsedBytes += netBytes;
		this.persistTier(tier);
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
		const existingEntry = tierStorage.get(key);
		if (!existingEntry) {
			return { success: false, error: 'NotFound' };
		}

		const freedBytes = calculateEntryByteSize(existingEntry);
		// Compute freed bytes before deletion, then update counters after deletion succeeds
		tierStorage.delete(key);
		this.tierUsedBytes[tier] -= freedBytes;
		this.totalUsedBytes -= freedBytes;
		this.persistTier(tier);
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

	listByPrefix(appId: string, tier: StorageTier, prefix: string): StorageResult<StorageEntry[]> {
		const tierCheck = this.validateTier(tier);
		if (!tierCheck.success) {
			return { success: false, error: tierCheck.error };
		}

		if (!this.permissions.has(appId, makeStoragePermission('list', tier))) {
			return { success: false, error: 'PermissionDenied' };
		}

		const tierStorage = this.storage.get(tier)!;
		const entries: StorageEntry[] = [];
		for (const [key, entry] of tierStorage) {
			if (key.startsWith(prefix)) {
				entries.push(entry);
			}
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
		const tiers = {} as Record<StorageTier, { usedBytes: number; capacityBytes: number; entries: number }>;
		let totalBytes = 0;
		let totalEntries = 0;

		for (const tier of STORAGE_TIERS) {
			if (!this.permissions.has(appId, makeStoragePermission('list', tier))) {
				tiers[tier] = { usedBytes: 0, capacityBytes: this.tierCapacities[tier], entries: 0 };
				continue;
			}

			const tierMap = this.storage.get(tier)!;
			const tierBytes = this.tierUsedBytes[tier];
			tiers[tier] = { usedBytes: tierBytes, capacityBytes: this.tierCapacities[tier], entries: tierMap.size };
			totalBytes += tierBytes;
			totalEntries += tierMap.size;
		}

		return {
			success: true,
			data: {
				totalBytes,
				totalCapacityBytes: this.totalCapacity,
				totalEntries,
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

	private checkCapacity(tier: StorageTier, incomingBytes = 0): StorageGuardResult {
		if (this.totalUsedBytes + incomingBytes > this.totalCapacity) {
			return { success: false, error: 'CapacityExceeded' };
		}

		if (this.tierUsedBytes[tier] + incomingBytes > this.tierCapacities[tier]) {
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

	// ── Persistence ────────────────────────────────────────────

	private persistTier(tier: StorageTier): void {
		if (!this.persistenceKey) return;
		// Debounce: cancel any pending flush for this tier and reschedule.
		// This prevents serializing the entire tier on every individual write/delete
		// during burst operations.
		const existing = this.persistDebounceTimers[tier];
		if (existing !== undefined) clearTimeout(existing);
		this.persistDebounceTimers[tier] = setTimeout(() => {
			delete this.persistDebounceTimers[tier];
			this.flushTier(tier);
		}, WebFileSystemAdapter.PERSIST_DEBOUNCE_MS);
	}

	private flushTier(tier: StorageTier): void {
		if (!this.persistenceKey) return;
		try {
			const tierMap = this.storage.get(tier)!;
			const entries = Array.from(tierMap.values());
			localStorage.setItem(`${this.persistenceKey}:${tier}`, JSON.stringify(entries));
		} catch {
			console.warn(`[FileSystem] Failed to persist tier '${tier}' to localStorage (quota exceeded or storage unavailable). Data may be lost on page reload.`);
		}
	}

	private loadFromStorage(): void {
		if (!this.persistenceKey) return;
		for (const tier of STORAGE_TIERS) {
			try {
				const raw = localStorage.getItem(`${this.persistenceKey}:${tier}`);
				if (!raw) continue;
				const parsed: unknown = JSON.parse(raw);
				if (!Array.isArray(parsed)) continue;
				const tierMap = this.storage.get(tier)!;
				for (const entry of parsed) {
					if (
						entry === null ||
						typeof entry !== 'object' ||
						typeof entry.key !== 'string' ||
						!STORAGE_TIERS.includes(entry.tier as StorageTier) ||
						typeof entry.ownerAppId !== 'string' ||
						typeof entry.createdAt !== 'number' ||
						typeof entry.updatedAt !== 'number'
					) {
						continue;
					}
					const validated = entry as StorageEntry;
					tierMap.set(validated.key, validated);
					const entrySize = calculateEntryByteSize(validated);
					this.tierUsedBytes[tier] += entrySize;
					this.totalUsedBytes += entrySize;
				}
			} catch { /* corrupted data — start fresh for this tier */ }
		}
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
	calculateDataByteSize,
	calculateEntryByteSize,
};
