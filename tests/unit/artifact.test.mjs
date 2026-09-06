import { expect, test } from 'vitest';
import { sha256, validateManifest, verifyRemote } from '../../scripts/artifact.mjs';

function fixture() {
  const contents = new Map([
    ['index.html', Buffer.from('<!doctype html><title>Fixture</title>')],
    ['build-info.json', Buffer.from('{}')],
    ['manifest.webmanifest', Buffer.from('{}')],
    ['sw.js', Buffer.from('// fixture')],
    ['.nojekyll', Buffer.alloc(0)],
  ]);
  const manifest = { schemaVersion: 1, build: { commit: 'test-source' }, files: [...contents].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha256(bytes) })) };
  const bytes = Buffer.from(JSON.stringify(manifest));
  contents.set('artifact-manifest.json', bytes);
  const fetcher = async (url) => new Response(contents.get(url.pathname.replace('/app/', '')) ?? 'missing');
  return { manifest, bytes, contents, fetcher };
}

test('verifies a served copy of exactly the tested files', async () => {
  const data = fixture();
  expect((await verifyRemote('https://example.test/app/', data.bytes, data.fetcher)).build.commit).toBe('test-source');
});

test('rejects a changed live JavaScript artifact even if the manifest is unchanged', async () => {
  const data = fixture();
  data.contents.set('sw.js', Buffer.from('// changed after testing'));
  await expect(verifyRemote('https://example.test/app/', data.bytes, data.fetcher)).rejects.toThrow('Live file mismatch: sw.js');
});

test('rejects a different deployment manifest', async () => {
  const data = fixture();
  data.contents.set('artifact-manifest.json', Buffer.from('{}'));
  await expect(verifyRemote('https://example.test/app/', data.bytes, data.fetcher)).rejects.toThrow('Live manifest is not the tested manifest');
});

test('rejects missing required files and paths outside the artifact', () => {
  const data = fixture();
  expect(() => validateManifest({ ...data.manifest, files: data.manifest.files.slice(1) })).toThrow('Missing required artifact file');
  expect(() => validateManifest({ ...data.manifest, files: [{ ...data.manifest.files[0], path: '../secret' }, ...data.manifest.files.slice(1)] })).toThrow('Unsafe or duplicate artifact path');
});
