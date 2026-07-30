import test from 'node:test';
import assert from 'node:assert/strict';

const {
  getResponsibleUser,
  handleWarlordPreUse,
  registerWarlordHooks
} = await import('../scripts/warlord/hooks.mjs');

const MODULE_ID = 'declan-homebrew-classes';

function activity(id, role, data = {}) {
  return {
    id,
    flags: { [MODULE_ID]: { warlord: { role } } },
    ...data
  };
}

function actorFixture({ leadershipAbility } = {}) {
  const actor = {
    isOwner: true,
    flags: leadershipAbility ? {
      [MODULE_ID]: { warlord: { leadershipAbility } }
    } : {},
    items: new Map(),
    getFlag(scope, key) {
      return key.split('.').reduce((value, segment) => value?.[segment], this.flags[scope]);
    },
    testUserPermission(user, permission) {
      return permission === 'OWNER' && user.ownerIds?.includes(this.id);
    }
  };
  return actor;
}

function ownedActivity(actor, id, role, data = {}) {
  const item = {
    id: `item-${id}`,
    actor,
    system: { identifier: 'warlord-feature', activities: new Map() }
  };
  const entry = activity(id, role, { item, actor, ...data });
  item.system.activities.set(id, entry);
  actor.items.set(item.id, item);
  return entry;
}

function registry() {
  const on = new Map();
  const once = new Map();
  return {
    on,
    once,
    hooks: {
      on(name, callback) { on.set(name, callback); },
      once(name, callback) { once.set(name, callback); }
    }
  };
}

async function flushTasks() {
  await new Promise(resolve => setImmediate(resolve));
}

test('chooses the first active GM by code-unit id, then the first active OWNER', () => {
  const actor = actorFixture();
  actor.id = 'actor-1';
  const users = [
    { id: 'a-gm', active: true, isGM: true },
    { id: 'Z-gm', active: true, isGM: true },
    { id: 'A-owner', active: true, ownerIds: ['actor-1'] },
    { id: '0-offline-gm', active: false, isGM: true }
  ];

  assert.equal(getResponsibleUser(actor, users).id, 'Z-gm');
  assert.equal(
    getResponsibleUser(actor, users.filter(user => !user.isGM)).id,
    'A-owner'
  );
});

test('registers only the three public Warlord hooks and one ready hook', () => {
  const registered = registry();

  registerWarlordHooks(registered.hooks);

  assert.deepEqual([...registered.on.keys()].sort(), [
    'createItem',
    'dnd5e.preUseActivity',
    'updateItem'
  ]);
  assert.deepEqual([...registered.once.keys()], ['ready']);
});

test('cancels and deduplicates both router-only launchers', async () => {
  for (const [role, optionName] of [
    ['inspiring-word-launcher', 'useInspiringWord'],
    ['leadership-config', 'chooseLeadershipAbility']
  ]) {
    const actor = actorFixture();
    const launcher = ownedActivity(actor, `${role}-id`, role);
    let calls = 0;
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const options = {
      [optionName]: async () => {
        calls += 1;
        return pending;
      }
    };

    assert.equal(handleWarlordPreUse(launcher, options), false);
    assert.equal(handleWarlordPreUse(launcher, options), false);
    await flushTasks();
    assert.equal(calls, 1);
    release();
    await flushTasks();
  }
});

test('prompts once, configures the actor-owned source, and lets the native save retry resolve once', async () => {
  const actor = actorFixture();
  const original = ownedActivity(actor, 'save-id', 'rallying-cry', {
    save: { dc: { calculation: '' } }
  });
  const item = original.item;
  let ensureCalls = 0;
  let configureCalls = 0;
  let nativeUseCalls = 0;
  let recursiveResult;

  const options = {
    ensureLeadershipAbility: async () => {
      ensureCalls += 1;
      return 'wis';
    },
    configureLeadershipItems: async usedActor => {
      configureCalls += 1;
      assert.equal(usedActor, actor);
      const resolved = activity('save-id', 'rallying-cry', {
        actor,
        item,
        save: { dc: { calculation: 'wis' } },
        async use() {
          nativeUseCalls += 1;
          recursiveResult = handleWarlordPreUse(this, options);
        }
      });
      item.system.activities.set('save-id', resolved);
    }
  };

  assert.equal(handleWarlordPreUse(original, options), false);
  assert.equal(handleWarlordPreUse(original, options), false);
  await flushTasks();
  await flushTasks();

  assert.equal(ensureCalls, 1);
  assert.equal(configureCalls, 1);
  assert.equal(nativeUseCalls, 1);
  assert.equal(recursiveResult, undefined);
});

test('does not retry a module Save activity when Leadership selection is cancelled', async () => {
  const actor = actorFixture();
  const save = ownedActivity(actor, 'save-id', 'rallying-cry', {
    save: { dc: { calculation: '' } },
    async use() { throw new Error('must not retry'); }
  });
  let configureCalls = 0;

  assert.equal(handleWarlordPreUse(save, {
    ensureLeadershipAbility: async () => undefined,
    configureLeadershipItems: async () => { configureCalls += 1; }
  }), false);
  await flushTasks();

  assert.equal(configureCalls, 0);
});

test('allows dnd5e to resolve a module Save normally when Leadership is already stored', () => {
  const actor = actorFixture({ leadershipAbility: 'cha' });
  const save = ownedActivity(actor, 'save-id', 'rallying-cry', {
    save: { dc: { calculation: 'cha' } }
  });

  assert.equal(handleWarlordPreUse(save), undefined);
});

test('only the initiating client reconciles a newly owned Warlord item', async () => {
  const registered = registry();
  const actor = actorFixture();
  const item = ownedActivity(actor, 'feature-id', 'rallying-cry').item;
  const reconciled = [];
  registerWarlordHooks(registered.hooks, {
    currentUserId: () => 'current-user',
    reconcileActor: async usedActor => { reconciled.push(usedActor); }
  });

  registered.on.get('createItem')(item, {}, 'other-user');
  registered.on.get('createItem')(item, {}, 'current-user');
  await flushTasks();

  assert.deepEqual(reconciled, [actor]);
});

test('only the initiating client reconciles a Warlord class level update', async () => {
  const registered = registry();
  const actor = actorFixture();
  const item = {
    type: 'class',
    actor,
    system: { identifier: 'warlord', levels: 11 }
  };
  const reconciled = [];
  registerWarlordHooks(registered.hooks, {
    currentUserId: () => 'current-user',
    reconcileActor: async usedActor => { reconciled.push(usedActor); }
  });

  registered.on.get('updateItem')(item, { system: { levels: 11 } }, {}, 'other-user');
  registered.on.get('updateItem')(item, { system: { description: 'changed' } }, {}, 'current-user');
  registered.on.get('updateItem')(item, { system: { levels: 11 } }, {}, 'current-user');
  await flushTasks();

  assert.deepEqual(reconciled, [actor]);
});

test('the responsible ready client reconciles after an already-current migration', async () => {
  const registered = registry();
  const actor = actorFixture();
  actor.id = 'actor-ready';
  const calls = [];
  registerWarlordHooks(registered.hooks, {
    actors: () => [actor],
    users: () => [{ id: 'owner', active: true, ownerIds: ['actor-ready'] }],
    currentUserId: () => 'owner',
    migrateActor: async usedActor => {
      assert.equal(usedActor, actor);
      calls.push('migrate:false');
      return false;
    },
    reconcileActor: async usedActor => {
      assert.equal(usedActor, actor);
      calls.push('reconcile');
    }
  });

  registered.once.get('ready')();
  await flushTasks();
  await flushTasks();

  assert.deepEqual(calls, ['migrate:false', 'reconcile']);
});
