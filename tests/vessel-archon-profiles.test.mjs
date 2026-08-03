import test from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  readFileSync,
  readdirSync
} from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(
  new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url)
);
const yaml = require('js-yaml');
const sourceDirectory = new URL('../archon-src/', import.meta.url);

const APPROVED_TOKEN_ART = Object.freeze({
  ascended: 'systems/dnd5e/tokens/celestial/Solar.webp',
  'cataclysm-air': 'systems/dnd5e/tokens/elemental/WindElemental.webp',
  'cataclysm-earth': 'systems/dnd5e/tokens/elemental/EarthElemental.webp',
  'cataclysm-fire': 'systems/dnd5e/tokens/elemental/FireElemental.webp',
  'cataclysm-water': 'systems/dnd5e/tokens/elemental/WaterElemental.webp',
  cursed: 'systems/dnd5e/tokens/fiend/PitFiend.webp',
  fallen: 'systems/dnd5e/tokens/fiend/FallenArchangelSwordSpear.webp',
  formless: 'systems/dnd5e/tokens/ooze/OchreJelly.webp',
  trickster: 'systems/dnd5e/tokens/monstrosity/Doppelganger.webp'
});

const EXPECTED = {
  ascended: {
    id: 'hbrAscArchon0001',
    subclass: 'the-ascended',
    affinity: undefined,
    acBonus: 0,
    type: 'humanoid',
    movement: { walk: 30, fly: 10, hover: true },
    senses: {},
    resistance: [],
    customResistance: 'All damage from spells',
    immunity: [],
    conditions: [],
    languages: ['primordial'],
    skills: ['arc', 'his', 'rel'],
    traits: ['Arcane Blast', 'Astral Step']
  },
  'cataclysm-air': {
    id: 'hbrAirArchon0001',
    subclass: 'the-cataclysm',
    affinity: 'air',
    acBonus: 0,
    type: 'elemental',
    movement: { walk: 20, fly: 30, hover: true },
    senses: {},
    resistance: ['lightning', 'thunder'],
    customResistance: '',
    immunity: [],
    conditions: [],
    languages: ['auran'],
    skills: ['acr', 'ste'],
    traits: ['Bluster', 'Elder Elemental', 'Gaseous']
  },
  'cataclysm-earth': {
    id: 'hbrErtArchon0001',
    subclass: 'the-cataclysm',
    affinity: 'earth',
    acBonus: 2,
    type: 'elemental',
    movement: { walk: 30, climb: 30, burrow: 10 },
    senses: { tremorsense: 10 },
    resistance: ['acid', 'poison'],
    customResistance: '',
    immunity: [],
    conditions: [],
    languages: ['terran'],
    skills: ['ath', 'itm'],
    traits: ['Elder Elemental', 'Rock Solid', 'Siege Monster']
  },
  'cataclysm-fire': {
    id: 'hbrFirArchon0001',
    subclass: 'the-cataclysm',
    affinity: 'fire',
    acBonus: 0,
    type: 'elemental',
    movement: { walk: 40 },
    senses: {},
    resistance: ['fire', 'radiant'],
    customResistance: '',
    immunity: [],
    conditions: [],
    languages: ['ignan'],
    skills: ['acr', 'itm'],
    traits: ['Elder Elemental', 'Illumination', 'Searing Flame']
  },
  'cataclysm-water': {
    id: 'hbrWatArchon0001',
    subclass: 'the-cataclysm',
    affinity: 'water',
    acBonus: 0,
    type: 'elemental',
    movement: { walk: 30, swim: 50 },
    senses: { darkvision: 120 },
    resistance: ['acid', 'cold'],
    customResistance: '',
    immunity: [],
    conditions: [],
    languages: ['aquan'],
    skills: ['acr', 'ste'],
    traits: ['Aqueous', 'Elder Elemental', 'Fluid Resilience']
  },
  cursed: {
    id: 'hbrCurArchon0001',
    subclass: 'the-cursed',
    affinity: undefined,
    acBonus: 1,
    type: 'fiend',
    movement: { walk: 40, climb: 40 },
    senses: { darkvision: 60 },
    resistance: ['fire', 'poison'],
    customResistance: '',
    immunity: [],
    conditions: [],
    languages: ['infernal'],
    skills: ['itm', 'ste'],
    traits: ['Frenzy', 'Infernal Drain']
  },
  fallen: {
    id: 'hbrFalArchon0001',
    subclass: 'the-fallen',
    affinity: undefined,
    acBonus: 2,
    type: 'celestial',
    movement: { walk: 30 },
    senses: { darkvision: 60 },
    resistance: ['necrotic', 'radiant'],
    customResistance: '',
    immunity: [],
    conditions: [],
    languages: ['celestial'],
    skills: ['itm', 'rel'],
    traits: ['Divine Ward', 'Wings of Wrath']
  },
  formless: {
    id: 'hbrForArchon0001',
    subclass: 'the-formless',
    affinity: undefined,
    acBonus: 1,
    type: 'ooze',
    movement: { walk: 30, climb: 30 },
    senses: { blindsight: 60 },
    specialSense: 'Blind beyond this radius',
    resistance: ['acid', 'poison'],
    customResistance: '',
    immunity: [],
    conditions: ['grappled', 'restrained'],
    languages: ['primordial'],
    skills: [],
    traits: ['Pseudopods', 'Sticky Slime']
  },
  trickster: {
    id: 'hbrTriArchon0001',
    subclass: 'the-trickster',
    affinity: undefined,
    acBonus: 0,
    type: 'fey',
    movement: { walk: 30 },
    senses: { darkvision: 60 },
    resistance: [],
    customResistance: '',
    immunity: [],
    conditions: ['charmed', 'frightened'],
    languages: ['sylvan'],
    skills: ['dec', 'ste'],
    traits: ['Juxtapose', 'Stolen Memory']
  }
};

function loadProfiles() {
  if (!existsSync(sourceDirectory)) return [];
  return readdirSync(sourceDirectory)
    .filter(name => name.endsWith('.yml') && name !== '_folder.yml')
    .map(name => yaml.load(readFileSync(new URL(name, sourceDirectory), 'utf8')));
}

function compactMovement(movement) {
  return Object.fromEntries(
    Object.entries(movement ?? {})
      .filter(([key, value]) => ['walk', 'fly', 'climb', 'burrow', 'swim', 'hover'].includes(key)
        && value !== null && value !== false)
      .map(([key, value]) => [key, typeof value === 'string' ? Number(value) : value])
  );
}

function compactSenses(senses) {
  return Object.fromEntries(
    Object.entries(senses?.ranges ?? {})
      .filter(([, value]) => value !== null)
  );
}

function sorted(value) {
  return [...(value ?? [])].sort();
}

test('the source pack inventories exactly the nine published Archon profiles', () => {
  const profiles = loadProfiles();
  assert.equal(profiles.length, 9);
  assert.deepEqual(
    new Set(profiles.map(profile =>
      profile.flags?.['declan-homebrew-classes']?.vessel?.archon?.profile
    )),
    new Set(Object.keys(EXPECTED))
  );
  assert.equal(new Set(profiles.map(profile => profile._id)).size, 9);
});

test('every Archon profile uses its approved built-in dnd5e token artwork', () => {
  const byProfile = new Map(loadProfiles().map(profile => [
    profile.flags?.['declan-homebrew-classes']?.vessel?.archon?.profile,
    profile
  ]));
  for (const [profile, img] of Object.entries(APPROVED_TOKEN_ART)) {
    assert.equal(byProfile.get(profile)?.img, img, profile);
  }
});

test('Archon profile sources encode only the published form statistics', () => {
  const profiles = loadProfiles();
  const byProfile = new Map(profiles.map(profile => [
    profile.flags?.['declan-homebrew-classes']?.vessel?.archon?.profile,
    profile
  ]));

  for (const [profileId, expected] of Object.entries(EXPECTED)) {
    const profile = byProfile.get(profileId);
    assert.ok(profile, `missing profile ${profileId}`);
    const metadata =
      profile.flags['declan-homebrew-classes'].vessel.archon;

    assert.equal(profile._id, expected.id, profileId);
    assert.match(profile._id, /^[A-Za-z0-9]{16}$/);
    assert.equal(profile.type, 'npc', profileId);
    assert.equal(profile.system.traits.size, 'med', profileId);
    assert.equal(profile.system.details.type.value, expected.type, profileId);
    assert.equal(profile.system.details.type.subtype, 'Shapechanger', profileId);
    assert.deepEqual(compactMovement(profile.system.attributes.movement), expected.movement, profileId);
    assert.deepEqual(compactSenses(profile.system.attributes.senses), expected.senses, profileId);
    assert.equal(
      profile.system.attributes.senses.special,
      expected.specialSense ?? '',
      profileId
    );
    assert.deepEqual(sorted(profile.system.traits.dr.value), sorted(expected.resistance), profileId);
    assert.equal(profile.system.traits.dr.custom, expected.customResistance, profileId);
    assert.deepEqual(sorted(profile.system.traits.di.value), sorted(expected.immunity), profileId);
    assert.deepEqual(sorted(profile.system.traits.ci.value), sorted(expected.conditions), profileId);
    assert.deepEqual(sorted(profile.system.traits.languages.value), sorted(expected.languages), profileId);
    assert.deepEqual(
      sorted(Object.entries(profile.system.skills)
        .filter(([, skill]) => skill.value === 1)
        .map(([key]) => key)),
      sorted(expected.skills),
      profileId
    );
    assert.equal(metadata.subclass, expected.subclass, profileId);
    assert.equal(metadata.affinity, expected.affinity, profileId);
    assert.equal(metadata.acBonus, expected.acBonus, profileId);
    assert.deepEqual(
      sorted(profile.items.map(item => item.name)),
      sorted(expected.traits),
      profileId
    );
  }
});

test('embedded Archon traits remain native feats with only tagged activities', () => {
  const profiles = loadProfiles();
  const items = profiles.flatMap(profile => profile.items);
  assert.equal(items.length, 22);
  assert.equal(new Set(items.map(item => item._id)).size, items.length);

  for (const profile of profiles) {
    for (const item of profile.items) {
      assert.equal(item.type, 'feat', item.name);
      assert.match(item._id, /^[A-Za-z0-9]{16}$/, item.name);
      assert.equal(item._key, `!actors.items!${profile._id}.${item._id}`);
      assert.match(item.system.description.value, /^<p>.+<\/p>$/, item.name);
      for (const activity of Object.values(item.system.activities)) {
        assert.match(activity._id, /^[A-Za-z0-9]{16}$/, item.name);
        assert.ok(
          activity.flags?.['declan-homebrew-classes']?.vessel?.role,
          item.name
        );
      }
    }
  }
});

test('Ascended spell resistance is descriptive instead of blanket damage resistance', () => {
  const ascended = loadProfiles().find(profile =>
    profile.flags?.['declan-homebrew-classes']?.vessel?.archon?.profile === 'ascended'
  );
  assert.ok(ascended);
  assert.deepEqual(ascended.system.traits.dr.value, []);
  assert.equal(ascended.system.traits.dr.custom, 'All damage from spells');
});

test('the module exposes the Archon profiles as a player-readable Actor pack', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../module.json', import.meta.url), 'utf8')
  );
  const pack = manifest.packs.find(candidate =>
    candidate.name === 'vessel-archon-forms'
  );

  assert.deepEqual(pack, {
    name: 'vessel-archon-forms',
    label: 'Archon Forms (Vessel)',
    path: 'packs/vessel-archon-forms',
    type: 'Actor',
    system: 'dnd5e',
    ownership: {
      PLAYER: 'OBSERVER',
      ASSISTANT: 'OWNER'
    }
  });
});

test('all Archon source document IDs and modification-user IDs are Foundry-safe', () => {
  const folder = yaml.load(
    readFileSync(new URL('_folder.yml', sourceDirectory), 'utf8')
  );
  const profiles = loadProfiles();
  const documents = [folder, ...profiles, ...profiles.flatMap(profile => profile.items)];

  for (const document of documents) {
    assert.match(document._id, /^[A-Za-z0-9]{16}$/, document.name);
    assert.match(
      document._stats.lastModifiedBy,
      /^[A-Za-z0-9]{16}$/,
      document.name
    );
  }
  assert.equal(folder._key, `!folders!${folder._id}`);
  for (const profile of profiles) {
    assert.equal(profile._key, `!actors!${profile._id}`);
  }
});
