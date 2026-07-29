import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(
  new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url)
);
const yaml = require('js-yaml');

const {
  VESSEL_MIGRATION_VERSION,
  migrateVesselActor
} = await import('../scripts/vessel/migration.mjs');

const MODULE_ID = 'declan-homebrew-classes';
const MIGRATION_FLAG = 'vessel.migrationVersion';
const SCALE_ID = 'ZReRcAXx7wv1xOTO';
const EFFECT_ID = '9VejV6Hl6RdY5Gzt';
const ACTIVITY_IDS = [
  '0I7T8AlyrNTKpU0h',
  'gDrrUixnPXPLBDHB',
  'dWCAZNHBAwxBjUw7'
];

const vesselSource = yaml.load(
  readFileSync(new URL('../src/vessel/the-vessel.yml', import.meta.url), 'utf8')
);
const mantleSource = yaml.load(
  readFileSync(
    new URL('../src/vessel/class-features/spirit-mantle.yml', import.meta.url),
    'utf8'
  )
);

function document(data) {
  return {
    ...structuredClone(data),
    toObject() {
      const { toObject, ...source } = this;
      return structuredClone(source);
    }
  };
}

function mapping(entries = []) {
  return new Map(entries.map(entry => [entry._id, document(entry)]));
}

function ownedItem(data) {
  const source = structuredClone(data);
  const item = {
    ...source,
    identifier: source.system.identifier,
    system: {
      ...source.system,
      advancement: mapping(source.system.advancement ?? []),
      activities: mapping(Object.values(source.system.activities ?? {}))
    },
    effects: mapping(source.effects ?? []),
    operations: [],
    async update(update) {
      this.operations.push(['update', structuredClone(update)]);
      for (const [path, value] of Object.entries(update)) {
        const advancement = path.match(/^system\.advancement\.([^.]+)$/);
        if (advancement) {
          throw new Error(
            'legacy advancement mappings require the dnd5e advancement API'
          );
        }
        const activity = path.match(/^system\.activities\.([^.]+)$/);
        if (activity) {
          this.system.activities.set(activity[1], document(value));
          continue;
        }
        throw new Error(`Unexpected Item update path: ${path}`);
      }
    },
    async createAdvancement(type, data, options) {
      assert.equal(type, data.type);
      assert.deepEqual(options, { renderSheet: false });
      this.operations.push(['createAdvancement', structuredClone(data)]);
      this.system.advancement.set(data._id, document(data));
    },
    async updateAdvancement(id, data) {
      assert.equal(id, data._id);
      this.operations.push(['updateAdvancement', structuredClone(data)]);
      this.system.advancement.set(id, document(data));
    },
    async createEmbeddedDocuments(type, rows, options) {
      assert.equal(type, 'ActiveEffect');
      assert.deepEqual(options, { keepId: true });
      this.operations.push(['createEmbeddedDocuments', structuredClone(rows)]);
      for (const row of rows) this.effects.set(row._id, document(row));
      return rows.map(row => this.effects.get(row._id));
    },
    async updateEmbeddedDocuments(type, rows) {
      assert.equal(type, 'ActiveEffect');
      this.operations.push(['updateEmbeddedDocuments', structuredClone(rows)]);
      for (const row of rows) this.effects.set(row._id, document(row));
      return rows.map(row => this.effects.get(row._id));
    }
  };
  return item;
}

function sourceItems() {
  return {
    vessel: ownedItem(vesselSource),
    mantle: ownedItem(mantleSource)
  };
}

function legacyActor({ vessel, mantle } = {}) {
  const vesselItem = vessel ?? ownedItem({
    ...vesselSource,
    system: {
      ...vesselSource.system,
      advancement: vesselSource.system.advancement.filter(
        advancement => advancement._id !== SCALE_ID
      )
    }
  });
  const mantleItem = mantle ?? ownedItem({
    ...mantleSource,
    system: {
      ...mantleSource.system,
      activities: {
        CustomActivity01: {
          _id: 'CustomActivity01',
          type: 'utility',
          name: 'User Activity'
        }
      }
    },
    effects: []
  });
  const items = new Map([
    [vesselItem._id, vesselItem],
    [mantleItem._id, mantleItem]
  ]);

  return {
    isOwner: true,
    items,
    flags: {},
    operations: [],
    getFlag(scope, key) {
      if (scope !== MODULE_ID || key !== MIGRATION_FLAG) return undefined;
      return this.flags?.[MODULE_ID]?.vessel?.migrationVersion;
    },
    async setFlag(scope, key, value) {
      this.operations.push(['setFlag', scope, key, value]);
      this.flags[scope] ??= {};
      this.flags[scope].vessel ??= {};
      this.flags[scope].vessel.migrationVersion = value;
    }
  };
}

test('migrates legacy actor-owned Vessel automation without replacing custom structures', async () => {
  const target = legacyActor();
  const vesselItem = target.items.get(vesselSource._id);
  const mantleItem = target.items.get(mantleSource._id);

  assert.equal(await migrateVesselActor(target, {
    loadSourceItems: async () => sourceItems()
  }), true);

  const scale = vesselItem.system.advancement.get(SCALE_ID).toObject();
  assert.equal(scale.configuration.identifier, 'iridescent-strike');
  assert.deepEqual(scale.configuration.scale, {
    1: { number: null, faces: 6, modifiers: [] },
    5: { number: null, faces: 8, modifiers: [] },
    11: { number: null, faces: 10, modifiers: [] },
    17: { number: null, faces: 12, modifiers: [] }
  });

  for (const id of ACTIVITY_IDS) assert.ok(mantleItem.system.activities.has(id));
  assert.equal(
    mantleItem.system.activities.get('CustomActivity01').name,
    'User Activity'
  );
  assert.deepEqual(
    mantleItem.effects.get(EFFECT_ID).changes,
    [{
      key: 'system.attributes.ac.min',
      mode: 4,
      value: '10 + @abilities.con.mod + @abilities.cha.mod',
      priority: 20
    }]
  );
  assert.equal(
    target.getFlag(MODULE_ID, MIGRATION_FLAG),
    VESSEL_MIGRATION_VERSION
  );
});

test('repairs module-owned fields, preserves customization and state, and is idempotent', async () => {
  const vesselData = structuredClone(vesselSource);
  const scale = vesselData.system.advancement.find(
    advancement => advancement._id === SCALE_ID
  );
  scale.title = 'My Iridescent Die';
  scale.hint = 'Keep this note';
  scale.value = { 5: 'd20' };
  scale.configuration.identifier = 'broken';

  const mantleData = structuredClone(mantleSource);
  const strike = mantleData.system.activities.gDrrUixnPXPLBDHB;
  strike.name = 'My Spirit Punch';
  strike.description.chatFlavor = 'Custom flavor';
  strike.uses.spent = 3;
  strike.attack.ability = 'str';
  strike.damage.parts[0].custom.formula = '1';
  strike.damage.parts[0].types = ['fire'];
  strike.flags.custom = { keep: true };
  const effect = mantleData.effects.find(candidate => candidate._id === EFFECT_ID);
  effect.name = 'My Armor Label';
  effect.description = '<p>My note.</p>';
  effect.disabled = false;
  effect.changes = [{
    key: 'system.attributes.ac.bonus',
    mode: 2,
    value: '1',
    priority: 30
  }];

  const target = legacyActor({
    vessel: ownedItem(vesselData),
    mantle: ownedItem(mantleData)
  });
  const vesselItem = target.items.get(vesselSource._id);
  const mantleItem = target.items.get(mantleSource._id);

  assert.equal(await migrateVesselActor(target, {
    loadSourceItems: async () => sourceItems()
  }), true);

  const migratedScale = vesselItem.system.advancement.get(SCALE_ID);
  assert.equal(migratedScale.configuration.identifier, 'iridescent-strike');
  assert.equal(migratedScale.title, 'My Iridescent Die');
  assert.equal(migratedScale.hint, 'Keep this note');
  assert.deepEqual(migratedScale.value, { 5: 'd20' });

  const migratedStrike = mantleItem.system.activities.get('gDrrUixnPXPLBDHB');
  assert.equal(migratedStrike.name, 'My Spirit Punch');
  assert.equal(migratedStrike.description.chatFlavor, 'Custom flavor');
  assert.equal(migratedStrike.uses.spent, 3);
  assert.equal(migratedStrike.attack.ability, 'cha');
  assert.equal(
    migratedStrike.damage.parts[0].custom.formula,
    '@scale.vessel.iridescent-strike + @mod'
  );
  assert.deepEqual(migratedStrike.damage.parts[0].types, ['fire']);
  assert.deepEqual(migratedStrike.flags.custom, { keep: true });

  const migratedEffect = mantleItem.effects.get(EFFECT_ID);
  assert.equal(migratedEffect.name, 'My Armor Label');
  assert.equal(migratedEffect.description, '<p>My note.</p>');
  assert.equal(migratedEffect.disabled, true);
  assert.deepEqual(migratedEffect.changes, [
    {
      key: 'system.attributes.ac.bonus',
      mode: 2,
      value: '1',
      priority: 30
    },
    ...mantleSource.effects[0].changes
  ]);

  const operationCount = target.operations.length
    + vesselItem.operations.length
    + mantleItem.operations.length;
  assert.equal(await migrateVesselActor(target, {
    loadSourceItems: async () => {
      throw new Error('an idempotent migration must not load the pack again');
    }
  }), false);
  assert.equal(
    target.operations.length + vesselItem.operations.length + mantleItem.operations.length,
    operationCount
  );
});
