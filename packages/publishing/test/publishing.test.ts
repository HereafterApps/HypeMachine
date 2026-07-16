import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalStorageAdapter } from '@hype/storage';
import { ManualExportProvider, PublishingRegistry } from '../src/index.js';

const baseInput = {
  contentId: 'content-1',
  personaSlug: 'professor-steve',
  campaignSlug: 'guidedgenius',
  contentType: 'TEXT_POST',
  bodyText: 'Learning should talk back.',
  hashtags: ['#edtech'],
  cta: 'Try it.',
};

describe('ManualExportProvider', () => {
  it('writes a complete export bundle and returns its location', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hype-storage-'));
    const storage = new LocalStorageAdapter(dir);
    const provider = new ManualExportProvider(storage);

    const result = await provider.publish(baseInput);
    expect(result.platformPostId).toBe('export-content-1');
    expect(result.platformUrl).toMatch(/^file:\/\//);

    const post = await readFile(
      join(dir, 'exports/professor-steve/guidedgenius/content-1/post.txt'),
      'utf8',
    );
    expect(post).toContain('Learning should talk back.');
    expect(post).toContain('#edtech');

    const metadata = JSON.parse(
      await readFile(
        join(dir, 'exports/professor-steve/guidedgenius/content-1/metadata.json'),
        'utf8',
      ),
    );
    expect(metadata.campaign).toBe('guidedgenius');
  });
});

describe('PublishingRegistry', () => {
  it('falls back to manual export for unconfigured API platforms', () => {
    const storage = new LocalStorageAdapter(mkdtempSync(join(tmpdir(), 'hype-storage-')));
    const registry = new PublishingRegistry(storage);

    const resolved = registry.resolve('YOUTUBE', { ...baseInput, accessToken: null });
    expect(resolved.platform).toBe('MANUAL_EXPORT');

    // With a token the platform provider is selected (it will throw
    // ProviderNotConfiguredError until Phase 5 lands a real transport).
    const withToken = registry.resolve('YOUTUBE', { ...baseInput, accessToken: 'tok' });
    expect(withToken.platform).toBe('YOUTUBE');
  });
});
