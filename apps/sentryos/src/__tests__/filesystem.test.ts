// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { WebFileSystemAdapter } from '../storage/FileSystem';
import { buildKernelWithPermissions } from './helpers/kernel';
import { Permissions } from '../kernel/constants';

// ── Helpers ───────────────────────────────────────────────────

function makeFs(options?: { persistenceKey?: null }) {
  const { kernel, systemAppId } = buildKernelWithPermissions();
  // Disable localStorage persistence by passing persistenceKey: null so tests
  // remain hermetic and do not require a real browser storage backend.
  const fs = new WebFileSystemAdapter(kernel, {
    persistenceKey: options?.persistenceKey === null ? undefined : undefined,
    totalCapacity: 1024 * 1024,
  });
  // Override persistence key to null to prevent localStorage I/O in tests
  (fs as unknown as { persistenceKey: null }).persistenceKey = null;
  kernel.register('fileSystem', fs);
  return { kernel, fs, systemAppId };
}

// ── Tests ─────────────────────────────────────────────────────

describe('WebFileSystemAdapter', () => {
  describe('write() and read()', () => {
    it('writes and reads back a string value', () => {
      const { fs, systemAppId } = makeFs();
      const writeResult = fs.write(systemAppId, 'sys', 'hello', 'world');
      expect(writeResult.success).toBe(true);

      const readResult = fs.read(systemAppId, 'sys', 'hello');
      expect(readResult.success).toBe(true);
      expect(readResult.data?.data).toBe('world');
    });

    it('writes and reads back an object value', () => {
      const { fs, systemAppId } = makeFs();
      fs.write(systemAppId, 'app', 'config', { theme: 'dark', fontSize: 14 });
      const result = fs.read(systemAppId, 'app', 'config');
      expect(result.success).toBe(true);
      expect(result.data?.data).toEqual({ theme: 'dark', fontSize: 14 });
    });

    it('returns a deep clone, not the original reference', () => {
      const { fs, systemAppId } = makeFs();
      const original = { value: 'original' };
      fs.write(systemAppId, 'sys', 'obj', original);
      original.value = 'mutated';

      const result = fs.read(systemAppId, 'sys', 'obj');
      expect(result.data?.data).toEqual({ value: 'original' });
    });

    it('fails to read a key that does not exist', () => {
      const { fs, systemAppId } = makeFs();
      const result = fs.read(systemAppId, 'sys', 'nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toBe('NotFound');
    });

    it('overwrites an existing key by default', () => {
      const { fs, systemAppId } = makeFs();
      fs.write(systemAppId, 'sys', 'key', 'first');
      fs.write(systemAppId, 'sys', 'key', 'second');
      const result = fs.read(systemAppId, 'sys', 'key');
      expect(result.data?.data).toBe('second');
    });

    it('fails to overwrite when overwrite: false', () => {
      const { fs, systemAppId } = makeFs();
      fs.write(systemAppId, 'sys', 'key', 'first');
      const result = fs.write(systemAppId, 'sys', 'key', 'second', { overwrite: false });
      expect(result.success).toBe(false);
      expect(result.error).toBe('AlreadyExists');
    });
  });

  describe('delete()', () => {
    it('deletes an existing entry', () => {
      const { fs, systemAppId } = makeFs();
      fs.write(systemAppId, 'sys', 'to-delete', 'value');
      const result = fs.delete(systemAppId, 'sys', 'to-delete');
      expect(result.success).toBe(true);
      expect(fs.read(systemAppId, 'sys', 'to-delete').success).toBe(false);
    });

    it('fails when the key does not exist', () => {
      const { fs, systemAppId } = makeFs();
      const result = fs.delete(systemAppId, 'sys', 'ghost');
      expect(result.success).toBe(false);
      expect(result.error).toBe('NotFound');
    });
  });

  describe('exists()', () => {
    it('returns true for a key that was written', () => {
      const { fs, systemAppId } = makeFs();
      fs.write(systemAppId, 'sys', 'present', 1);
      expect(fs.exists(systemAppId, 'sys', 'present').data).toBe(true);
    });

    it('returns false for a key that was never written', () => {
      const { fs, systemAppId } = makeFs();
      expect(fs.exists(systemAppId, 'sys', 'absent').data).toBe(false);
    });
  });

  describe('list()', () => {
    it('lists all entries in a tier', () => {
      const { fs, systemAppId } = makeFs();
      fs.write(systemAppId, 'sys', 'a', 1);
      fs.write(systemAppId, 'sys', 'b', 2);
      const result = fs.list(systemAppId, 'sys');
      expect(result.success).toBe(true);
      const keys = result.data?.map(e => e.key).sort();
      expect(keys).toEqual(['a', 'b']);
    });

    it('returns entries from all tiers when tier is omitted', () => {
      const { fs, systemAppId } = makeFs();
      fs.write(systemAppId, 'sys', 'sys-key', 1);
      fs.write(systemAppId, 'app', 'app-key', 2);
      const result = fs.list(systemAppId);
      expect(result.success).toBe(true);
      const keys = result.data?.map(e => e.key).sort();
      expect(keys).toContain('sys-key');
      expect(keys).toContain('app-key');
    });
  });

  describe('listByPrefix()', () => {
    it('returns only entries whose key starts with the given prefix', () => {
      const { fs, systemAppId } = makeFs();
      fs.write(systemAppId, 'app', 'user:alice', 1);
      fs.write(systemAppId, 'app', 'user:bob', 2);
      fs.write(systemAppId, 'app', 'session:x', 3);
      const result = fs.listByPrefix(systemAppId, 'app', 'user:');
      expect(result.success).toBe(true);
      const keys = result.data?.map(e => e.key).sort();
      expect(keys).toEqual(['user:alice', 'user:bob']);
    });
  });

  describe('usage()', () => {
    it('returns zero usage for an empty store', () => {
      const { fs, systemAppId } = makeFs();
      const result = fs.usage(systemAppId);
      expect(result.success).toBe(true);
      expect(result.data?.totalEntries).toBe(0);
    });

    it('increments usage after writes', () => {
      const { fs, systemAppId } = makeFs();
      fs.write(systemAppId, 'sys', 'key1', 'value');
      const result = fs.usage(systemAppId);
      expect(result.data?.totalEntries).toBeGreaterThan(0);
      expect(result.data?.tiers.sys.entries).toBe(1);
    });
  });

  describe('permissions', () => {
    it('denies read to an app without file.read.app permission', () => {
      const { fs, systemAppId: sysId, kernel } = makeFs();
      const permissions = kernel.resolve('permissions');
      const limitedApp = permissions.createUser(sysId, []).data as string;
      fs.write(sysId, 'app', 'secret', 'data');
      const result = fs.read(limitedApp, 'app', 'secret');
      expect(result.success).toBe(false);
      expect(result.error).toBe('PermissionDenied');
    });

    it('denies write to an app without file.write.sys permission', () => {
      const { fs, systemAppId: sysId, kernel } = makeFs();
      const permissions = kernel.resolve('permissions');
      const limitedApp = permissions.createUser(sysId, [Permissions.fileAction('read', 'sys')]).data as string;
      const result = fs.write(limitedApp, 'sys', 'key', 'value');
      expect(result.success).toBe(false);
      expect(result.error).toBe('PermissionDenied');
    });
  });

  describe('key validation', () => {
    it('rejects keys with invalid characters', () => {
      const { fs, systemAppId } = makeFs();
      const result = fs.write(systemAppId, 'sys', 'bad key!', 'v');
      expect(result.success).toBe(false);
      expect(result.error).toBe('InvalidKey');
    });

    it('rejects keys with ".." segments', () => {
      const { fs, systemAppId } = makeFs();
      const result = fs.write(systemAppId, 'sys', 'a..b', 'v');
      expect(result.success).toBe(false);
      expect(result.error).toBe('InvalidKey');
    });

    it('accepts valid keys with dots, dashes, underscores, and colons', () => {
      const { fs, systemAppId } = makeFs();
      const result = fs.write(systemAppId, 'sys', 'my-key.v1:data_store', 'ok');
      expect(result.success).toBe(true);
    });
  });
});
