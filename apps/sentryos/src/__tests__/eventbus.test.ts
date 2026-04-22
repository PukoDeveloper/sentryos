import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../events/EventBus';
import { buildKernelWithPermissions } from './helpers/kernel';
import { Permissions } from '../kernel/constants';

// ── Helpers ───────────────────────────────────────────────────

function makeEventBus() {
  const { kernel, systemAppId } = buildKernelWithPermissions();
  const permissions = kernel.resolve('permissions');
  const eventBus = new EventBus(kernel);
  kernel.register('eventBus', eventBus);
  return { kernel, permissions, eventBus, systemAppId };
}

// ── Tests ─────────────────────────────────────────────────────

describe('EventBus', () => {
  describe('on() — subscription', () => {
    it('allows subscription when the caller has the required permission', () => {
      const { eventBus, systemAppId } = makeEventBus();
      const result = eventBus.on(systemAppId, 'process.started', () => undefined);
      expect(result.success).toBe(true);
    });

    it('denies subscription when the caller lacks the required permission', () => {
      const { kernel, permissions, systemAppId, eventBus } = makeEventBus();
      // Create a user with no event.subscribe permissions
      const userId = permissions.createUser(systemAppId, ['file.read.user']).data as string;
      const result = eventBus.on(userId, 'process.started', () => undefined);
      expect(result.success).toBe(false);
      expect(result.error).toBe('PermissionDenied');
      void kernel; // suppress unused warning
    });

    it('returns MaxListenersReached after hitting the listener cap', () => {
      const { eventBus, systemAppId } = makeEventBus();
      // Register 256 listeners (the documented cap)
      for (let i = 0; i < 256; i++) {
        const r = eventBus.on(systemAppId, 'test.event', () => undefined);
        expect(r.success).toBe(true);
      }
      // The 257th should fail
      const overflow = eventBus.on(systemAppId, 'test.event', () => undefined);
      expect(overflow.success).toBe(false);
      expect(overflow.error).toBe('MaxListenersReached');
    });
  });

  describe('emit() — publishing', () => {
    it('calls all registered listeners in order', () => {
      const { eventBus, systemAppId } = makeEventBus();
      const calls: number[] = [];
      eventBus.on(systemAppId, 'test.event', () => { calls.push(1); });
      eventBus.on(systemAppId, 'test.event', () => { calls.push(2); });
      eventBus.emit(systemAppId, 'test.event');
      expect(calls).toEqual([1, 2]);
    });

    it('passes arguments to listeners', () => {
      const { eventBus, systemAppId } = makeEventBus();
      const received: unknown[] = [];
      eventBus.on(systemAppId, 'test.event', (...args) => { received.push(...args); });
      eventBus.emit(systemAppId, 'test.event', { pid: 42 });
      expect(received).toEqual([{ pid: 42 }]);
    });

    it('denies emit when the caller lacks event.emit permission', () => {
      const { permissions, eventBus, systemAppId } = makeEventBus();
      const userId = permissions.createUser(systemAppId, [
        Permissions.eventSubscribe('test.event'),
      ]).data as string;
      const result = eventBus.emit(userId, 'test.event');
      expect(result.success).toBe(false);
      expect(result.error).toBe('PermissionDenied');
    });

    it('succeeds even when no listeners are registered', () => {
      const { eventBus, systemAppId } = makeEventBus();
      const result = eventBus.emit(systemAppId, 'no.listeners');
      expect(result.success).toBe(true);
    });

    it('does not propagate listener exceptions to the emitter', () => {
      const { eventBus, systemAppId } = makeEventBus();
      eventBus.on(systemAppId, 'test.event', () => { throw new Error('listener error'); });
      // Should not throw
      expect(() => eventBus.emit(systemAppId, 'test.event')).not.toThrow();
    });
  });

  describe('off() — unsubscription', () => {
    it('removes a specific listener', () => {
      const { eventBus, systemAppId } = makeEventBus();
      const spy = vi.fn();
      eventBus.on(systemAppId, 'test.event', spy);
      eventBus.off(systemAppId, 'test.event', spy);
      eventBus.emit(systemAppId, 'test.event');
      expect(spy).not.toHaveBeenCalled();
    });

    it('only removes the matching listener, leaving others intact', () => {
      const { eventBus, systemAppId } = makeEventBus();
      const spy1 = vi.fn();
      const spy2 = vi.fn();
      eventBus.on(systemAppId, 'test.event', spy1);
      eventBus.on(systemAppId, 'test.event', spy2);
      eventBus.off(systemAppId, 'test.event', spy1);
      eventBus.emit(systemAppId, 'test.event');
      expect(spy1).not.toHaveBeenCalled();
      expect(spy2).toHaveBeenCalledOnce();
    });

    it('returns success even if the listener was not registered', () => {
      const { eventBus, systemAppId } = makeEventBus();
      const result = eventBus.off(systemAppId, 'test.event', () => undefined);
      expect(result.success).toBe(true);
    });
  });

  describe('removeApp()', () => {
    it('removes all listeners belonging to the app', () => {
      const { eventBus, systemAppId, permissions } = makeEventBus();
      const userId = permissions.createUser(systemAppId, [
        Permissions.eventSubscribe('test.event'),
        Permissions.eventEmit('test.event'),
      ]).data as string;
      const spy = vi.fn();
      eventBus.on(userId, 'test.event', spy);
      eventBus.removeApp(userId);
      eventBus.emit(systemAppId, 'test.event');
      expect(spy).not.toHaveBeenCalled();
    });

    it('is a no-op for an app that has no listeners', () => {
      const { eventBus, systemAppId } = makeEventBus();
      // Should not throw
      expect(() => eventBus.removeApp(systemAppId)).not.toThrow();
    });
  });

  describe('wildcard permission matching integration', () => {
    it('event.subscribe.* covers any event name', () => {
      const { eventBus, systemAppId, permissions } = makeEventBus();
      const userId = permissions.createUser(systemAppId, [
        'event.subscribe.*',
        'event.emit.*',
      ]).data as string;
      const spy = vi.fn();
      const onResult = eventBus.on(userId, 'custom.event', spy);
      expect(onResult.success).toBe(true);
      eventBus.emit(userId, 'custom.event', 'payload');
      expect(spy).toHaveBeenCalledWith('payload');
    });
  });
});
