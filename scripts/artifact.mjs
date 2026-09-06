import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function artifactFiles(root, prefix = '') {
  const result = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Artifact contains a symbolic link: ${relative}`);
    if (entry.isDirectory()) result.push(...await artifactFiles(root, relative));
    else if (relative !== 'artifact-manifest.json') result.push(relative);
  }
  return result.sort();
}

export function validateManifest(manifest) {
  if (manifest.schemaVersion !== 1 || !manifest.build?.commit || !Array.isArray(manifest.files) || !manifest.files.length) {
    throw new Error('Invalid artifact manifest');
  }
  const paths = new Set();
  for (const file of manifest.files) {
    if (typeof file.path !== 'string' || !file.path || file.path.includes('\\') || file.path.startsWith('/') || file.path.split('/').some((part) => !part || part === '..' || part === '.') || paths.has(file.path)) {
      throw new Error('Unsafe or duplicate artifact path');
    }
    if (!/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 0) throw new Error('Invalid file evidence');
    paths.add(file.path);
  }
  for (const required of ['index.html', 'build-info.json', 'manifest.webmanifest', 'sw.js', '.nojekyll']) {
    if (!paths.has(required)) throw new Error(`Missing required artifact file: ${required}`);
  }
}

export async function verifyLocal(root, manifest) {
  validateManifest(manifest);
  const actualFiles = await artifactFiles(root);
  const expectedFiles = manifest.files.map((file) => file.path).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) throw new Error('Artifact file list changed after sealing');
  for (const file of manifest.files) {
    const bytes = await readFile(resolve(root, file.path));
    if (bytes.byteLength !== file.bytes || sha256(bytes) !== file.sha256) throw new Error(`Artifact mismatch: ${file.path}`);
  }
}

export async function verifyRemote(baseUrl, manifestBytes, fetcher = fetch) {
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  validateManifest(manifest);
  const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  if (base.protocol !== 'https:' || base.username || base.password) throw new Error('Deployed verification requires an HTTPS URL without credentials');
  async function getFile(path) {
    const url = new URL(path.split('/').map(encodeURIComponent).join('/'), base);
    url.searchParams.set('verify', manifest.build.commit);
    const response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Live file returned ${response.status}: ${path}`);
    return Buffer.from(await response.arrayBuffer());
  }
  const publishedManifest = await getFile('artifact-manifest.json');
  if (sha256(publishedManifest) !== sha256(manifestBytes)) throw new Error('Live manifest is not the tested manifest');
  for (let index = 0; index < manifest.files.length; index += 6) {
    await Promise.all(manifest.files.slice(index, index + 6).map(async (file) => {
      const bytes = await getFile(file.path);
      if (bytes.byteLength !== file.bytes || sha256(bytes) !== file.sha256) throw new Error(`Live file mismatch: ${file.path}`);
    }));
  }
  return manifest;
}
