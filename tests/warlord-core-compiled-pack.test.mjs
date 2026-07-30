import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(
  new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url)
);
const yaml = require('js-yaml');
const cliEntry = require.resolve('@foundryvtt/foundryvtt-cli');
const { extractPack } = await import(pathToFileURL(cliEntry));

const compiledPack = fileURLToPath(
  new URL('../packs/homebrew-classes/', import.meta.url)
);
const featureIdentifiers = [
  'leadership-style',
  'tactical-exploits',
  'inspiring-word',
  'rallying-cry',
  'tactical-superiority'
];
const warlordSource = loadYaml('../src/warlord/the-warlord.yml');
const featureSources = featureIdentifiers.map(identifier => loadYaml(
  `../src/warlord/class-features/${identifier}.yml`
));

function loadYaml(path) {
  return yaml.load(readFileSync(new URL(path, import.meta.url), 'utf8'));
}

function findYamlFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...findYamlFiles(path));
    else if (entry.isFile() && /\.ya?ml$/.test(entry.name)) files.push(path);
  }
  return files;
}

function scaleValues(document) {
  return document.system.advancement.filter(
    advancement => advancement.type === 'ScaleValue'
  );
}

test('committed compiled pack preserves Warlord core feature automation and scales', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'warlord-core-compiled-pack-'));
  const pack = join(temporary, 'pack');
  const extracted = join(temporary, 'extracted');

  try {
    cpSync(compiledPack, pack, { recursive: true });
    await extractPack(pack, extracted, { yaml: true, recursive: true });

    const documents = findYamlFiles(extracted)
      .map(path => yaml.load(readFileSync(path, 'utf8')));

    for (const source of featureSources) {
      const compiled = documents.find(document => document?._id === source._id);
      assert.ok(compiled, `expected compiled ${source.name}`);
      assert.deepEqual(compiled.system.uses, source.system.uses, source.name);
      assert.deepEqual(compiled.system.activities, source.system.activities, source.name);
      assert.deepEqual(compiled.flags, source.flags, source.name);
    }

    const compiledWarlord = documents.find(
      document => document?._id === warlordSource._id
    );
    assert.ok(compiledWarlord, 'expected compiled The Warlord');

    for (const sourceScale of scaleValues(warlordSource)) {
      const compiledScale = scaleValues(compiledWarlord).find(
        scale => scale.configuration.identifier === sourceScale.configuration.identifier
      );
      assert.deepEqual(compiledScale, sourceScale, sourceScale.configuration.identifier);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
