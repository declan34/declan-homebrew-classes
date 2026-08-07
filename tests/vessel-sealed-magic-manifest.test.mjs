import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SEALED_MAGIC_ENTRIES,
  sealedMagicEntriesForActor,
  validateSealedMagicEntries
} from '../scripts/vessel/sealed-magic-manifest.mjs';

const EXPECTED_ENTRIES = [
  { key: 'ascended-3-identify', name: 'Identify', subclass: 'the-ascended', vesselLevel: 3 },
  { key: 'ascended-3-shield', name: 'Shield', subclass: 'the-ascended', vesselLevel: 3 },
  { key: 'ascended-5-locate-creature', name: 'Locate Creature', subclass: 'the-ascended', vesselLevel: 5 },
  { key: 'ascended-5-invisibility', name: 'Invisibility', subclass: 'the-ascended', vesselLevel: 5 },
  { key: 'ascended-9-counterspell', name: 'Counterspell', subclass: 'the-ascended', vesselLevel: 9 },
  { key: 'ascended-9-minute-meteors', name: 'Minute Meteors', subclass: 'the-ascended', vesselLevel: 9 },
  { key: 'ascended-13-divination', name: 'Divination', subclass: 'the-ascended', vesselLevel: 13 },
  { key: 'ascended-13-resilient-sphere', name: 'Resilient Sphere', subclass: 'the-ascended', vesselLevel: 13 },
  { key: 'ascended-17-arcane-hand', name: 'Arcane Hand', subclass: 'the-ascended', vesselLevel: 17 },
  { key: 'ascended-17-commune', name: 'Commune', subclass: 'the-ascended', vesselLevel: 17 },

  { key: 'cataclysm-3-absorb-elements', name: 'Absorb Elements', subclass: 'the-cataclysm', vesselLevel: 3 },
  { key: 'cataclysm-5-elemental-blade', name: 'Elemental Blade', subclass: 'the-cataclysm', vesselLevel: 5 },
  { key: 'cataclysm-9-elemental-bane', name: 'Elemental Bane', subclass: 'the-cataclysm', vesselLevel: 9 },
  { key: 'cataclysm-13-resilient-sphere', name: 'Resilient Sphere', subclass: 'the-cataclysm', vesselLevel: 13 },
  { key: 'cataclysm-17-far-step', name: 'Far Step', subclass: 'the-cataclysm', vesselLevel: 17 },
  { key: 'cataclysm-air-3-beckon-air', name: 'Beckon Air', subclass: 'the-cataclysm', vesselLevel: 3, affinity: 'air' },
  { key: 'cataclysm-air-3-thunderwave', name: 'Thunderwave', subclass: 'the-cataclysm', vesselLevel: 3, affinity: 'air' },
  { key: 'cataclysm-air-5-dust-devil', name: 'Dust Devil', subclass: 'the-cataclysm', vesselLevel: 5, affinity: 'air' },
  { key: 'cataclysm-air-9-sonic-wave', name: 'Sonic Wave', subclass: 'the-cataclysm', vesselLevel: 9, affinity: 'air' },
  { key: 'cataclysm-air-13-storm-sphere', name: 'Storm Sphere', subclass: 'the-cataclysm', vesselLevel: 13, affinity: 'air' },
  { key: 'cataclysm-air-17-control-winds', name: 'Control Winds', subclass: 'the-cataclysm', vesselLevel: 17, affinity: 'air' },
  { key: 'cataclysm-earth-3-mold-earth', name: 'Mold Earth', subclass: 'the-cataclysm', vesselLevel: 3, affinity: 'earth' },
  { key: 'cataclysm-earth-3-earth-tremor', name: 'Earth Tremor', subclass: 'the-cataclysm', vesselLevel: 3, affinity: 'earth' },
  { key: 'cataclysm-earth-5-spike-growth', name: 'Spike Growth', subclass: 'the-cataclysm', vesselLevel: 5, affinity: 'earth' },
  { key: 'cataclysm-earth-9-erupting-earth', name: 'Erupting Earth', subclass: 'the-cataclysm', vesselLevel: 9, affinity: 'earth' },
  { key: 'cataclysm-earth-13-pillars-of-earth', name: 'Pillars of Earth', subclass: 'the-cataclysm', vesselLevel: 13, affinity: 'earth' },
  { key: 'cataclysm-earth-17-wall-of-stone', name: 'Wall of Stone', subclass: 'the-cataclysm', vesselLevel: 17, affinity: 'earth' },
  { key: 'cataclysm-fire-3-control-flame', name: 'Control Flame', subclass: 'the-cataclysm', vesselLevel: 3, affinity: 'fire' },
  { key: 'cataclysm-fire-3-hellish-rebuke', name: 'Hellish Rebuke', subclass: 'the-cataclysm', vesselLevel: 3, affinity: 'fire' },
  { key: 'cataclysm-fire-5-flaming-sphere', name: 'Flaming Sphere', subclass: 'the-cataclysm', vesselLevel: 5, affinity: 'fire' },
  { key: 'cataclysm-fire-5-misty-step', name: 'Misty Step', subclass: 'the-cataclysm', vesselLevel: 5, affinity: 'fire' },
  { key: 'cataclysm-fire-9-fireball', name: 'Fireball', subclass: 'the-cataclysm', vesselLevel: 9, affinity: 'fire' },
  { key: 'cataclysm-fire-13-wall-of-fire', name: 'Wall of Fire', subclass: 'the-cataclysm', vesselLevel: 13, affinity: 'fire' },
  { key: 'cataclysm-fire-17-flame-strike', name: 'Flame Strike', subclass: 'the-cataclysm', vesselLevel: 17, affinity: 'fire' },
  { key: 'cataclysm-water-3-shape-water', name: 'Shape Water', subclass: 'the-cataclysm', vesselLevel: 3, affinity: 'water' },
  { key: 'cataclysm-water-3-torrent', name: 'Torrent', subclass: 'the-cataclysm', vesselLevel: 3, affinity: 'water' },
  { key: 'cataclysm-water-5-misty-step', name: 'Misty Step', subclass: 'the-cataclysm', vesselLevel: 5, affinity: 'water' },
  { key: 'cataclysm-water-9-tidal-wave', name: 'Tidal Wave', subclass: 'the-cataclysm', vesselLevel: 9, affinity: 'water' },
  { key: 'cataclysm-water-13-watery-sphere', name: 'Watery Sphere', subclass: 'the-cataclysm', vesselLevel: 13, affinity: 'water' },
  { key: 'cataclysm-water-17-maelstrom', name: 'Maelstrom', subclass: 'the-cataclysm', vesselLevel: 17, affinity: 'water' },

  { key: 'cursed-3-hellish-rebuke', name: 'Hellish Rebuke', subclass: 'the-cursed', vesselLevel: 3 },
  { key: 'cursed-3-jump', name: 'Jump', subclass: 'the-cursed', vesselLevel: 3 },
  { key: 'cursed-5-flame-whip', name: 'Flame Whip', subclass: 'the-cursed', vesselLevel: 5 },
  { key: 'cursed-5-scorching-ray', name: 'Scorching Ray', subclass: 'the-cursed', vesselLevel: 5 },
  { key: 'cursed-9-fireball', name: 'Fireball', subclass: 'the-cursed', vesselLevel: 9 },
  { key: 'cursed-9-haste', name: 'Haste', subclass: 'the-cursed', vesselLevel: 9 },
  { key: 'cursed-13-dominate-creature', name: 'Dominate Creature', subclass: 'the-cursed', vesselLevel: 13 },
  { key: 'cursed-13-wall-of-fire', name: 'Wall of Fire', subclass: 'the-cursed', vesselLevel: 13 },
  { key: 'cursed-17-destructive-wave', name: 'Destructive Wave', subclass: 'the-cursed', vesselLevel: 17 },
  { key: 'cursed-17-insect-plague', name: 'Insect Plague', subclass: 'the-cursed', vesselLevel: 17 },

  { key: 'fallen-3-divine-favor', name: 'Divine Favor', subclass: 'the-fallen', vesselLevel: 3 },
  { key: 'fallen-3-ethereal-anchor', name: 'Ethereal Anchor', subclass: 'the-fallen', vesselLevel: 3 },
  { key: 'fallen-5-branding-smite', name: 'Branding Smite', subclass: 'the-fallen', vesselLevel: 5 },
  { key: 'fallen-5-spiritual-weapon', name: 'Spiritual Weapon', subclass: 'the-fallen', vesselLevel: 5 },
  { key: 'fallen-9-crusader-s-mantle', name: "Crusader's Mantle", subclass: 'the-fallen', vesselLevel: 9 },
  { key: 'fallen-9-revivify', name: 'Revivify', subclass: 'the-fallen', vesselLevel: 9 },
  { key: 'fallen-13-banishment', name: 'Banishment', subclass: 'the-fallen', vesselLevel: 13 },
  { key: 'fallen-13-guardian-of-faith', name: 'Guardian of Faith', subclass: 'the-fallen', vesselLevel: 13 },
  { key: 'fallen-17-circle-of-power', name: 'Circle of Power', subclass: 'the-fallen', vesselLevel: 17 },
  { key: 'fallen-17-flame-strike', name: 'Flame Strike', subclass: 'the-fallen', vesselLevel: 17 },

  { key: 'formless-3-caustic-brew', name: 'Caustic Brew', subclass: 'the-formless', vesselLevel: 3 },
  { key: 'formless-3-entangle', name: 'Entangle', subclass: 'the-formless', vesselLevel: 3 },
  { key: 'formless-5-hold-person', name: 'Hold Person', subclass: 'the-formless', vesselLevel: 5 },
  { key: 'formless-5-web', name: 'Web', subclass: 'the-formless', vesselLevel: 5 },
  { key: 'formless-9-grasping-vine', name: 'Grasping Vine', subclass: 'the-formless', vesselLevel: 9 },
  { key: 'formless-9-slow', name: 'Slow', subclass: 'the-formless', vesselLevel: 9 },
  { key: 'formless-13-eldritch-tentacles', name: 'Eldritch Tentacles', subclass: 'the-formless', vesselLevel: 13 },
  { key: 'formless-13-vitriolic-sphere', name: 'Vitriolic Sphere', subclass: 'the-formless', vesselLevel: 13 },
  { key: 'formless-17-contagion', name: 'Contagion', subclass: 'the-formless', vesselLevel: 17 },
  { key: 'formless-17-hold-monster', name: 'Hold Monster', subclass: 'the-formless', vesselLevel: 17 },

  { key: 'trickster-3-charm-person', name: 'Charm Person', subclass: 'the-trickster', vesselLevel: 3 },
  { key: 'trickster-3-disguise-self', name: 'Disguise Self', subclass: 'the-trickster', vesselLevel: 3 },
  { key: 'trickster-5-invisibility', name: 'Invisibility', subclass: 'the-trickster', vesselLevel: 5 },
  { key: 'trickster-5-misty-step', name: 'Misty Step', subclass: 'the-trickster', vesselLevel: 5 },
  { key: 'trickster-9-enemies-abound', name: 'Enemies Abound', subclass: 'the-trickster', vesselLevel: 9 },
  { key: 'trickster-9-hypnotic-pattern', name: 'Hypnotic Pattern', subclass: 'the-trickster', vesselLevel: 9 },
  { key: 'trickster-13-charm-monster', name: 'Charm Monster', subclass: 'the-trickster', vesselLevel: 13 },
  { key: 'trickster-13-dimension-door', name: 'Dimension Door', subclass: 'the-trickster', vesselLevel: 13 },
  { key: 'trickster-17-dream', name: 'Dream', subclass: 'the-trickster', vesselLevel: 17 },
  { key: 'trickster-17-mislead', name: 'Mislead', subclass: 'the-trickster', vesselLevel: 17 }
];

function actor(subclass, affinity) {
  return {
    itemTypes: {
      subclass: [{ type: 'subclass', system: { identifier: subclass } }]
    },
    getFlag: (_moduleId, key) => key === 'vessel.elementalAffinity' ? affinity : undefined
  };
}

test('matches all six published Sealed Magic tables with stable keys', () => {
  assert.deepEqual(SEALED_MAGIC_ENTRIES, EXPECTED_ENTRIES);
  assert.equal(Object.isFrozen(SEALED_MAGIC_ENTRIES), true);
  assert.ok(SEALED_MAGIC_ENTRIES.every(Object.isFrozen));
});

test('returns only the actor subclass entries and its Cataclysm affinity entries', () => {
  assert.deepEqual(
    sealedMagicEntriesForActor(actor('the-ascended')),
    EXPECTED_ENTRIES.filter(entry => entry.subclass === 'the-ascended')
  );
  assert.deepEqual(
    sealedMagicEntriesForActor(actor('the-cataclysm', 'water')),
    EXPECTED_ENTRIES.filter(entry => entry.subclass === 'the-cataclysm'
      && (!entry.affinity || entry.affinity === 'water'))
  );
  assert.deepEqual(
    sealedMagicEntriesForActor(actor('the-cataclysm')),
    EXPECTED_ENTRIES.filter(entry => entry.subclass === 'the-cataclysm' && !entry.affinity)
  );
});

test('uses affinity-qualified Cataclysm keys when an affinity repeats a spell', () => {
  const mistySteps = SEALED_MAGIC_ENTRIES.filter(entry =>
    entry.subclass === 'the-cataclysm'
    && entry.vesselLevel === 5
    && entry.name === 'Misty Step'
  );

  assert.deepEqual(mistySteps.map(entry => entry.key), [
    'cataclysm-fire-5-misty-step',
    'cataclysm-water-5-misty-step'
  ]);
  assert.notEqual(mistySteps[0].key, mistySteps[1].key);
});

test('rejects a duplicate stable key', () => {
  const entry = EXPECTED_ENTRIES[0];
  assert.throws(
    () => validateSealedMagicEntries([entry, { ...entry }]),
    /duplicate key/i
  );
});

test('rejects a duplicate subclass, affinity, level, and normalized name', () => {
  const entry = EXPECTED_ENTRIES[0];
  assert.throws(
    () => validateSealedMagicEntries([entry, { ...entry, key: 'ascended-3-identify-again' }]),
    /duplicate.*entry/i
  );
});

test('rejects Vessel levels outside the published class range', () => {
  for (const vesselLevel of [0, 21, 3.5]) {
    assert.throws(
      () => validateSealedMagicEntries([{ ...EXPECTED_ENTRIES[0], vesselLevel }]),
      /Vessel level/i
    );
  }
});

test('rejects unknown elemental affinities', () => {
  assert.throws(
    () => validateSealedMagicEntries([{
      ...EXPECTED_ENTRIES.find(entry => entry.affinity === 'air'),
      affinity: 'void'
    }]),
    /affinity/i
  );
});
