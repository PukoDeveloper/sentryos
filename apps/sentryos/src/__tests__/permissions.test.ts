import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../kernel/Kernel';
import { PermissionsManager } from '../permissions/PermissionsManager';
import { Permissions } from '../kernel/constants';

// ── Helpers ───────────────────────────────────────────────────

function makeManager(): { manager: PermissionsManager; kernel: Kernel } {
  const kernel = new Kernel();
  const manager = new PermissionsManager(kernel);
  kernel.register('permissions', manager);
  return { manager, kernel };
}

// ── Tests ─────────────────────────────────────────────────────

describe('PermissionsManager', () => {
  describe('init()', () => {
    it('initializes successfully and returns a systemAppId', () => {
      const { manager } = makeManager();
      const result = manager.init();
      expect(result.success).toBe(true);
      expect(typeof result.data).toBe('string');
      expect((result.data as string).startsWith('sys_')).toBe(true);
    });

    it('fails if called twice', () => {
      const { manager } = makeManager();
      manager.init();
      const result = manager.init();
      expect(result.success).toBe(false);
      expect(result.error).toBe('AlreadyInitialized');
    });

    it('grants WILDCARD permission to the system appId', () => {
      const { manager } = makeManager();
      const result = manager.init();
      const systemAppId = result.data as string;
      expect(manager.has(systemAppId, '*')).toBe(true);
      expect(manager.has(systemAppId, 'anything.at.all')).toBe(true);
    });
  });

  describe('has() — wildcard matching', () => {
    let manager: PermissionsManager;
    let systemAppId: string;

    beforeEach(() => {
      ({ manager } = makeManager());
      systemAppId = manager.init().data as string;
    });

    it('exact permission match', () => {
      const result = manager.createUser(systemAppId, ['file.read.app']);
      const userId = result.data as string;
      expect(manager.has(userId, 'file.read.app')).toBe(true);
      expect(manager.has(userId, 'file.write.app')).toBe(false);
    });

    it('wildcard * matches any single segment', () => {
      const result = manager.createUser(systemAppId, ['event.subscribe.*']);
      const userId = result.data as string;
      expect(manager.has(userId, 'event.subscribe.process.started')).toBe(true);
      expect(manager.has(userId, 'event.emit.process.started')).toBe(false);
    });

    it('global * grants everything', () => {
      // systemAppId already has *
      expect(manager.has(systemAppId, 'file.read.sys')).toBe(true);
      expect(manager.has(systemAppId, 'event.subscribe.custom')).toBe(true);
    });

    it('returns false for unknown appId', () => {
      expect(manager.has('nonexistent_id', 'file.read.app')).toBe(false);
    });
  });

  describe('createUser()', () => {
    let manager: PermissionsManager;
    let systemAppId: string;

    beforeEach(() => {
      ({ manager } = makeManager());
      systemAppId = manager.init().data as string;
    });

    it('creates a user with the requested permissions', () => {
      const result = manager.createUser(systemAppId, ['file.read.user', 'event.subscribe.*']);
      expect(result.success).toBe(true);
      const userId = result.data as string;
      expect(userId.startsWith('user_')).toBe(true);
      expect(manager.has(userId, 'file.read.user')).toBe(true);
    });

    it('fails when caller lacks MANAGE_PERMISSIONS', () => {
      const userResult = manager.createUser(systemAppId, ['file.read.user']);
      const userId = userResult.data as string;
      const result = manager.createUser(userId, ['file.read.user']);
      expect(result.success).toBe(false);
      expect(result.error).toBe('PermissionDenied');
    });

    it('fails before init()', () => {
      const { manager: m } = makeManager();
      const result = m.createUser('anything', ['file.read.user']);
      expect(result.success).toBe(false);
      expect(result.error).toBe('NotInitialized');
    });

    it('strips permissions the caller does not hold', () => {
      // User with limited perms cannot grant more than they hold
      const userResult = manager.createUser(systemAppId, ['file.read.user']);
      const userId = userResult.data as string;
      // This userId does not have MANAGE_PERMISSIONS, so it can't create another user
      const childResult = manager.createUser(userId, ['file.read.user']);
      expect(childResult.success).toBe(false);
    });
  });

  describe('new()', () => {
    let manager: PermissionsManager;
    let systemAppId: string;
    let userId: string;

    beforeEach(() => {
      ({ manager } = makeManager());
      systemAppId = manager.init().data as string;
      userId = manager.createUser(systemAppId, [
        Permissions.NEW_APP,
        'file.read.app',
        'event.subscribe.*',
      ]).data as string;
    });

    it('creates an app instance with allowed permissions', () => {
      const result = manager.new(userId, ['file.read.app']);
      expect(result.success).toBe(true);
      const appId = result.data as string;
      expect(appId.startsWith('app_')).toBe(true);
      expect(manager.has(appId, 'file.read.app')).toBe(true);
    });

    it('does not grant permissions the parent lacks', () => {
      const result = manager.new(userId, ['file.write.sys']);
      expect(result.success).toBe(true);
      const appId = result.data as string;
      // 'file.write.sys' was not held by userId, so it should be stripped
      expect(manager.has(appId, 'file.write.sys')).toBe(false);
    });

    it('fails if caller lacks NEW_APP', () => {
      const limitedUser = manager.createUser(systemAppId, ['file.read.app']).data as string;
      const result = manager.new(limitedUser, ['file.read.app']);
      expect(result.success).toBe(false);
      expect(result.error).toBe('PermissionDenied');
    });
  });

  describe('grant() and revoke()', () => {
    let manager: PermissionsManager;
    let systemAppId: string;
    let userId: string;

    beforeEach(() => {
      ({ manager } = makeManager());
      systemAppId = manager.init().data as string;
      userId = manager.createUser(systemAppId, ['file.read.user']).data as string;
    });

    it('grants a new permission to an existing app', () => {
      const result = manager.grant(systemAppId, userId, 'file.write.user');
      expect(result.success).toBe(true);
      expect(manager.has(userId, 'file.write.user')).toBe(true);
    });

    it('revokes an existing permission', () => {
      manager.grant(systemAppId, userId, 'file.write.user');
      const result = manager.revoke(systemAppId, userId, 'file.write.user');
      expect(result.success).toBe(true);
      expect(manager.has(userId, 'file.write.user')).toBe(false);
    });

    it('grant fails if caller lacks MANAGE_PERMISSIONS', () => {
      const result = manager.grant(userId, userId, 'file.write.user');
      expect(result.success).toBe(false);
      expect(result.error).toBe('PermissionDenied');
    });

    it('grant fails if target appId does not exist', () => {
      const result = manager.grant(systemAppId, 'no_such_id', 'file.write.user');
      expect(result.success).toBe(false);
    });
  });

  describe('hasAnyUnder()', () => {
    let manager: PermissionsManager;
    let systemAppId: string;

    beforeEach(() => {
      ({ manager } = makeManager());
      systemAppId = manager.init().data as string;
    });

    it('returns true when the app holds a specific permission under the namespace', () => {
      const userId = manager.createUser(systemAppId, ['file.read.user']).data as string;
      expect(manager.hasAnyUnder(userId, 'file')).toBe(true);
    });

    it('returns false when the app has no permissions under the namespace', () => {
      const userId = manager.createUser(systemAppId, ['event.subscribe.*']).data as string;
      expect(manager.hasAnyUnder(userId, 'file')).toBe(false);
    });

    it('returns true for wildcard holder', () => {
      expect(manager.hasAnyUnder(systemAppId, 'file')).toBe(true);
      expect(manager.hasAnyUnder(systemAppId, 'event')).toBe(true);
    });
  });

  describe('registerAppId()', () => {
    let manager: PermissionsManager;
    let systemAppId: string;

    beforeEach(() => {
      ({ manager } = makeManager());
      systemAppId = manager.init().data as string;
    });

    it('registers a custom appId with specified permissions', () => {
      const result = manager.registerAppId(systemAppId, 'plugin_test', ['event.subscribe.*']);
      expect(result.success).toBe(true);
      expect(manager.has('plugin_test', 'event.subscribe.custom')).toBe(true);
    });

    it('fails if the appId is already registered', () => {
      manager.registerAppId(systemAppId, 'plugin_test', ['event.subscribe.*']);
      const result = manager.registerAppId(systemAppId, 'plugin_test', ['file.read.app']);
      expect(result.success).toBe(false);
    });
  });
});
