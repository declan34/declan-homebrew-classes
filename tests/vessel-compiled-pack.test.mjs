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
const archonControlSources = [
  'the-ascended',
  'the-cataclysm',
  'the-cursed',
  'the-fallen',
  'the-formless',
  'the-trickster'
].map(subclass => yaml.load(readFileSync(
  new URL(
    `../src/vessel/subclass-features/${subclass}/archon-form-control.yml`,
    import.meta.url
  ),
  'utf8'
)));
const stage3FeatureSources = [
  '../src/vessel/subclass-features/the-cataclysm/cataclysmic-eruption.yml',
  '../src/vessel/subclass-features/the-fallen/divine-wrath.yml',
  '../src/vessel/subclass-features/the-fallen/condemnation.yml',
  '../src/vessel/subclass-features/the-formless/drain-vitality.yml'
].map(path => yaml.load(readFileSync(new URL(path, import.meta.url), 'utf8')));

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

test('committed compiled pack preserves Vessel automation source structures', async () => {
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

    for (const control of archonControlSources) {
      const compiledControl = documents.find(document => document?._id === control._id);
      assert.ok(compiledControl, control.system.identifier);
      assert.deepEqual(
        compiledControl.system.activities,
        control.system.activities,
        `${control.system.identifier} activities`
      );
      assert.deepEqual(
        compiledControl.flags?.['declan-homebrew-classes']?.vessel?.archon,
        control.flags?.['declan-homebrew-classes']?.vessel?.archon,
        `${control.system.identifier} profile metadata`
      );
    }

    for (const source of stage3FeatureSources) {
      const compiled = documents.find(document => document?._id === source._id);
      assert.ok(compiled, source.system.identifier);
      assert.deepEqual(
        compiled.system.activities,
        source.system.activities,
        `${source.system.identifier} activities`
      );
      assert.deepEqual(compiled.effects, source.effects, `${source.system.identifier} effects`);
      assert.deepEqual(
        compiled.flags?.['declan-homebrew-classes'],
        source.flags?.['declan-homebrew-classes'],
        `${source.system.identifier} module flags`
      );
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
