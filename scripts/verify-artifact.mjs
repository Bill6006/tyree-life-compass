import { readFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, verifyLocal, verifyRemote } from './artifact.mjs';

export async function run(args = process.argv.slice(2)) {
  const option = (name, fallback) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
  const url = option('--url', null);
  const bytes = await readFile(option('--manifest', 'dist/artifact-manifest.json'));
  const manifest = JSON.parse(bytes.toString('utf8'));
  const attempts = Number(option('--attempts', '1'));
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      if (url) await verifyRemote(url, bytes);
      else await verifyLocal('dist', manifest);
      const summary = `${url ? 'Deployed files' : 'Tested artifact'} verified: ${manifest.files.length} files\nSource: ${manifest.build.commit}\nManifest SHA-256: ${sha256(bytes)}`;
      console.log(summary);
      if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n### ${url ? 'Live deployment verified' : 'Tested artifact verified'}\n\n${summary.replaceAll('\n', '  \n')}\n`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        console.log(`Verification attempt ${attempt}/${attempts}: ${error.message}. Waiting for the deployed files.`);
        await new Promise((done) => setTimeout(done, 5000));
      }
    }
  }
  throw lastError;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
