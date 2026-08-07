import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url));
const yaml = require('js-yaml');
const moduleId = 'declan-homebrew-classes';
const {
  VESSEL_MIGRATION_VERSION,
  migrateVesselActor
} = await import('../scripts/vessel/migration.mjs');

const vesselSource = yaml.load(readFileSync(new URL('../src/vessel/the-vessel.yml', import.meta.url), 'utf8'));
const strikesSource = yaml.load(readFileSync(
  new URL('../src/vessel/class-features/iridescent-strikes.yml', import.meta.url),
  'utf8'
));
const aspectSource = yaml.load(readFileSync(new URL('../aspects-src/shimmering-lance.yml', import.meta.url), 'utf8'));
const condemnationSource = yaml.load(readFileSync(
  new URL('../src/vessel/subclass-features/the-fallen/condemnation.yml', import.meta.url),
  'utf8'
));
const fallenControlSource = yaml.load(readFileSync(
  new URL('../src/vessel/subclass-features/the-fallen/archon-form-control.yml', import.meta.url),
  'utf8'
));

function doc(data) {
  return {...structuredClone(data), toObject() {
    const {toObject, ...value} = this;
    return structuredClone(value);
  }};
}

function item(data) {
  const raw = structuredClone(data);
  return {
    ...structuredClone(data),
    id: data._id,
    identifier: data.system.identifier,
    system: {
      ...structuredClone(data.system),
      advancement: new Map((data.system.advancement ?? []).map(row => [row._id, doc(row)])),
      activities: new Map(Object.values(data.system.activities ?? {}).map(row => [row._id, doc(row)]))
    },
    effects: new Map((data.effects ?? []).map(row => [row._id, doc(row)])),
    operations: [],
    toObject() {
      return structuredClone(raw);
    },
    async update(changes) {
      this.operations.push(['update', structuredClone(changes)]);
      for (const [path, value] of Object.entries(changes)) {
        const match = path.match(/^system\.activities\.([^.]+)$/);
        if (match) this.system.activities.set(match[1], doc(value));
      }
    },
    async createEmbeddedDocuments(type, rows) {
      assert.equal(type, 'ActiveEffect');
      for (const row of rows) this.effects.set(row._id, doc(row));
    },
    async updateEmbeddedDocuments(type, rows) {
      assert.equal(type, 'ActiveEffect');
      for (const row of rows) this.effects.set(row._id, doc(row));
    }
  };
}

function actorWithLegacyAspect() {
  const vessel = item({...vesselSource, system: {...vesselSource.system, levels: 10}});
  const legacy = item({
    ...aspectSource,
    name: 'My Spirit Bolt',
    img: 'custom/bolt.webp',
    system: {...aspectSource.system, activities: {
      PlayerActivity01: {_id: 'PlayerActivity01', type: 'utility', name: 'Keep Me'}
    }},
    effects: []
  });
  return {
    isOwner: true,
    items: new Map([[vessel.id, vessel], [legacy.id, legacy]]),
    flags: {[moduleId]: {vessel: {migrationVersion: 2}}},
    getFlag() { return this.flags[moduleId].vessel.migrationVersion; },
    async setFlag(_scope, _key, value) {
      this.flags[moduleId].vessel.migrationVersion = value;
    },
    async createEmbeddedDocuments(type, rows) {
      assert.equal(type, 'Item');
      const created = rows.map(row => item(row));
      for (const entry of created) this.items.set(entry.id, entry);
      return created;
    },
    legacy
  };
}

test('current migration repairs owned Stage 3 activities and preserves player data', async () => {
  const actor = actorWithLegacyAspect();
  await migrateVesselActor(actor, {
    loadSourceItems: async () => ({
      vessel: item(vesselSource),
      mantle: null,
      strikes: item(strikesSource),
      controls: {'the-fallen': item(fallenControlSource)}
    }),
    loadStage3Items: async () => new Map([['shimmering-lance', item(aspectSource)]])
  });
  assert.equal(
    actor.flags[moduleId].vessel.migrationVersion,
    VESSEL_MIGRATION_VERSION
  );
  assert.equal(actor.legacy.name, 'My Spirit Bolt');
  assert.equal(actor.legacy.img, 'custom/bolt.webp');
  assert.equal(actor.legacy.system.activities.get('PlayerActivity01').name, 'Keep Me');
  assert.ok([...actor.legacy.system.activities.values()].some(activity =>
    activity.flags?.[moduleId]?.vessel?.role === 'shimmering-lance'
  ));
});

test('current migration records no completion when a Stage 3 repair fails', async () => {
  const actor = actorWithLegacyAspect();
  actor.legacy.update = async () => { throw new Error('stage3 update failed'); };
  await assert.rejects(
    migrateVesselActor(actor, {
      loadSourceItems: async () => ({
        vessel: item(vesselSource),
        mantle: null,
        strikes: item(strikesSource),
        controls: {}
      }),
      loadStage3Items: async () => new Map([['shimmering-lance', item(aspectSource)]])
    }),
    /stage3 update failed/
  );
  assert.equal(actor.flags[moduleId].vessel.migrationVersion, 2);
});

test('current migration grants missing Condemnation to an existing level-6 Fallen', async () => {
  const actor = actorWithLegacyAspect();
  const subclass = item({
    _id: 'LegacyFallen0001',
    name: 'The Fallen',
    type: 'subclass',
    system: {identifier: 'the-fallen', activities: {}, advancement: []},
    effects: []
  });
  actor.items.set(subclass.id, subclass);
  await migrateVesselActor(actor, {
    loadSourceItems: async () => ({
      vessel: item(vesselSource),
      mantle: null,
      strikes: item(strikesSource),
      controls: {'the-fallen': item(fallenControlSource)}
    }),
    loadStage3Items: async () => new Map([
      ['shimmering-lance', item(aspectSource)],
      ['condemnation', item(condemnationSource)]
    ])
  });
  assert.ok([...actor.items.values()].some(entry =>
    entry.system.identifier === 'condemnation'
  ));
});
