import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(
  new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url)
);
const yaml = require('js-yaml');

const callbacks = [];
globalThis.Hooks = {
  once(name, callback) { callbacks.push([name, callback]); },
  on() {}
};

const {
  ensureZealSpellcastingModel,
  registerZealSpellcasting
} = await import('../scripts/warlord-spellcasting.mjs');
const { configureLeadershipItems } = await import('../scripts/warlord/leadership.mjs');

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
  null, null, null,
  { slots: 1, level: 1 },
  { slots: 2, level: 1 },
  { slots: 2, level: 1 },
  { slots: 2, level: 1 },
  { slots: 2, level: 2 },
  { slots: 2, level: 2 },
  { slots: 2, level: 2 },
  { slots: 2, level: 2 },
  { slots: 2, level: 2 },
  { slots: 2, level: 2 },
  { slots: 2, level: 3 },
  { slots: 2, level: 3 },
  { slots: 2, level: 3 },
  { slots: 2, level: 3 },
  { slots: 2, level: 3 },
  { slots: 2, level: 3 },
  { slots: 2, level: 4 },
  { slots: 2, level: 4 }
];

test('registers the published Zeal slot table for Warlord levels 3 through 20', () => {
  const config = makeConfig();
  assert.equal(registerZealSpellcasting(config), true);
  const table = config.spellcasting.zeal.table;
  let current = null;
  for (let level = 1; level <= 20; level += 1) {
    if (table[level]) current = table[level];
    assert.deepEqual(current, expectedByLevel[level]);
  }
});

test('registers Zeal as spells-known casting recovered on short and long rests', () => {
  const config = makeConfig();
  registerZealSpellcasting(config);

  assert.equal(config.spellcasting.zeal.prepares, false);
  assert.equal(config.spellcasting.zeal.cantrips, true);
  assert.equal(config.restTypes.short.recoverSpellSlotTypes.has('zeal'), true);
  assert.equal(config.restTypes.long.recoverSpellSlotTypes.has('zeal'), true);
});

test('repairs the Zeal data model after dnd5e converts spellcasting configuration', () => {
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

  assert.equal(ensureZealSpellcastingModel(config, {
    dataModels: { spellcasting: { SingleLevelSpellcasting } }
  }), true);
  assert.equal(config.spellcasting.zeal.key, 'zeal');
  assert.deepEqual(config.spellProgression.zeal, {
    label: 'Zeal Spellcasting',
    divisor: 1,
    type: 'zeal'
  });
});

test('Academy of Zeal selects the custom known-spells progression', () => {
  const zeal = yaml.load(readFileSync(
    new URL('../src/warlord/academy-of-zeal.yml', import.meta.url),
    'utf8'
  ));

  assert.equal(zeal.system.spellcasting.progression, 'zeal');
  assert.equal(zeal.system.spellcasting.preparation.formula, '');
  assert.doesNotMatch(
    zeal.system.description.value,
    /Restoration|Conjure Volley|Ethereal Anchor|laserllama's Compendium of Spells/i
  );
  const scales = Object.fromEntries(zeal.system.advancement
    .filter(advancement => advancement.type === 'ScaleValue')
    .map(advancement => [
      advancement.configuration.identifier,
      advancement.configuration.scale
    ]));
  assert.deepEqual(scales, {
    'cantrips-known': {
      3: { value: 2 },
      10: { value: 3 }
    },
    'spells-known': {
      3: { value: 2 },
      5: { value: 3 },
      7: { value: 4 },
      9: { value: 5 },
      11: { value: 6 },
      13: { value: 7 },
      15: { value: 8 },
      17: { value: 9 },
      19: { value: 10 }
    }
  });
});

test('Leadership selection synchronizes the actor-owned Zeal casting ability', async () => {
  const updates = [];
  const zeal = {
    type: 'subclass',
    system: {
      identifier: 'academy-of-zeal',
      spellcasting: { progression: 'none', ability: 'cha' },
      activities: {}
    },
    async update(changes) {
      updates.push(changes);
      if (changes['system.spellcasting.ability']) {
        this.system.spellcasting.ability = changes['system.spellcasting.ability'];
      }
      if (changes['system.spellcasting.progression']) {
        this.system.spellcasting.progression = changes['system.spellcasting.progression'];
      }
    }
  };
  const actor = { isOwner: true, items: [zeal] };

  assert.equal(await configureLeadershipItems(actor, 'wis'), true);
  assert.equal(zeal.system.spellcasting.ability, 'wis');
  assert.equal(zeal.system.spellcasting.progression, 'zeal');
  assert.deepEqual(updates, [{
    'system.spellcasting.progression': 'zeal',
    'system.spellcasting.ability': 'wis'
  }]);
});
