import test from 'node:test';
import assert from 'node:assert/strict';

const {
  getResponsibleUser,
  handlePostUseActivity,
  handlePreUseActivity,
  prepareIridescentStrike,
  promptToActivateAndRetry,
  registerVesselAutomationHooks
} = await import('../scripts/vessel/hooks.mjs');

const MODULE_ID = 'declan-homebrew-classes';
const ACTIVITY_ID = 'gDrrUixnPXPLBDHB';
const MANTLE_ITEM_ID = 'SpiritMantle0001';
const OWNER_USER_A_ID = 'OwnerUser0000001';
const OWNER_USER_B_ID = 'OwnerUser0000002';
const ACTIVE_GM_A_ID = 'ActiveGM00000001';
const ACTIVE_GM_B_ID = 'ActiveGM00000002';

function role(name) {
  return { [MODULE_ID]: { vessel: { role: name } } };
}

function damagePart(types = ['radiant']) {
  return {
    toObject() {
      return {
        custom: { enabled: true, formula: '@scale.vessel.iridescent-strike + @mod' },
        types: [...types]
      };
    }
  };
}

function activityClone(name, actor, sourceItem, sourceActivity) {
  return {
    id: sourceActivity.id,
    flags: role(name),
    item: { id: sourceItem.id, actor },
    damage: { parts: [damagePart(sourceActivity.damage.parts[0].toObject().types)] },
    updateSource(update) {
      this.updated = update;
    },
    sourceItem,
    sourceActivity
  };
}

function activity(name, actor, { sourceTypes = ['radiant'] } = {}) {
  const sourceActivity = {
    id: ACTIVITY_ID,
    damage: { parts: [damagePart(sourceTypes)] },
    useCalls: 0,
    async use() {
      this.useCalls += 1;
      if (this.onUse) await this.onUse();
    }
  };
  const sourceItem = {
    id: MANTLE_ITEM_ID,
    identifier: 'spirit-mantle',
    actor,
    effects: [],
    system: { activities: new Map([[sourceActivity.id, sourceActivity]]) },
    updateCalls: [],
    async update(update) {
      this.updateCalls.push(update);
      const path = `system.activities.${sourceActivity.id}.damage.parts`;
      const parts = update[path];
      if (parts) {
        sourceActivity.damage.parts = parts.map(part => damagePart(part.types));
      }
    }
  };
  const existing = Array.from(actor.items?.values?.() ?? actor.items ?? []);
  actor.items = new Map(
    existing.map((item, index) => [
      item.id ?? `FeatureItem${String(index).padStart(5, '0')}`,
      item
    ])
  );
  actor.items.set(sourceItem.id, sourceItem);
  return activityClone(name, actor, sourceItem, sourceActivity);
}

function actor({ active = false, features = [] } = {}) {
  return {
    isOwner: true,
    flags: {
      [MODULE_ID]: { vessel: { mantle: { active } } }
    },
    items: features,
    itemTypes: { equipment: [] },
    getFlag(scope, key) {
      if (scope === MODULE_ID && key === 'vessel.mantle.active') {
        return this.flags[MODULE_ID].vessel.mantle.active;
      }
      return undefined;
    }
  };
}

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

test('prepares only the damage types unlocked by the actor', () => {
  const target = actor({
    active: true,
    features: [{ system: { identifier: 'cursed-magic' } }]
  });
  const strike = activity('iridescent-strike', target);
  prepareIridescentStrike(strike, target);
  assert.deepEqual(
    strike.updated.damage.parts[0].types,
    ['radiant', 'fire']
  );
});

test('an inactive Strike is cancelled and prompts instead of rolling', async () => {
  const target = actor({ active: false });
  const strike = activity('iridescent-strike', target);
  let prompted = 0;
  const result = handlePreUseActivity(strike, {
    promptToActivateAndRetry: async () => { prompted += 1; }
  });
  assert.equal(result, false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(prompted, 1);
});

test('concurrent inactive Strikes share one prompt and retry only once', async () => {
  const target = actor({ active: false });
  const firstStrike = activity('iridescent-strike', target);
  const secondStrike = activityClone(
    'iridescent-strike',
    target,
    firstStrike.sourceItem,
    firstStrike.sourceActivity
  );
  let confirmDialog;
  const confirmation = new Promise(resolve => { confirmDialog = resolve; });
  let dialogCalls = 0;
  let activationCalls = 0;
  const prompt = usedActivity => promptToActivateAndRetry(usedActivity, {
    confirm: async () => {
      dialogCalls += 1;
      return confirmation;
    },
    activate: async usedActor => {
      activationCalls += 1;
      usedActor.flags[MODULE_ID].vessel.mantle.active = true;
    }
  });

  assert.equal(handlePreUseActivity(firstStrike, {
    promptToActivateAndRetry: prompt
  }), false);
  assert.equal(handlePreUseActivity(secondStrike, {
    promptToActivateAndRetry: prompt
  }), false);
  assert.equal(dialogCalls, 1);
  assert.equal(firstStrike.sourceActivity.useCalls, 0);

  confirmDialog(true);
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(activationCalls, 1);
  assert.equal(firstStrike.sourceActivity.useCalls, 1);
});

test('the default DialogV2 confirmation keeps its class receiver', async () => {
  const previousFoundry = globalThis.foundry;
  const target = actor({ active: false });
  const strike = activity('iridescent-strike', target);
  const dialog = {
    receiver: undefined,
    async confirm() {
      this.receiver = this;
      return true;
    }
  };
  globalThis.foundry = {
    applications: { api: { DialogV2: dialog } }
  };

  try {
    await promptToActivateAndRetry(strike, {
      activate: async () => {
        target.flags[MODULE_ID].vessel.mantle.active = true;
      }
    });
    assert.equal(dialog.receiver, dialog);
    assert.equal(strike.sourceActivity.useCalls, 1);
  } finally {
    globalThis.foundry = previousFoundry;
  }
});

test('an active Strike proceeds through dnd5e', () => {
  const target = actor({ active: true });
  const strike = activity('iridescent-strike', target);
  assert.equal(handlePreUseActivity(strike), undefined);
  assert.ok(strike.updated);
});

test('persists stale source Strike types before retrying once through native use', async () => {
  const target = actor({
    active: true,
    features: [{ system: { identifier: 'cursed-magic' } }]
  });
  const strike = activity('iridescent-strike', target);
  let retried;
  let retryResult;
  strike.sourceActivity.onUse = () => {
    retried = activityClone(
      'iridescent-strike',
      target,
      strike.sourceItem,
      strike.sourceActivity
    );
    retryResult = handlePreUseActivity(retried);
  };

  assert.equal(handlePreUseActivity(strike), false);
  await new Promise(resolve => setImmediate(resolve));

  const updatePath = `system.activities.${ACTIVITY_ID}.damage.parts`;
  assert.deepEqual(
    strike.sourceItem.updateCalls[0][updatePath][0].types,
    ['radiant', 'fire']
  );
  assert.equal(strike.sourceActivity.useCalls, 1);
  assert.equal(retryResult, undefined);
  assert.deepEqual(retried.updated.damage.parts[0].types, ['radiant', 'fire']);
});

test('using the toggle delegates to the state service', async () => {
  const target = actor();
  const toggle = activity('mantle-toggle', target);
  let calledWith;
  handlePostUseActivity(toggle, {
    toggleSpiritMantle: async (usedActor, options) => {
      calledWith = { usedActor, options };
    },
    reportError: error => { throw error; }
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calledWith.usedActor, target);
  assert.equal(calledWith.options.sourceItem, toggle.sourceItem);
});

test('registers only public Foundry and dnd5e hooks', () => {
  const on = [];
  const once = [];
  registerVesselAutomationHooks({
    on(name, handler) { on.push([name, handler]); },
    once(name, handler) { once.push([name, handler]); }
  });
  assert.deepEqual(on.map(([name]) => name).sort(), [
    'createItem',
    'deleteActiveEffect',
    'deleteItem',
    'dnd5e.postUseActivity',
    'dnd5e.preUseActivity',
    'updateItem'
  ]);
  assert.deepEqual(once.map(([name]) => name), ['ready']);
});

test('only the document-hook initiating client reconciles create update and delete events', async () => {
  const clientA = hookRegistry();
  const clientB = hookRegistry();
  const reconciledA = [];
  const reconciledB = [];
  const target = actor({ active: true });
  const equipment = {
    id: 'ArmorItem0000001',
    type: 'equipment',
    actor: target,
    identifier: 'leather-armor',
    system: { identifier: 'leather-armor' }
  };
  const effect = {
    id: 'MantleEffect0001',
    flags: role('mantle-ac'),
    parent: target
  };

  registerVesselAutomationHooks(clientA.hooks, {
    currentUserId: () => OWNER_USER_A_ID,
    reconcileActor: async usedActor => { reconciledA.push(usedActor); }
  });
  registerVesselAutomationHooks(clientB.hooks, {
    currentUserId: () => OWNER_USER_B_ID,
    reconcileActor: async usedActor => { reconciledB.push(usedActor); }
  });

  for (const client of [clientA, clientB]) {
    client.on.get('createItem')(equipment, {}, OWNER_USER_A_ID);
    client.on.get('updateItem')(
      equipment,
      { system: { equipped: true } },
      {},
      OWNER_USER_A_ID
    );
    client.on.get('deleteItem')(equipment, {}, OWNER_USER_A_ID);
    client.on.get('deleteActiveEffect')(effect, {}, OWNER_USER_A_ID);
  }
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(reconciledA.length, 4);
  assert.equal(reconciledB.length, 0);
});

test('responsible ready user prefers the first active GM by id', () => {
  const target = actor();
  target.testUserPermission = user =>
    [OWNER_USER_A_ID, OWNER_USER_B_ID].includes(user.id);
  const users = [
    { id: OWNER_USER_A_ID, active: true, isGM: false },
    { id: ACTIVE_GM_B_ID, active: true, isGM: true },
    { id: ACTIVE_GM_A_ID, active: true, isGM: true }
  ];

  assert.equal(getResponsibleUser(target, users).id, ACTIVE_GM_A_ID);
});

test('responsible-user ordering uses locale-independent code units', () => {
  const target = actor();
  target.testUserPermission = () => true;
  const users = [
    { id: 'aOwnerUser000001', active: true, isGM: false },
    { id: 'BOwnerUser000001', active: true, isGM: false }
  ];

  assert.equal(getResponsibleUser(target, users).id, 'BOwnerUser000001');
});

test('exactly the first active owner migrates then reconciles an actor on ready', async () => {
  const target = actor({ active: true });
  target.id = 'VesselActor00001';
  target.testUserPermission = user =>
    [OWNER_USER_A_ID, OWNER_USER_B_ID].includes(user.id);
  const users = [
    { id: OWNER_USER_B_ID, active: true, isGM: false },
    { id: OWNER_USER_A_ID, active: true, isGM: false },
    { id: 'OfflineUser00001', active: false, isGM: true }
  ];
  const migrated = new Map(users.map(user => [user.id, []]));
  const reconciled = new Map(users.map(user => [user.id, []]));
  const clients = users.map(user => {
    const registry = hookRegistry();
    registerVesselAutomationHooks(registry.hooks, {
      actors: () => [target],
      users: () => users,
      currentUserId: () => user.id,
      migrateActor: async usedActor => {
        migrated.get(user.id).push(usedActor);
      },
      reconcileActor: async usedActor => {
        reconciled.get(user.id).push(usedActor);
      }
    });
    return registry;
  });

  for (const client of clients) client.once.get('ready')();
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(migrated.get(OWNER_USER_A_ID).length, 1);
  assert.equal(migrated.get(OWNER_USER_B_ID).length, 0);
  assert.equal(migrated.get('OfflineUser00001').length, 0);
  assert.equal(reconciled.get(OWNER_USER_A_ID).length, 1);
  assert.equal(reconciled.get(OWNER_USER_B_ID).length, 0);
  assert.equal(reconciled.get('OfflineUser00001').length, 0);
});

test('ready reconciliation cleans inactive stale effects after migration failure', async () => {
  function staleActor(id, disabled) {
    const staleEffect = {
      _id: `StaleEffect0000${disabled ? '2' : '1'}`,
      disabled,
      flags: role('mantle-ac')
    };
    const target = {
      id,
      isOwner: true,
      classes: { vessel: { system: { levels: 1 } } },
      flags: {},
      effects: [staleEffect],
      itemTypes: { equipment: [] },
      items: new Map([[
        MANTLE_ITEM_ID,
        {
          id: MANTLE_ITEM_ID,
          identifier: 'spirit-mantle',
          system: { identifier: 'spirit-mantle' }
        }
      ]]),
      testUserPermission: () => true,
      getFlag() {
        return undefined;
      },
      async setFlag() {
        throw new Error('cleanup must not reactivate a removable stale effect');
      },
      async updateEmbeddedDocuments(type, rows) {
        assert.equal(type, 'ActiveEffect');
        for (const row of rows) {
          Object.assign(this.effects.find(effect => effect._id === row._id), row);
        }
      },
      async deleteEmbeddedDocuments(type, ids) {
        assert.equal(type, 'ActiveEffect');
        this.effects = this.effects.filter(effect => !ids.includes(effect._id));
      }
    };
    return target;
  }

  const actors = [
    staleActor('StaleActor000001', false),
    staleActor('StaleActor000002', true)
  ];
  const registry = hookRegistry();
  const originalError = console.error;
  console.error = () => {};
  try {
    registerVesselAutomationHooks(registry.hooks, {
      actors: () => actors,
      users: () => [{ id: ACTIVE_GM_A_ID, active: true, isGM: true }],
      currentUserId: () => ACTIVE_GM_A_ID,
      migrateActor: async () => {
        throw new Error('migration failed');
      }
    });

    registry.once.get('ready')();
    await new Promise(resolve => setImmediate(resolve));

    assert.deepEqual(actors.map(target => target.effects.length), [0, 0]);
  } finally {
    console.error = originalError;
  }
});
