import { readFile, writeFile } from 'node:fs/promises';
import { artifactFiles, sha256 } from './artifact.mjs';

const build = JSON.parse(await readFile('dist/build-info.json', 'utf8'));
const files = await Promise.all((await artifactFiles('dist')).map(async (path) => {
  const bytes = await readFile(`dist/${path}`);
  return { path, bytes: bytes.byteLength, sha256: sha256(bytes) };
}));
const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, build, files }, null, 2) + '\n');
await writeFile('dist/artifact-manifest.json', bytes);
console.log(`Sealed ${files.length} files. Manifest SHA-256: ${sha256(bytes)}`);
