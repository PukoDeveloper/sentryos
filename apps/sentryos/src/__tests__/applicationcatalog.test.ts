import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadApplicationCatalog, loadRemoteApplicationCatalog } from '../application/ApplicationCatalog';

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ApplicationCatalog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns ManifestNotFound when all catalog entries fail to load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));

    const result = await loadApplicationCatalog(['apps/system', 'apps/utilities']);

    expect(result.success).toBe(false);
    expect(result.error).toBe('ManifestNotFound');
  });

  it('returns InvalidManifest when all loaded entries are unrecognized', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ foo: 'bar' })));

    const result = await loadApplicationCatalog(['apps/system']);

    expect(result.success).toBe(false);
    expect(result.error).toBe('InvalidManifest');
  });

  it('returns ManifestNotFound when all remote manifests fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));

    const result = await loadRemoteApplicationCatalog([
      'https://example.com/apps/system/manifest.json',
    ]);

    expect(result.success).toBe(false);
    expect(result.error).toBe('ManifestNotFound');
  });

  it('returns InvalidManifest when all remote manifests are unrecognized', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ bad: true })));

    const result = await loadRemoteApplicationCatalog([
      'https://example.com/apps/system/manifest.json',
    ]);

    expect(result.success).toBe(false);
    expect(result.error).toBe('InvalidManifest');
  });
});
