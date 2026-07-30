import {
  cpSync,
  mkdtempSync,
  readdirSync,
  rmSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = resolve(scriptDirectory, '..');

async function defaultVerifyPack(source, options) {
  const verifier = await import('../../dnd5e-pdf-importer/emit/verify.mjs');
  return verifier.verifyPack(source, options);
}

/**
 * Validate the standalone class source, then validate Exploits in a temporary
 * combined tree so their Warlord class scale references can resolve.
 */
export async function verifyWarlordSources({
  repositoryRoot = defaultRepositoryRoot,
  verifyPack = defaultVerifyPack
} = {}) {
  const coreSource = join(repositoryRoot, 'src');
  const exploitSource = join(repositoryRoot, 'exploits-src');
  const temporary = mkdtempSync(join(tmpdir(), 'warlord-source-validation-'));
  const combinedSource = join(temporary, 'combined');

  try {
    const core = await verifyPack(coreSource, {
      packName: 'homebrew-classes'
    });

    cpSync(coreSource, combinedSource, { recursive: true });
    for (const entry of readdirSync(exploitSource)) {
      cpSync(
        join(exploitSource, entry),
        join(combinedSource, entry),
        { recursive: true, force: true }
      );
    }

    const exploits = await verifyPack(combinedSource, {
      packName: 'homebrew-classes'
    });
    return { core, exploits };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function summary(result) {
  return JSON.stringify({
    ok: result.ok,
    errors: result.errors.length
  });
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;

if (invokedPath === import.meta.url) {
  try {
    const results = await verifyWarlordSources();
    console.log(`homebrew-classes ${summary(results.core)}`);
    console.log(`warlord-exploits-with-class-context ${summary(results.exploits)}`);
    for (const error of results.core.errors) console.error(error);
    for (const error of results.exploits.errors) console.error(error);
    if (!results.core.ok || !results.exploits.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
