import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

import { verifyPublicContent } from '../scripts/verify-public-content.mjs';

const require = createRequire(
  new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url)
);
const yaml = require('js-yaml');

function loadYaml(path) {
  return yaml.load(readFileSync(path, 'utf8'));
}

function writeSpell(root, name, document) {
  const source = join(root, 'spells-src');
  mkdirSync(source, { recursive: true });
  writeFileSync(join(source, name), yaml.dump(document));
}

function withTemporaryRepository(callback) {
  const root = mkdtempSync(join(tmpdir(), 'public-content-policy-'));
  return Promise.resolve(callback(root)).finally(() => {
    rmSync(root, { recursive: true, force: true });
  });
}

test('accepts explicitly attributed authorized homebrew spells', async () => {
  await withTemporaryRepository(async root => {
    writeSpell(root, 'allowed.yml', {
      name: 'Example Homebrew',
      type: 'spell',
      system: {
        source: {
          license: 'proprietary',
          custom: 'Laser Llama Original'
        }
      }
    });
    const result = await verifyPublicContent({ repositoryRoot: root, loadYaml });
    assert.equal(result.ok, true);
    assert.equal(result.spellCount, 1);
  });
});

test('accepts only the approved homebrew and SRD source labels', async () => {
  await withTemporaryRepository(async root => {
    writeSpell(root, 'homebrew.yml', {
      type: 'spell',
      system: { source: { license: 'proprietary', custom: 'Laser Llama Original' } }
    });
    writeSpell(root, 'srd-51.yml', {
      type: 'spell',
      system: { source: { license: 'CC-BY-4.0', custom: 'SRD 5.1' } }
    });
    writeSpell(root, 'srd-521.yml', {
      type: 'spell',
      system: { source: { license: 'CC-BY-4.0', custom: 'SRD 5.2.1' } }
    });
    const result = await verifyPublicContent({ repositoryRoot: root, loadYaml });
    assert.equal(result.ok, true);
    assert.equal(result.spellCount, 3);
  });
});

test('rejects proprietary spells without an approved homebrew source', async () => {
  await withTemporaryRepository(async root => {
    writeSpell(root, 'commercial.yml', {
      name: 'Unclassified Spell',
      type: 'spell',
      system: { source: { license: 'proprietary', custom: '' } }
    });
    const result = await verifyPublicContent({ repositoryRoot: root, loadYaml });
    assert.equal(result.ok, false);
    assert.match(result.errors[0], /approved homebrew source/i);
  });
});

test('rejects unsupported license and source combinations', async () => {
  await withTemporaryRepository(async root => {
    writeSpell(root, 'wrong-license.yml', {
      type: 'spell',
      system: { source: { license: 'OGL-1.0a', custom: 'SRD 5.1' } }
    });
    writeSpell(root, 'wrong-homebrew-source.yml', {
      type: 'spell',
      system: { source: { license: 'proprietary', custom: 'Someone Else' } }
    });
    writeSpell(root, 'wrong-srd-source.yml', {
      type: 'spell',
      system: { source: { license: 'CC-BY-4.0', custom: 'SRD 5.0' } }
    });
    const result = await verifyPublicContent({ repositoryRoot: root, loadYaml });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /unsupported license/i);
    assert.match(result.errors.join('\n'), /approved homebrew source/i);
    assert.match(result.errors.join('\n'), /approved SRD source/i);
  });
});

test('rejects malformed YAML and non-spell Items in spells-src', async () => {
  await withTemporaryRepository(async root => {
    const source = join(root, 'spells-src');
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, 'malformed.yml'), 'type: [spell\n');
    writeSpell(root, 'not-a-spell.yml', {
      type: 'weapon',
      system: { source: { license: 'proprietary', custom: 'Laser Llama Original' } }
    });
    const result = await verifyPublicContent({ repositoryRoot: root, loadYaml });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /malformed\.yml.*malformed YAML/i);
    assert.match(result.errors.join('\n'), /not-a-spell\.yml.*type spell/i);
  });
});

test('rejects spells without system.source metadata', async () => {
  await withTemporaryRepository(async root => {
    writeSpell(root, 'missing-source.yml', { type: 'spell', system: {} });
    const result = await verifyPublicContent({ repositoryRoot: root, loadYaml });
    assert.equal(result.ok, false);
    assert.match(result.errors[0], /system\.source/i);
  });
});

test('rejects private artifacts and forbidden public paths', async () => {
  await withTemporaryRepository(async root => {
    mkdirSync(join(root, 'private-spells'), { recursive: true });
    writeFileSync(join(root, 'private-spells', 'spell.yml'), 'type: spell\n');
    const result = await verifyPublicContent({ repositoryRoot: root, loadYaml });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /private-spells/);
  });
});
