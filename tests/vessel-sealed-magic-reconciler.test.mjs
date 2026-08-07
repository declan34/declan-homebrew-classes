import test from 'node:test';
import assert from 'node:assert/strict';

import { reconcileSealedMagic } from '../scripts/vessel/sealed-magic-reconciler.mjs';
import { registerVesselAutomationHooks } from '../scripts/vessel/hooks.mjs';

const MODULE_ID = 'declan-homebrew-classes';
const SEALED_MAGIC_PATH = `${MODULE_ID}.vessel.sealedMagic`;

function entry(key, name, vesselLevel = 3, affinity) {
  return {
    key,
    name,
    subclass: 'the-cataclysm',
    vesselLevel,
    ...(affinity ? { affinity } : {})
  };
}

function actor({
  level = 3,
  isOwner = true,
  items = [],
  affinity = 'fire'
} = {}) {
  return {
    isOwner,
    classes: { vessel: { system: { levels: level } } },
    flags: { [MODULE_ID]: { vessel: { elementalAffinity: affinity } } },
    items: new Map(items.map((item, index) => [item.id ?? `Item${index}`, item])),
    itemTypes: { subclass: [{ type: 'subclass', system: { identifier: 'the-cataclysm' } }] },
    createCalls: [],
    async createEmbeddedDocuments(type, sources) {
      assert.equal(type, 'Item');
      this.createCalls.push(...sources);
      for (const source of sources) {
        this.items.set(`Created${this.items.size}`, structuredClone(source));
      }
      return sources;
    }
  };
}

function sourceItem(name, { type = 'spell' } = {}) {
  return {
    type,
    toObject() {
      return {
        _id: 'CompendiumItem0001',
        id: 'CompendiumItem0001',
        uuid: 'Compendium.test.spells.Item.CompendiumItem0001',
        name,
        type,
        img: 'icons/magic/fire/projectile-fireball-orange.webp',
        system: { level: 1, preparation: { mode: 'always' } },
        effects: [],
        flags: { core: { sourceId: 'Compendium.test.spells.Item.CompendiumItem0001' } },
        ownership: { default: 0 },
        folder: 'SpellFolder00001',
        pack: 'test.spells',
        collection: 'test.spells',
        sort: 42,
        _stats: { compendiumSource: 'test.spells' }
      };
    }
  };
}

function resolverFor(entries) {
  return async requested => ({
    status: 'resolved',
    spellKey: requested.key,
    sourceUuid: `Compendium.test.spells.Item.${requested.key}`
  });
}

function directOperation(_actor, operation) {
  return operation();
}

test('creates every eligible Sealed Magic spell from clean actor-owned sources', async () => {
  const target = actor({ level: 5 });
  const eligible = [
    entry('cataclysm-3-absorb-elements', 'Absorb Elements', 3),
    entry('cataclysm-fire-5-misty-step', 'Misty Step', 5, 'fire'),
    entry('cataclysm-9-elemental-bane', 'Elemental Bane', 9)
  ];
  const requestedUuids = [];
  const serializedActors = [];

  const result = await reconcileSealedMagic(target, {
    entriesForActor: () => eligible,
    resolveEntry: resolverFor(eligible),
    fromUuid: async uuid => {
      requestedUuids.push(uuid);
      return sourceItem(uuid.endsWith('misty-step') ? 'Misty Step' : 'Absorb Elements');
    },
    serialize: async (usedActor, operation) => {
      serializedActors.push(usedActor);
      return operation();
    }
  });

  assert.deepEqual(result, {
    created: ['cataclysm-3-absorb-elements', 'cataclysm-fire-5-misty-step'],
    skipped: ['cataclysm-9-elemental-bane'],
    unresolved: []
  });
  assert.deepEqual(requestedUuids, [
    'Compendium.test.spells.Item.cataclysm-3-absorb-elements',
    'Compendium.test.spells.Item.cataclysm-fire-5-misty-step'
  ]);
  assert.deepEqual(serializedActors, [target]);
  assert.equal(target.createCalls.length, 2);
  for (const spell of target.createCalls) {
    assert.equal(spell._id, undefined);
    assert.equal(spell.id, undefined);
    assert.equal(spell.uuid, undefined);
    assert.equal(spell.ownership, undefined);
    assert.equal(spell.folder, undefined);
    assert.equal(spell.pack, undefined);
    assert.equal(spell.collection, undefined);
    assert.equal(spell.sort, undefined);
    assert.equal(spell._stats, undefined);
    assert.equal(spell.flags[MODULE_ID].vessel.sealedMagic.key,
      spell.name === 'Misty Step'
        ? 'cataclysm-fire-5-misty-step'
        : 'cataclysm-3-absorb-elements');
  }
  assert.equal(target.createCalls[0].flags.core.sourceId,
    'Compendium.test.spells.Item.CompendiumItem0001');
});

test('uses the Sealed Magic stable key to make a second pass idempotent', async () => {
  const selected = entry('cataclysm-3-absorb-elements', 'Absorb Elements');
  const target = actor();
  const dependencies = {
    entriesForActor: () => [selected],
    resolveEntry: resolverFor([selected]),
    fromUuid: async () => sourceItem('Absorb Elements'),
    serialize: directOperation
  };

  const first = await reconcileSealedMagic(target, dependencies);
  const second = await reconcileSealedMagic(target, dependencies);

  assert.deepEqual(first, {
    created: ['cataclysm-3-absorb-elements'], skipped: [], unresolved: []
  });
  assert.deepEqual(second, {
    created: [], skipped: ['cataclysm-3-absorb-elements'], unresolved: []
  });
  assert.equal(target.createCalls.length, 1);
});

test('skips a pre-existing spell with the same normalized name without changing it', async () => {
  const existing = {
    id: 'ExistingSpell0001',
    type: 'spell',
    name: '  CAFE\u0301   LIGHT ',
    flags: {},
    updates: 0,
    deletes: 0,
    async update() { this.updates += 1; },
    async delete() { this.deletes += 1; }
  };
  const selected = entry('cataclysm-3-cafe-light', 'Caf\u00e9 Light');
  const target = actor({ items: [existing] });

  const result = await reconcileSealedMagic(target, {
    entriesForActor: () => [selected],
    resolveEntry: resolverFor([selected]),
    fromUuid: async () => sourceItem('Caf\u00e9 Light'),
    serialize: directOperation
  });

  assert.deepEqual(result, {
    created: [], skipped: ['cataclysm-3-cafe-light'], unresolved: []
  });
  assert.equal(target.createCalls.length, 0);
  assert.equal(existing.updates, 0);
  assert.equal(existing.deletes, 0);
});

test('reports unavailable and ambiguous providers without creating a spell', async () => {
  const unavailable = entry('cataclysm-3-absorb-elements', 'Absorb Elements');
  const ambiguous = entry('cataclysm-3-thunderwave', 'Thunderwave');
  const target = actor();

  const result = await reconcileSealedMagic(target, {
    entriesForActor: () => [unavailable, ambiguous],
    resolveEntry: async requested => requested.key === unavailable.key
      ? { status: 'unavailable', spellKey: requested.key }
      : { status: 'ambiguous', spellKey: requested.key },
    fromUuid: async () => { throw new Error('unreachable'); },
    serialize: directOperation
  });

  assert.deepEqual(result, {
    created: [],
    skipped: [],
    unresolved: [
      { key: 'cataclysm-3-absorb-elements', status: 'unavailable' },
      { key: 'cataclysm-3-thunderwave', status: 'ambiguous' }
    ]
  });
  assert.equal(target.createCalls.length, 0);
});

test('keeps successful grants when another source cannot be loaded', async () => {
  const first = entry('cataclysm-3-absorb-elements', 'Absorb Elements');
  const second = entry('cataclysm-3-thunderwave', 'Thunderwave');
  const target = actor();

  const result = await reconcileSealedMagic(target, {
    entriesForActor: () => [first, second],
    resolveEntry: resolverFor([first, second]),
    fromUuid: async uuid => uuid.endsWith(first.key) ? sourceItem(first.name) : null,
    serialize: directOperation
  });

  assert.deepEqual(result, {
    created: ['cataclysm-3-absorb-elements'],
    skipped: [],
    unresolved: [{ key: 'cataclysm-3-thunderwave', status: 'source-unavailable' }]
  });
  assert.equal(target.createCalls.length, 1);
});

test('does not resolve or create spells for an actor the client does not own', async () => {
  const selected = entry('cataclysm-3-absorb-elements', 'Absorb Elements');
  const target = actor({ isOwner: false });
  let resolved = 0;

  const result = await reconcileSealedMagic(target, {
    entriesForActor: () => [selected],
    resolveEntry: async () => { resolved += 1; return {}; },
    fromUuid: async () => sourceItem(selected.name),
    serialize: directOperation
  });

  assert.deepEqual(result, { created: [], skipped: [], unresolved: [] });
  assert.equal(resolved, 0);
  assert.equal(target.createCalls.length, 0);
});

test('uses the manifest actor filter so a Cataclysm actor receives only its affinity spells', async () => {
  const fire = entry('cataclysm-fire-3-control-flame', 'Control Flame', 3, 'fire');
  const water = entry('cataclysm-water-3-shape-water', 'Shape Water', 3, 'water');
  const shared = entry('cataclysm-3-absorb-elements', 'Absorb Elements');
  const target = actor({ affinity: 'fire' });
  const observedActors = [];

  const result = await reconcileSealedMagic(target, {
    entriesForActor: usedActor => {
      observedActors.push(usedActor);
      return [shared, fire];
    },
    resolveEntry: resolverFor([shared, fire, water]),
    fromUuid: async uuid => sourceItem(uuid.endsWith(fire.key) ? fire.name : shared.name),
    serialize: directOperation
  });

  assert.deepEqual(observedActors, [target]);
  assert.deepEqual(result.created, [shared.key, fire.key]);
  assert.equal(target.createCalls.some(spell => spell.name === water.name), false);
});

function hookRegistry() {
  const on = new Map();
  const once = new Map();
  return {
    on,
    once,
    hooks: {
      on(name, handler) { on.set(name, handler); },
      once(name, handler) { once.set(name, handler); }
    }
  };
}

test('debounces Sealed Magic reconciliation for ready, class changes, sheet renders, and private-provider changes', async () => {
  const target = actor();
  target.testUserPermission = user => user.id === 'owner';
  const registry = hookRegistry();
  const reconciled = [];
  const warnings = [];
  const registration = registerVesselAutomationHooks(registry.hooks, {
    actors: () => [target],
    users: () => [{ id: 'owner', active: true, isGM: false }],
    currentUserId: () => 'owner',
    migrateActor: async () => {},
    reconcileActor: async () => {},
    reconcileSealedMagic: async usedActor => {
      reconciled.push(usedActor);
      return { created: [], skipped: [], unresolved: [{ key: 'cataclysm-3-absorb-elements', status: 'unavailable' }] };
    },
    warn: message => warnings.push(message)
  });
  const vesselSubclass = {
    type: 'subclass',
    actor: target,
    system: { identifier: 'the-cataclysm' }
  };

  registry.once.get('ready')();
  registry.on.get('updateItem')(vesselSubclass, { system: { identifier: 'the-cataclysm' } }, {}, 'other');
  registry.on.get('renderActorSheet')({ actor: target });
  registration.reconcileSealedMagic();
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(reconciled.length, 1);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Absorb Elements/u);
});

test('only the responsible client schedules Sealed Magic reconciliation and warnings', async () => {
  const target = actor();
  target.testUserPermission = user => user.id === 'owner';
  const first = hookRegistry();
  const second = hookRegistry();
  const calls = [0, 0];
  const warnings = [0, 0];
  const options = index => ({
    actors: () => [target],
    users: () => [{ id: 'owner', active: true, isGM: false }],
    currentUserId: () => index === 0 ? 'owner' : 'other',
    reconcileSealedMagic: async () => {
      calls[index] += 1;
      return { created: [], skipped: [], unresolved: [{ key: 'cataclysm-3-absorb-elements', status: 'unavailable' }] };
    },
    warn: () => { warnings[index] += 1; }
  });

  registerVesselAutomationHooks(first.hooks, options(0));
  registerVesselAutomationHooks(second.hooks, options(1));
  for (const registry of [first, second]) {
    registry.on.get('createItem')({
      type: 'class', actor: target, system: { identifier: 'vessel' }
    }, {}, 'any-client');
  }
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(calls, [1, 0]);
  assert.deepEqual(warnings, [1, 0]);
});

test('the private compendium setting change schedules a fresh reconciliation pass', async () => {
  const previousGame = globalThis.game;
  const previousHooks = globalThis.Hooks;
  const previousFromUuid = globalThis.fromUuid;
  const initCallbacks = [];
  const registered = [];
  const target = actor();
  target.testUserPermission = user => user.id === 'owner';
  const spells = ['Absorb Elements', 'Control Flame', 'Hellish Rebuke'];
  globalThis.game = {
    actors: [target],
    users: [{ id: 'owner', active: true, isGM: false }],
    user: { id: 'owner' },
    settings: {
      register(_module, _key, configuration) { registered.push(configuration); },
      get() { return ''; }
    },
    packs: [{
      collection: 'declan-homebrew-classes.homebrew-spells',
      documentName: 'Item',
      async getIndex() {
        return spells.map((name, index) => ({
          _id: `Spell${index}`, name, type: 'spell',
          uuid: `Compendium.test.spells.Item.Spell${index}`
        }));
      },
      async getDocument(id) {
        const index = Number(id.replace('Spell', ''));
        return {
          id,
          name: spells[index],
          type: 'spell',
          uuid: `Compendium.test.spells.Item.Spell${index}`
        };
      }
    }]
  };
  globalThis.Hooks = {
    once(name, callback) { initCallbacks.push([name, callback]); },
    on() {}
  };
  globalThis.fromUuid = async uuid => sourceItem(
    spells[Number(uuid.split('Spell').at(-1))]
  );

  try {
    await import(`../scripts/vessel-automation.mjs?setting-test=${Date.now()}`);
    initCallbacks.find(([name]) => name === 'init')[1]();
    registered[0].onChange('private.spells');
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(target.createCalls.length, 3);
  } finally {
    globalThis.game = previousGame;
    globalThis.Hooks = previousHooks;
    globalThis.fromUuid = previousFromUuid;
  }
});
