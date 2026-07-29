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
const vesselSource = yaml.load(
  readFileSync(new URL('../src/vessel/the-vessel.yml', import.meta.url), 'utf8')
);
const mantleSource = yaml.load(
  readFileSync(
    new URL('../src/vessel/class-features/spirit-mantle.yml', import.meta.url),
    'utf8'
  )
);

function findYamlFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...findYamlFiles(path));
    else if (entry.isFile() && /\.ya?ml$/.test(entry.name)) files.push(path);
  }
  return files;
}

function role(document) {
  return document.flags?.['declan-homebrew-classes']?.vessel?.role;
}

test('committed compiled pack preserves Vessel Stage 1 source structures', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'vessel-compiled-pack-'));
  const pack = join(temporary, 'pack');
  const extracted = join(temporary, 'extracted');

  try {
    cpSync(compiledPack, pack, { recursive: true });
    await extractPack(pack, extracted, { yaml: true, recursive: true });

    const documents = findYamlFiles(extracted)
      .map(path => yaml.load(readFileSync(path, 'utf8')));
    const compiledVessel = documents.find(document => document?._id === vesselSource._id);
    const compiledMantle = documents.find(document => document?._id === mantleSource._id);
    assert.ok(compiledVessel);
    assert.ok(compiledMantle);

    const expectedScale = vesselSource.system.advancement.find(
      advancement => advancement.configuration?.identifier === 'iridescent-strike'
    );
    const compiledScale = compiledVessel.system.advancement.find(
      advancement => advancement.configuration?.identifier === 'iridescent-strike'
    );
    assert.deepEqual(compiledScale, expectedScale);

    const expectedActivities = Object.values(mantleSource.system.activities)
      .filter(activity => ['mantle-toggle', 'iridescent-strike'].includes(role(activity)));
    const compiledActivities = Object.values(compiledMantle.system.activities)
      .filter(activity => ['mantle-toggle', 'iridescent-strike'].includes(role(activity)));
    assert.deepEqual(compiledActivities, expectedActivities);

    const expectedEffect = mantleSource.effects.find(effect => role(effect) === 'mantle-ac');
    const compiledEffect = compiledMantle.effects.find(effect => role(effect) === 'mantle-ac');
    assert.deepEqual(compiledEffect, expectedEffect);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
