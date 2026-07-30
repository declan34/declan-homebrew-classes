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
  loadVesselSourceItems,
  migrateVesselActor
} = await import('../scripts/vessel/migration.mjs');

const MODULE_ID = 'declan-homebrew-classes';
const MIGRATION_FLAG = 'vessel.migrationVersion';
const CONTROL_ROLES = [
  'archon-transform-free',
  'archon-transform-slot',
  'archon-extend',
  'archon-revert',
  'archon-equipment-preference'
];
const CONTROL_PATHS = [
  'the-ascended',
  'the-cataclysm',
  'the-cursed',
  'the-fallen',
  'the-formless',
  'the-trickster'
];

function load(path) {
  return yaml.load(readFileSync(new URL(path, import.meta.url), 'utf8'));
}

const vesselSource = load('../src/vessel/the-vessel.yml');
const mantleSource = load('../src/vessel/class-features/spirit-mantle.yml');
const archonSource = load('../src/vessel/class-features/archon-form.yml');
const controlSources = Object.fromEntries(CONTROL_PATHS.map(subclass => [
  subclass,
  load(`../src/vessel/subclass-features/${subclass}/archon-form-control.yml`)
]));

function doc(data) {
  return {
    ...structuredClone(data),
    toObject() {
      const { toObject, ...source } = this;
      return structuredClone(source);
    }
  };
}

function item(data) {
  const raw = structuredClone(data);
  const target = {
    ...raw,
    id: raw._id,
    identifier: raw.system?.identifier,
    system: {
      ...raw.system,
      advancement: new Map((raw.system?.advancement ?? []).map(row => [
        row._id,
        doc(row)
      ])),
      activities: new Map(Object.values(raw.system?.activities ?? {}).map(row => [
        row._id,
        doc(row)
      ]))
    },
    effects: new Map((raw.effects ?? []).map(row => [row._id, doc(row)])),
    operations: [],
    toObject() {
      return structuredClone(raw);
    },
    async update(changes) {
      this.operations.push(['update', structuredClone(changes)]);
      for (const [path, value] of Object.entries(changes)) {
        if (path.startsWith('system.activities.')) {
          const id = path.slice('system.activities.'.length);
          this.system.activities.set(id, doc(value));
          continue;
        }
        setPath(this, path, structuredClone(value));
      }
    },
    async createAdvancement(_type, row) {
      this.system.advancement.set(row._id, doc(row));
    },
    async updateAdvancement(id, row) {
      this.system.advancement.set(id, doc(row));
    },
    async createEmbeddedDocuments(_type, rows) {
      for (const row of rows) this.effects.set(row._id, doc(row));
    },
    async updateEmbeddedDocuments(_type, rows) {
      for (const row of rows) this.effects.set(row._id, doc(row));
    }
  };
  return target;
}

function setPath(target, path, value) {
  const segments = path.split('.');
  let current = target;
  for (const segment of segments.slice(0, -1)) current = current[segment] ??= {};
  current[segments.at(-1)] = value;
}

function sourceItems() {
  return {
    vessel: item(vesselSource),
    mantle: item(mantleSource),
    archon: item(archonSource),
    controls: Object.fromEntries(
      Object.entries(controlSources).map(([key, value]) => [key, item(value)])
    )
  };
}

function actor({
  subclass = 'the-cursed',
  archon = item(archonSource),
  control,
  version = 1
} = {}) {
  const vessel = item({
    ...vesselSource,
    system: { ...vesselSource.system, levels: 3 }
  });
  const subclassItem = item({
    _id: `subclass-${subclass}`,
    name: subclass,
    type: 'subclass',
    system: { identifier: subclass, activities: {}, advancement: [] },
    effects: []
  });
  const items = [vessel, subclassItem, ...(archon ? [archon] : []), ...(control ? [control] : [])];
  return {
    isOwner: true,
    items: new Map(items.map(entry => [entry.id, entry])),
    flags: version ? {
      [MODULE_ID]: { vessel: { migrationVersion: version } }
    } : {},
    operations: [],
    getFlag(scope, key) {
      if (scope === MODULE_ID && key === MIGRATION_FLAG) {
        return this.flags?.[MODULE_ID]?.vessel?.migrationVersion;
      }
    },
    async setFlag(scope, key, value) {
      this.operations.push(['setFlag', value]);
      this.flags[scope] ??= {};
      setPath(this.flags[scope], key, value);
    },
    async createEmbeddedDocuments(type, rows, options) {
      assert.equal(type, 'Item');
      assert.deepEqual(options, { keepId: true });
      this.operations.push(['createEmbeddedDocuments', structuredClone(rows)]);
      const created = rows.map(row => item(row));
      for (const entry of created) this.items.set(entry.id, entry);
      return created;
    }
  };
}

function activityByRole(control, role) {
  return [...control.system.activities.values()].find(candidate =>
    candidate.flags?.[MODULE_ID]?.vessel?.role === role
  );
}

test('Vessel migration v2 loads all nine canonical Items and retries a rejected cache', async () => {
  assert.equal(VESSEL_MIGRATION_VERSION, 2);
  const ids = [
    vesselSource._id,
    mantleSource._id,
    archonSource._id,
    ...Object.values(controlSources).map(source => source._id)
  ];
  let fail = true;
  const calls = [];
  const sourcesById = new Map([
    [vesselSource._id, item(vesselSource)],
    [mantleSource._id, item(mantleSource)],
    [archonSource._id, item(archonSource)],
    ...Object.values(controlSources).map(source => [source._id, item(source)])
  ]);
  const pack = {
    async getDocument(id) {
      calls.push(id);
      if (fail && id === archonSource._id) return null;
      return sourcesById.get(id);
    }
  };
  const packs = new Map([[`${MODULE_ID}.homebrew-classes`, pack]]);

  await assert.rejects(
    loadVesselSourceItems({ packs }),
    /missing Vessel migration sources/i
  );
  fail = false;
  const loaded = await loadVesselSourceItems({ packs });

  assert.deepEqual(new Set(calls), new Set(ids));
  assert.equal(loaded.archon.id, archonSource._id);
  assert.deepEqual(
    new Set(Object.keys(loaded.controls)),
    new Set(CONTROL_PATHS)
  );
  const callsAfterSuccess = calls.length;
  assert.equal(await loadVesselSourceItems({ packs }), loaded);
  assert.equal(calls.length, callsAfterSuccess);
});

test('v2 creates the determinable missing subclass control and preserves Archon resource presentation and spent use', async () => {
  const resource = item({
    ...archonSource,
    name: 'My Archon Awakening',
    img: 'icons/custom.webp',
    system: {
      ...archonSource.system,
      description: { value: '<p>My description.</p>', chat: 'My chat' },
      uses: { max: '9', spent: 1, recovery: [] },
      activities: {
        CustomResource01: {
          _id: 'CustomResource01',
          type: 'utility',
          name: 'My Resource Note'
        }
      }
    }
  });
  const target = actor({ archon: resource });

  assert.equal(await migrateVesselActor(target, {
    loadSourceItems: async () => sourceItems()
  }), true);

  const control = [...target.items.values()].find(entry =>
    entry.system?.identifier === 'the-cursed-archon-form-control'
  );
  assert.ok(control);
  assert.deepEqual(
    CONTROL_ROLES.map(role => activityByRole(control, role)?.type),
    ['transform', 'transform', 'utility', 'utility', 'utility']
  );
  assert.equal(resource.name, 'My Archon Awakening');
  assert.equal(resource.img, 'icons/custom.webp');
  assert.equal(resource.system.description.value, '<p>My description.</p>');
  assert.equal(resource.system.uses.spent, 1);
  assert.equal(resource.system.uses.max, '1');
  assert.deepEqual(resource.system.uses.recovery, archonSource.system.uses.recovery);
  assert.equal(
    resource.system.activities.get('CustomResource01').name,
    'My Resource Note'
  );
  assert.equal(target.getFlag(MODULE_ID, MIGRATION_FLAG), 2);
});

test('v2 creates a level-3 subclass control even when the legacy Archon resource is missing', async () => {
  const target = actor({
    subclass: 'the-fallen',
    archon: null
  });

  await migrateVesselActor(target, {
    loadSourceItems: async () => sourceItems()
  });

  assert.ok([...target.items.values()].some(entry =>
    entry.system?.identifier === 'the-fallen-archon-form-control'
  ));
});

test('v2 repairs all module control mechanics while preserving custom presentation and unrelated activities', async () => {
  const broken = structuredClone(controlSources['the-cursed']);
  broken.name = 'My Cursed Shape';
  broken.img = 'icons/custom-shape.webp';
  broken.system.description.value = '<p>Keep my control notes.</p>';
  const free = broken.system.activities.hbrArcFreeForm01;
  free.name = 'My Free Shift';
  free.description.chatFlavor = 'Keep this flavor';
  free.profiles = [{ _id: 'wrong', uuid: 'Actor.wrong' }];
  free.settings = { keep: ['self'], merge: [], transformTokens: false };
  free.consumption.targets = [];
  delete broken.system.activities.hbrArcEquipCfg01;
  broken.system.activities.CustomActivity01 = {
    _id: 'CustomActivity01',
    type: 'utility',
    name: 'User Activity',
    flags: { custom: { keep: true } }
  };
  const target = actor({ control: item(broken) });

  await migrateVesselActor(target, {
    loadSourceItems: async () => sourceItems()
  });

  const migrated = target.items.get(broken._id);
  const canonical = controlSources['the-cursed'];
  const migratedFree = activityByRole(migrated, 'archon-transform-free');
  assert.equal(migrated.name, 'My Cursed Shape');
  assert.equal(migrated.img, 'icons/custom-shape.webp');
  assert.equal(migrated.system.description.value, '<p>Keep my control notes.</p>');
  assert.equal(migratedFree.name, 'My Free Shift');
  assert.equal(migratedFree.description.chatFlavor, 'Keep this flavor');
  assert.deepEqual(
    migratedFree.profiles,
    canonical.system.activities.hbrArcFreeForm01.profiles
  );
  assert.deepEqual(
    migratedFree.settings,
    canonical.system.activities.hbrArcFreeForm01.settings
  );
  assert.deepEqual(
    migratedFree.consumption,
    canonical.system.activities.hbrArcFreeForm01.consumption
  );
  assert.ok(activityByRole(migrated, 'archon-equipment-preference'));
  assert.equal(migrated.system.activities.get('CustomActivity01').name, 'User Activity');
});

test('v2 records no flag after a partial control failure and repairs cleanly on retry', async () => {
  const broken = item(controlSources['the-cursed']);
  broken.system.activities.delete('hbrArcEquipCfg01');
  const target = actor({ control: broken });
  const originalUpdate = broken.update;
  broken.update = async () => {
    throw new Error('control update failed');
  };

  await assert.rejects(
    migrateVesselActor(target, {
      loadSourceItems: async () => sourceItems()
    }),
    /control update failed/
  );
  assert.equal(target.getFlag(MODULE_ID, MIGRATION_FLAG), 1);

  broken.update = originalUpdate;
  assert.equal(await migrateVesselActor(target, {
    loadSourceItems: async () => sourceItems()
  }), true);
  assert.equal(target.getFlag(MODULE_ID, MIGRATION_FLAG), 2);
  const operations = target.operations.length + broken.operations.length;
  assert.equal(await migrateVesselActor(target, {
    loadSourceItems: async () => {
      throw new Error('idempotent migration must not load');
    }
  }), false);
  assert.equal(target.operations.length + broken.operations.length, operations);
});
