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
const MANTLE_TOGGLE_ID = '0I7T8AlyrNTKpU0h';
const STRIKE_ACTIVITY_ID = 'IriStrikeAct0001';
const LEGACY_STRIKE_IDS = ['gDrrUixnPXPLBDHB', 'dWCAZNHBAwxBjUw7'];

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
    toObject() {
      return structuredClone({
        ...source,
        system: {
          ...source.system,
          advancement: [...this.system.advancement.values()]
            .map(entry => entry.toObject()),
          activities: Object.fromEntries(
            [...this.system.activities.entries()]
              .map(([id, entry]) => [id, entry.toObject()])
          )
        },
        effects: [...this.effects.values()].map(entry => entry.toObject())
      });
    },
    async update(update) {
      this.operations.push(['update', structuredClone(update)]);
      for (const [path, value] of Object.entries(update)) {
        const advancement = path.match(/^system\.advancement\.([^.]+)$/);
        if (advancement) {
          throw new Error(
            'legacy advancement mappings require the dnd5e advancement API'
          );
        }
        const deletion = path.match(/^system\.activities\.-=([^.]+)$/);
        if (deletion) {
          this.system.activities.delete(deletion[1]);
          continue;
        }
        const activity = path.match(/^system\.activities\.([^.]+)$/);
        if (activity) {
          this.system.activities.set(activity[1], document(value));
          continue;
        }
        const systemDeletion = path.match(/^system\.-=(.+)$/);
        if (systemDeletion) {
          delete this.system[systemDeletion[1]];
          continue;
        }
        const systemPath = path.match(/^system\.(.+)$/);
        if (systemPath) {
          const keys = systemPath[1].split('.');
          let target = this.system;
          for (const key of keys.slice(0, -1)) target = target[key] ??= {};
          target[keys.at(-1)] = structuredClone(value);
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
    vesselMagic: ownedItem(vesselMagicSource),
    mantle: ownedItem(mantleSource),
    strikes: ownedItem(strikesSource)
  };
}

function legacyStrike(id, name) {
  const strike = structuredClone(
    strikesSource.system.activities[STRIKE_ACTIVITY_ID]
  );
  strike._id = id;
  strike.name = name;
  strike.activation.type = name.startsWith('Bonus') ? 'bonus' : 'action';
  return strike;
}

function legacyActor({
  vessel,
  mantle,
  strikes,
  vesselMagic,
  migrationVersion = 0,
  failItemCreation = false
} = {}) {
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
        [MANTLE_TOGGLE_ID]: mantleSource.system.activities[MANTLE_TOGGLE_ID],
        [LEGACY_STRIKE_IDS[0]]: legacyStrike(
          LEGACY_STRIKE_IDS[0],
          'Iridescent Strike'
        ),
        [LEGACY_STRIKE_IDS[1]]: legacyStrike(
          LEGACY_STRIKE_IDS[1],
          'Bonus Iridescent Strike'
        ),
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
    ...(vesselMagic ? [[vesselMagic._id, vesselMagic]] : []),
    [mantleItem._id, mantleItem],
    ...(strikes ? [[strikes._id, strikes]] : [])
  ]);

  return {
    isOwner: true,
    items,
    flags: migrationVersion ? {
      [MODULE_ID]: { vessel: { migrationVersion } }
    } : {},
    operations: [],
    itemsByIdentifier(value) {
      return [...this.items.values()].filter(item => item.identifier === value);
    },
    getFlag(scope, key) {
      if (scope !== MODULE_ID || key !== MIGRATION_FLAG) return undefined;
      return this.flags?.[MODULE_ID]?.vessel?.migrationVersion;
    },
    async setFlag(scope, key, value) {
      this.operations.push(['setFlag', scope, key, value]);
      this.flags[scope] ??= {};
      this.flags[scope].vessel ??= {};
      this.flags[scope].vessel.migrationVersion = value;
    },
    async createEmbeddedDocuments(type, rows, options) {
      assert.equal(type, 'Item');
      assert.deepEqual(options, { keepId: true });
      this.operations.push(['createEmbeddedDocuments', structuredClone(rows)]);
      if (failItemCreation) return [];
      return rows.map(row => {
        const item = ownedItem(row);
        this.items.set(item._id, item);
        return item;
      });
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

  assert.ok(mantleItem.system.activities.has(MANTLE_TOGGLE_ID));
  for (const id of LEGACY_STRIKE_IDS) {
    assert.equal(mantleItem.system.activities.has(id), false);
  }
  assert.equal(
    mantleItem.system.activities.get('CustomActivity01').name,
    'User Activity'
  );
  const strikesItems = target.itemsByIdentifier('iridescent-strikes');
  assert.equal(strikesItems.length, 1);
  assert.ok(strikesItems[0].system.activities.has(STRIKE_ACTIVITY_ID));
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

test('repairs canonical Vessel spell progression and removes only the Vessel Magic use counter', async () => {
  const vesselData = structuredClone(vesselSource);
  vesselData.system.description.value = '<p>My class description.</p>';
  vesselData.system.primaryAbility = {
    value: ['int'],
    all: true,
    userPreference: 'preserve'
  };
  vesselData.system.spellcasting = {
    progression: 'full',
    ability: 'int',
    preparation: {
      formula: '@abilities.int.mod',
      userPreference: 'preserve'
    },
    userPreference: 'preserve'
  };
  for (const advancement of vesselData.system.advancement) {
    if (!['cantrips-known', 'spells-known', 'spell-slots', 'slot-level'].includes(
      advancement.configuration?.identifier
    )) continue;
    advancement.title = `My ${advancement.title}`;
    advancement.hint = 'Keep this note';
    advancement.value = { 20: 'custom' };
    advancement.configuration.type = 'dice';
    advancement.configuration.distance = { units: 'ft' };
    advancement.configuration.scale = { 1: { value: 99 } };
    advancement.configuration.userPreference = 'preserve';
  }

  const vesselMagicData = structuredClone(vesselMagicSource);
  vesselMagicData.system.uses = {
    max: '3',
    spent: 1,
    recovery: [{ period: 'sr', type: 'recoverAll' }]
  };
  vesselMagicData.system.userPreference = 'preserve';
  const target = legacyActor({
    vessel: ownedItem(vesselData),
    vesselMagic: ownedItem(vesselMagicData),
    migrationVersion: 4
  });
  const vesselItem = target.items.get(vesselSource._id);
  const vesselMagicItem = target.items.get(vesselMagicSource._id);

  assert.equal(await migrateVesselActor(target, {
    loadSourceItems: async () => sourceItems()
  }), true);

  assert.deepEqual(vesselItem.system.primaryAbility, {
    value: ['cha'],
    all: false,
    userPreference: 'preserve'
  });
  assert.deepEqual(vesselItem.system.spellcasting, {
    progression: 'vessel',
    ability: 'cha',
    preparation: {
      formula: '',
      userPreference: 'preserve'
    },
    userPreference: 'preserve'
  });
  assert.equal(vesselItem.system.description.value, '<p>My class description.</p>');

  for (const source of vesselSource.system.advancement.filter(advancement =>
    ['cantrips-known', 'spells-known', 'spell-slots', 'slot-level'].includes(
      advancement.configuration?.identifier
    )
  )) {
    const migrated = vesselItem.system.advancement.get(source._id);
    assert.deepEqual(migrated.configuration, {
      ...source.configuration,
      userPreference: 'preserve'
    });
    assert.equal(migrated.title, `My ${source.title}`);
    assert.equal(migrated.hint, 'Keep this note');
    assert.deepEqual(migrated.value, { 20: 'custom' });
  }

  assert.equal('uses' in vesselMagicItem.system, false);
  assert.equal(vesselMagicItem.system.userPreference, 'preserve');
  assert.equal(target.getFlag(MODULE_ID, MIGRATION_FLAG), VESSEL_MIGRATION_VERSION);
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
  mantleData.system.activities.CustomActivity01 = {
    _id: 'CustomActivity01',
    type: 'utility',
    name: 'User Activity'
  };
  const strikesData = structuredClone(strikesSource);
  const strike = strikesData.system.activities[STRIKE_ACTIVITY_ID];
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
    mantle: ownedItem(mantleData),
    strikes: ownedItem(strikesData),
    migrationVersion: 3
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

  const strikesItem = target.itemsByIdentifier('iridescent-strikes')[0];
  const migratedStrike = strikesItem.system.activities.get(STRIKE_ACTIVITY_ID);
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
  assert.equal(target.itemsByIdentifier('iridescent-strikes').length, 1);
  assert.equal(mantleItem.system.activities.has('CustomActivity01'), true);

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
    + mantleItem.operations.length + strikesItem.operations.length;
  assert.equal(await migrateVesselActor(target, {
    loadSourceItems: async () => {
      throw new Error('an idempotent migration must not load the pack again');
    }
  }), false);
  assert.equal(
    target.operations.length + vesselItem.operations.length
      + mantleItem.operations.length + strikesItem.operations.length,
    operationCount
  );
});

test('failed Iridescent Strikes creation leaves version 3 and retries cleanly', async () => {
  const target = legacyActor({ migrationVersion: 3, failItemCreation: true });

  await assert.rejects(
    migrateVesselActor(target, { loadSourceItems: async () => sourceItems() }),
    /missing Iridescent Strikes Item/
  );
  assert.equal(target.getFlag(MODULE_ID, MIGRATION_FLAG), 3);
  assert.equal(target.itemsByIdentifier('iridescent-strikes').length, 0);

  const retry = legacyActor({ migrationVersion: 3 });
  assert.equal(await migrateVesselActor(retry, {
    loadSourceItems: async () => sourceItems()
  }), true);
  assert.equal(retry.itemsByIdentifier('iridescent-strikes').length, 1);
  assert.equal(
    retry.getFlag(MODULE_ID, MIGRATION_FLAG),
    VESSEL_MIGRATION_VERSION
  );
});
