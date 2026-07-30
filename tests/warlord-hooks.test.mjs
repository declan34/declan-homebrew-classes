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

test('prompts once for the real Rallying Cry Utility roll and lets its native retry resolve once', async () => {
  const actor = actorFixture();
  const original = ownedActivity(actor, 'rally-id', 'rallying-cry', {
    roll: { formula: '@abilities.cha.mod' }
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
      const resolved = activity('rally-id', 'rallying-cry', {
        actor,
        item,
        roll: { formula: '@abilities.wis.mod' },
        async use() {
          nativeUseCalls += 1;
          recursiveResult = handleWarlordPreUse(this, options);
        }
      });
      item.system.activities.set('rally-id', resolved);
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

test('does not retry Rallying Cry when Leadership selection is cancelled', async () => {
  const actor = actorFixture();
  const rally = ownedActivity(actor, 'rally-id', 'rallying-cry', {
    roll: { formula: '@abilities.cha.mod' },
    async use() { throw new Error('must not retry'); }
  });
  let configureCalls = 0;

  assert.equal(handleWarlordPreUse(rally, {
    ensureLeadershipAbility: async () => undefined,
    configureLeadershipItems: async () => { configureCalls += 1; }
  }), false);
  await flushTasks();

  assert.equal(configureCalls, 0);
});

test('reconfigures a stale Rallying Cry before allowing native resolution', async () => {
  const actor = actorFixture({ leadershipAbility: 'wis' });
  const original = ownedActivity(actor, 'rally-id', 'rallying-cry', {
    roll: { formula: '@abilities.cha.mod' }
  });
  const item = original.item;
  let configureCalls = 0;
  let nativeUseCalls = 0;
  let recursiveResult;

  const options = {
    configureLeadershipItems: async () => {
      configureCalls += 1;
      const resolved = activity('rally-id', 'rallying-cry', {
        actor,
        item,
        roll: { formula: '@abilities.wis.mod' },
        async use() {
          nativeUseCalls += 1;
          recursiveResult = handleWarlordPreUse(this, options);
        }
      });
      item.system.activities.set('rally-id', resolved);
    }
  };

  assert.equal(handleWarlordPreUse(original, options), false);
  await flushTasks();
  await flushTasks();

  assert.equal(configureCalls, 1);
  assert.equal(nativeUseCalls, 1);
  assert.equal(recursiveResult, undefined);
});

test('waits for an in-flight Leadership change instead of trusting the old flag', async () => {
  const actor = actorFixture({ leadershipAbility: 'cha' });
  const original = ownedActivity(actor, 'rally-id', 'rallying-cry', {
    roll: { formula: '@abilities.cha.mod' }
  });
  const item = original.item;
  let releaseChoice;
  const choicePending = new Promise(resolve => { releaseChoice = resolve; });
  let nativeUseCalls = 0;
  let recursiveResult;

  const options = {
    leadershipConfigurationPending: () => true,
    ensureLeadershipAbility: async () => choicePending,
    configureLeadershipItems: async () => {
      const resolved = activity('rally-id', 'rallying-cry', {
        actor,
        item,
        roll: { formula: '@abilities.wis.mod' },
        async use() {
          nativeUseCalls += 1;
          recursiveResult = handleWarlordPreUse(this, options);
        }
      });
      item.system.activities.set('rally-id', resolved);
    }
  };

  assert.equal(handleWarlordPreUse(original, options), false);
  await flushTasks();
  assert.equal(nativeUseCalls, 0);
  releaseChoice('wis');
  await flushTasks();
  await flushTasks();
  assert.equal(nativeUseCalls, 1);
  assert.equal(recursiveResult, undefined);
});

test('allows dnd5e to resolve Rallying Cry normally when its stored ability matches', () => {
  const actor = actorFixture({ leadershipAbility: 'cha' });
  const rally = ownedActivity(actor, 'rally-id', 'rallying-cry', {
    roll: { formula: '@abilities.cha.mod' }
  });

  assert.equal(handleWarlordPreUse(rally), undefined);
});

test('blocks a die-spending Warlord activity when its shared pool item is missing', () => {
  const actor = actorFixture();
  const exploit = ownedActivity(actor, 'exploit-id', 'exploit-activity', {
    consumption: {
      targets: [
        { type: 'itemUses', target: 'tactical-exploits', value: '1' }
      ]
    }
  });
  const reported = [];

  assert.equal(handleWarlordPreUse(exploit, {
    reportError: error => reported.push(error)
  }), false);
  assert.equal(reported.length, 1);
  assert.ok(reported[0] instanceof Error);
  assert.match(reported[0].message, /Tactical Exploits.*missing/i);
});

test('allows a die-spending Warlord activity when its shared pool item exists', () => {
  const actor = actorFixture();
  actor.items.set('pool-item', {
    id: 'pool-item',
    system: { identifier: 'tactical-exploits' }
  });
  const exploit = ownedActivity(actor, 'exploit-id', 'exploit-activity', {
    consumption: {
      targets: [
        { type: 'itemUses', target: 'tactical-exploits', value: '1' }
      ]
    }
  });
  const reported = [];

  assert.equal(handleWarlordPreUse(exploit, {
    reportError: error => reported.push(error)
  }), undefined);
  assert.deepEqual(reported, []);
});

test('does not require the shared pool for free Orders or no-consumption resolution activities', () => {
  const actor = actorFixture();
  const freeOrder = ownedActivity(actor, 'free-order-id', 'exploit-activity', {
    consumption: { targets: [] }
  });
  const resolution = ownedActivity(actor, 'resolution-id', 'exploit-resolution', {
    consumption: { targets: [] }
  });
  const repeatSave = ownedActivity(actor, 'repeat-save-id', 'exploit-repeat-save');
  const reported = [];
  const options = { reportError: error => reported.push(error) };

  assert.equal(handleWarlordPreUse(freeOrder, options), undefined);
  assert.equal(handleWarlordPreUse(resolution, options), undefined);
  assert.equal(handleWarlordPreUse(repeatSave, options), undefined);
  assert.deepEqual(reported, []);
});

test('configures flagged Utility and Heal formulas before one native retry', async () => {
  for (const [id, dataPath, staleData, configuredData] of [
    [
      'utility-id',
      'roll.formula',
      { roll: { formula: 'max(1, @abilities.cha.mod) * 5' } },
      { roll: { formula: 'max(1, @abilities.wis.mod) * 5' } }
    ],
    [
      'heal-id',
      'healing.custom.formula',
      {
        healing: {
          custom: {
            formula: '@scaling * @scale.warlord.exploit-die + @abilities.cha.mod'
          }
        }
      },
      {
        healing: {
          custom: {
            formula: '@scaling * @scale.warlord.exploit-die + @abilities.wis.mod'
          }
        }
      }
    ]
  ]) {
    const actor = actorFixture({ leadershipAbility: 'wis' });
    const flags = {
      [MODULE_ID]: {
        warlord: {
          role: 'exploit-activity',
          leadershipFormulaPaths: [dataPath]
        }
      }
    };
    const original = ownedActivity(actor, id, 'exploit-activity', {
      flags,
      ...staleData
    });
    const item = original.item;
    let configureCalls = 0;
    let nativeUseCalls = 0;
    let recursiveResult;
    const options = {
      configureLeadershipItems: async () => {
        configureCalls += 1;
        const resolved = activity(id, 'exploit-activity', {
          actor,
          item,
          flags,
          ...configuredData,
          async use() {
            nativeUseCalls += 1;
            recursiveResult = handleWarlordPreUse(this, options);
          }
        });
        item.system.activities.set(id, resolved);
      }
    };

    assert.equal(handleWarlordPreUse(original, options), false);
    await flushTasks();
    await flushTasks();

    assert.equal(configureCalls, 1, `${id} configuration`);
    assert.equal(nativeUseCalls, 1, `${id} native retry`);
    assert.equal(recursiveResult, undefined, `${id} recursive native use`);
  }
});

test('allows matching flagged Utility and Heal formulas to resolve natively', () => {
  for (const [id, dataPath, data] of [
    [
      'utility-id',
      'roll.formula',
      { roll: { formula: 'max(1, @abilities.int.mod) * 5' } }
    ],
    [
      'heal-id',
      'healing.custom.formula',
      {
        healing: {
          custom: {
            formula: '@details.level + @abilities.int.mod'
          }
        }
      }
    ]
  ]) {
    const actor = actorFixture({ leadershipAbility: 'int' });
    const flagged = ownedActivity(actor, id, 'exploit-activity', {
      flags: {
        [MODULE_ID]: {
          warlord: {
            role: 'exploit-activity',
            leadershipFormulaPaths: [dataPath]
          }
        }
      },
      ...data
    });

    assert.equal(handleWarlordPreUse(flagged), undefined, id);
  }
});

test('allows only the recursive retry while native Rallying Cry use is pending', async () => {
  const actor = actorFixture();
  const original = ownedActivity(actor, 'rally-id', 'rallying-cry', {
    roll: { formula: '@abilities.cha.mod' }
  });
  const item = original.item;
  let releaseNativeUse;
  const nativeUsePending = new Promise(resolve => { releaseNativeUse = resolve; });
  let nativeUseCalls = 0;
  const recursiveResults = [];

  const options = {
    ensureLeadershipAbility: async () => 'wis',
    configureLeadershipItems: async () => {
      const resolved = activity('rally-id', 'rallying-cry', {
        actor,
        item,
        roll: { formula: '@abilities.wis.mod' },
        async use() {
          nativeUseCalls += 1;
          recursiveResults.push(handleWarlordPreUse(this, options));
          return nativeUsePending;
        }
      });
      item.system.activities.set('rally-id', resolved);
    }
  };

  assert.equal(handleWarlordPreUse(original, options), false);
  await flushTasks();
  assert.equal(nativeUseCalls, 1);
  assert.deepEqual(recursiveResults, [undefined]);

  const extraClick = item.system.activities.get('rally-id');
  assert.equal(handleWarlordPreUse(extraClick, options), false);
  assert.equal(nativeUseCalls, 1);

  releaseNativeUse();
  await flushTasks();
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
