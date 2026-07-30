import test from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Warlord source validation checks core alone and Exploits with class scale context', async () => {
  const { verifyWarlordSources } = await import(
    '../scripts/verify-warlord-sources.mjs'
  );
  const repositoryRoot = mkdtempSync(join(tmpdir(), 'warlord-validation-test-'));

  try {
    const core = join(repositoryRoot, 'src');
    const exploits = join(repositoryRoot, 'exploits-src');
    mkdirSync(core);
    mkdirSync(exploits);
    writeFileSync(join(core, 'core-marker.yml'), 'core: true\n');
    writeFileSync(join(exploits, 'exploit-marker.yml'), 'exploit: true\n');

    const calls = [];
    const result = await verifyWarlordSources({
      repositoryRoot,
      verifyPack: async (source, options) => {
        calls.push({
          source,
          packName: options.packName,
          hasCore: existsSync(join(source, 'core-marker.yml')),
          hasExploit: existsSync(join(source, 'exploit-marker.yml'))
        });
        return { ok: true, errors: [], warnings: [] };
      }
    });

    assert.deepEqual(calls.map(({ packName, hasCore, hasExploit }) => ({
      packName,
      hasCore,
      hasExploit
    })), [
      { packName: 'homebrew-classes', hasCore: true, hasExploit: false },
      { packName: 'homebrew-classes', hasCore: true, hasExploit: true }
    ]);
    assert.equal(readFileSync(join(core, 'core-marker.yml'), 'utf8'), 'core: true\n');
    assert.equal(
      readFileSync(join(exploits, 'exploit-marker.yml'), 'utf8'),
      'exploit: true\n'
    );
    assert.equal(existsSync(calls[1].source), false, 'combined tree is cleaned');
    assert.equal(result.core.ok, true);
    assert.equal(result.exploits.ok, true);
  } finally {
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
});
