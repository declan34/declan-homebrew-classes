import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(
  new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url)
);
const yaml = require('js-yaml');

const initCallbacks = [];
globalThis.Hooks = {
  once(name, callback) { initCallbacks.push([name, callback]); },
  on() {}
};

const {
  ensureVesselSpellcastingModel,
  registerVesselSpellcasting
} = await import('../scripts/vessel-spellcasting.mjs');
await import('../scripts/vessel-automation.mjs');

function makeConfig() {
  return {
    spellcasting: {},
    restTypes: {
      short: { recoverSpellSlotTypes: new Set(['pact']) },
      long: { recoverSpellSlotTypes: new Set(['spell', 'pact']) }
    }
  };
}

const expectedByLevel = [
  null,
  null,
  { slots: 2, level: 1 },
  { slots: 2, level: 1 },
  { slots: 2, level: 1 },
  { slots: 2, level: 2 },
  { slots: 2, level: 2 },
  { slots: 2, level: 2 },
  { slots: 2, level: 2 },
  { slots: 2, level: 3 },
  { slots: 2, level: 3 },
  { slots: 3, level: 3 },
  { slots: 3, level: 3 },
  { slots: 3, level: 4 },
  { slots: 3, level: 4 },
  { slots: 3, level: 4 },
  { slots: 3, level: 4 },
  { slots: 4, level: 5 },
  { slots: 4, level: 5 },
  { slots: 4, level: 5 },
  { slots: 4, level: 5 }
];

test('registers the exact Vessel slot table for levels 1 through 20', () => {
  const config = makeConfig();
  assert.equal(registerVesselSpellcasting(config), true);
  const table = config.spellcasting.vessel.table;
  let current = null;
  for (let level = 1; level <= 20; level += 1) {
    if (table[level]) current = table[level];
    assert.deepEqual(current, expectedByLevel[level]);
  }
});

test('registers Vessel Magic as a spells-known casting method', () => {
  const config = makeConfig();
  assert.equal(registerVesselSpellcasting(config), true);
  assert.equal(config.spellcasting.vessel.prepares, false);
});

test('registers mutable configuration for dnd5e model conversion', () => {
  const config = makeConfig();
  registerVesselSpellcasting(config);

  assert.equal(Object.isFrozen(config.spellcasting.vessel), false);
  assert.equal(Object.isFrozen(config.spellcasting.vessel.table), false);
  assert.equal(Object.isFrozen(config.spellcasting.vessel.table[2]), false);
});

test('repairs a missing Vessel model after dnd5e converts spellcasting configuration', () => {
  assert.equal(typeof ensureVesselSpellcastingModel, 'function');

  class SingleLevelSpellcasting {
    constructor(configuration, { key }) {
      Object.assign(this, structuredClone(configuration));
      this.key = key;
      this.slots = true;
    }
  }
  const config = {
    ...makeConfig(),
    spellProgression: { none: { label: 'None' } }
  };
  const api = {
    dataModels: { spellcasting: { SingleLevelSpellcasting } }
  };

  assert.equal(ensureVesselSpellcastingModel(config, api), true);
  assert.ok(config.spellcasting.vessel instanceof SingleLevelSpellcasting);
  assert.equal(config.spellcasting.vessel.key, 'vessel');
  assert.deepEqual(config.spellProgression.vessel, {
    label: 'Vessel Magic',
    divisor: 1,
    type: 'vessel'
  });
});

test('post-conversion repair does not overwrite another module Vessel model', () => {
  class SingleLevelSpellcasting {}
  const existing = { key: 'vessel', slots: true, label: 'Another Module' };
  const config = {
    ...makeConfig(),
    spellcasting: { vessel: existing },
    spellProgression: { none: { label: 'None' } }
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(ensureVesselSpellcastingModel(config, {
      dataModels: { spellcasting: { SingleLevelSpellcasting } }
    }), false);
    assert.equal(config.spellcasting.vessel, existing);
    assert.equal(config.spellProgression.vessel, undefined);
  } finally {
    console.error = originalError;
  }
});

test('recovers Vessel slots on short and long rests', () => {
  const config = makeConfig();
  registerVesselSpellcasting(config);
  assert.equal(config.restTypes.short.recoverSpellSlotTypes.has('vessel'), true);
  assert.equal(config.restTypes.long.recoverSpellSlotTypes.has('vessel'), true);
});

test('registering the same Vessel method twice is idempotent', () => {
  const config = makeConfig();
  assert.equal(registerVesselSpellcasting(config), true);
  const registered = config.spellcasting.vessel;
  assert.equal(registerVesselSpellcasting(config), true);
  assert.equal(config.spellcasting.vessel, registered);
});

test('does not overwrite an existing Vessel spellcasting method', () => {
  const existing = { label: 'Another Module' };
  const config = makeConfig();
  config.spellcasting.vessel = existing;
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(registerVesselSpellcasting(config), false);
    assert.equal(config.spellcasting.vessel, existing);
  } finally {
    console.error = originalError;
  }
});

test('returns false when dnd5e spellcasting configuration is unavailable', () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(registerVesselSpellcasting(undefined), false);
  } finally {
    console.error = originalError;
  }
});

test('module manifest loads Vessel and Warlord automation entry points', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../module.json', import.meta.url), 'utf8')
  );
  assert.deepEqual(manifest.esmodules, [
    'scripts/vessel-spellcasting.mjs',
    'scripts/warlord-spellcasting.mjs',
    'scripts/vessel-automation.mjs',
    'scripts/warlord-automation.mjs'
  ]);
});

test('Vessel automation registers the private compendium setting during init', () => {
  const previousGame = globalThis.game;
  const previousHooks = globalThis.Hooks;
  const calls = [];
  const hookCalls = [];
  globalThis.game = {
    settings: {
      register(module, key, configuration) {
        calls.push([module, key, configuration]);
      }
    },
    packs: [
      { collection: 'private.spells', metadata: { label: 'Private Spells', type: 'Item' } }
    ]
  };
  globalThis.Hooks = {
    once(name, callback) { initCallbacks.push([name, callback]); },
    on(name) { hookCalls.push(name); }
  };

  try {
    const [, [, registerAutomation]] = initCallbacks.filter(([name]) => name === 'init');
    registerAutomation();
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].slice(0, 2), [
      'declan-homebrew-classes',
      'privateSpellCompendium'
    ]);
    assert.ok(hookCalls.length > 0);
  } finally {
    globalThis.game = previousGame;
    globalThis.Hooks = previousHooks;
  }
});

test('Vessel class selects native Vessel Magic with Charisma', () => {
  const vessel = yaml.load(
    readFileSync(new URL('../src/vessel/the-vessel.yml', import.meta.url), 'utf8')
  );
  assert.equal(vessel.system.spellcasting.progression, 'vessel');
  assert.equal(vessel.system.spellcasting.ability, 'cha');
});

test('Vessel class exposes the published spellcasting scales without a Vessel Magic use counter', () => {
  const vessel = yaml.load(
    readFileSync(new URL('../src/vessel/the-vessel.yml', import.meta.url), 'utf8')
  );
  const vesselMagic = yaml.load(
    readFileSync(
      new URL('../src/vessel/class-features/vessel-magic.yml', import.meta.url),
      'utf8'
    )
  );
  const scales = vessel.system.advancement.filter(
    advancement => advancement.type === 'ScaleValue'
  ).filter(
    advancement => [
      'cantrips-known',
      'spells-known',
      'spell-slots',
      'slot-level'
    ].includes(advancement.configuration.identifier)
  );

  assert.deepEqual(vessel.system.primaryAbility.value, ['cha']);
  assert.deepEqual(vesselMagic.system.uses, { max: '', spent: 0, recovery: [] });
  assert.deepEqual(
    Object.fromEntries(scales.map(scale => [
      scale.configuration.identifier,
      scale.configuration.scale
    ])),
    {
      'cantrips-known': {
        2: { value: 2 },
        4: { value: 3 },
        11: { value: 4 }
      },
      'spells-known': {
        2: { value: 2 },
        4: { value: 3 },
        6: { value: 4 },
        8: { value: 5 },
        10: { value: 6 },
        12: { value: 7 },
        14: { value: 8 },
        16: { value: 9 },
        18: { value: 10 },
        20: { value: 11 }
      },
      'spell-slots': {
        2: { value: 2 },
        11: { value: 3 },
        17: { value: 4 }
      },
      'slot-level': {
        2: { value: 1 },
        5: { value: 2 },
        9: { value: 3 },
        13: { value: 4 },
        17: { value: 5 }
      }
    }
  );
});

test('Archon Form has one free use per rest', () => {
  const archon = yaml.load(
    readFileSync(
      new URL('../src/vessel/class-features/archon-form.yml', import.meta.url),
      'utf8'
    )
  );
  assert.equal(String(archon.system.uses.max), '1');
  assert.deepEqual(archon.system.uses.recovery, [
    { period: 'sr', type: 'recoverAll' }
  ]);
});
