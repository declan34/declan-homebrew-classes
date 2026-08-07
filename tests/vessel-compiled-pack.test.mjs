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
const vesselAspectsCompiledPack = fileURLToPath(
  new URL('../packs/vessel-aspects/', import.meta.url)
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
const strikesSource = yaml.load(
  readFileSync(
    new URL(
      '../src/vessel/class-features/iridescent-strikes.yml',
      import.meta.url
    ),
    'utf8'
  )
);
const vesselMagicSource = yaml.load(
  readFileSync(
    new URL('../src/vessel/class-features/vessel-magic.yml', import.meta.url),
    'utf8'
  )
);
const hellfireSource = yaml.load(
  readFileSync(
    new URL(
      '../src/vessel/subclass-features/the-cursed/hellfire.yml',
      import.meta.url
    ),
    'utf8'
  )
);
const malignantAuraSource = yaml.load(
  readFileSync(
    new URL(
      '../src/vessel/subclass-features/the-cursed/malignant-aura.yml',
      import.meta.url
    ),
    'utf8'
  )
);
const direStatureSource = yaml.load(
  readFileSync(new URL('../aspects-src/dire-stature.yml', import.meta.url), 'utf8')
);
const strikingPresenceSource = yaml.load(
  readFileSync(new URL('../aspects-src/striking-presence.yml', import.meta.url), 'utf8')
);
const uncannyStrengthSource = yaml.load(
  readFileSync(new URL('../aspects-src/uncanny-strength.yml', import.meta.url), 'utf8')
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
    const compiledStrikes = documents.find(document => document?._id === strikesSource._id);
    const compiledVesselMagic = documents.find(
      document => document?._id === vesselMagicSource._id
    );
    const compiledHellfire = documents.find(
      document => document?._id === hellfireSource._id
    );
    const compiledMalignantAura = documents.find(
      document => document?._id === malignantAuraSource._id
    );
    assert.ok(compiledVessel);
    assert.ok(compiledMantle);
    assert.ok(compiledStrikes);
    assert.ok(compiledVesselMagic);
    assert.ok(compiledHellfire);
    assert.ok(compiledMalignantAura);

    assert.deepEqual(
      compiledVessel.system.primaryAbility,
      vesselSource.system.primaryAbility
    );
    assert.deepEqual(
      compiledVessel.system.spellcasting,
      vesselSource.system.spellcasting
    );
    for (const source of vesselSource.system.advancement.filter(advancement =>
      ['cantrips-known', 'spells-known', 'spell-slots', 'slot-level'].includes(
        advancement.configuration?.identifier
      )
    )) {
      const compiled = compiledVessel.system.advancement.find(
        advancement => advancement._id === source._id
      );
      assert.deepEqual(compiled, source, source.configuration.identifier);
    }
    assert.deepEqual(
      compiledVesselMagic.system.uses,
      vesselMagicSource.system.uses
    );
    assert.equal(
      compiledHellfire.system.description.value,
      hellfireSource.system.description.value,
      'Hellfire description'
    );
    assert.equal(
      compiledMalignantAura.system.description.value,
      malignantAuraSource.system.description.value,
      'Malignant Aura description'
    );

    const expectedScale = vesselSource.system.advancement.find(
      advancement => advancement.configuration?.identifier === 'iridescent-strike'
    );
    const compiledScale = compiledVessel.system.advancement.find(
      advancement => advancement.configuration?.identifier === 'iridescent-strike'
    );
    assert.deepEqual(compiledScale, expectedScale);

    assert.deepEqual(
      compiledMantle.system.activities,
      mantleSource.system.activities
    );
    assert.deepEqual(
      compiledStrikes.system.activities,
      strikesSource.system.activities
    );

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

test('committed Vessel Aspect pack preserves passive Aspect activities, flags, and effect templates', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'vessel-dire-stature-pack-'));
  const pack = join(temporary, 'pack');
  const extracted = join(temporary, 'extracted');

  try {
    cpSync(vesselAspectsCompiledPack, pack, { recursive: true });
    await extractPack(pack, extracted, { yaml: true, recursive: true });

    const documents = findYamlFiles(extracted)
      .map(path => yaml.load(readFileSync(path, 'utf8')));
    const compiledDireStature = documents.find(
      document => document?._id === direStatureSource._id
    );
    const compiledStrikingPresence = documents.find(
      document => document?._id === strikingPresenceSource._id
    );
    const compiledUncannyStrength = documents.find(
      document => document?._id === uncannyStrengthSource._id
    );
    assert.ok(compiledDireStature, 'dire-stature');
    assert.ok(compiledStrikingPresence, 'striking-presence');
    assert.ok(compiledUncannyStrength, 'uncanny-strength');
    assert.deepEqual(compiledDireStature.effects, direStatureSource.effects);
    assert.deepEqual(
      compiledStrikingPresence.system.activities,
      strikingPresenceSource.system.activities,
      'Striking Presence configure activity and flags'
    );
    assert.deepEqual(
      compiledStrikingPresence.flags,
      strikingPresenceSource.flags,
      'Striking Presence item flags'
    );
    assert.deepEqual(
      compiledUncannyStrength.effects,
      uncannyStrengthSource.effects,
      'Uncanny Strength transfer proficiency effect'
    );
    assert.deepEqual(
      compiledUncannyStrength.flags,
      uncannyStrengthSource.flags,
      'Uncanny Strength item flags'
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
