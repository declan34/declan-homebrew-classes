import test from 'node:test';
import assert from 'node:assert/strict';

import {
  handlePostUseActivity,
  handlePreUseActivity,
  promptForArchonExpiry,
  promptForArchonReversion,
  registerVesselAutomationHooks
} from '../scripts/vessel/hooks.mjs';
import {
  getArchonPending,
  getArchonState
} from '../scripts/vessel/archon-lifecycle.mjs';

const MODULE_ID = 'declan-homebrew-classes';

function flags(role) {
  return { [MODULE_ID]: { vessel: { role } } };
}

function actor({
  id = 'vessel-actor',
  level = 6,
  state,
  pending,
  token = false
} = {}) {
  return {
    id,
    uuid: token ? `Scene.scene.Token.${id}` : `Actor.${id}`,
    documentName: 'Actor',
    type: 'character',
    isOwner: true,
    isToken: token,
    classes: { vessel: { system: { levels: level } } },
    system: {
      attributes: { hp: { value: 20, temp: 0 } },
      traits: { languages: { value: new Set(['common']), custom: '' } },
      spells: { vessel: { value: 1 } }
    },
    flags: {
      ...(state || pending ? {
        [MODULE_ID]: {
          vessel: {
            archon: {
              ...(state ? { state: structuredClone(state) } : {}),
              ...(pending ? { pending: structuredClone(pending) } : {})
            }
          }
        }
      } : {})
    },
    items: new Map(),
    effects: [],
    getFlag(scope, key) {
      return key.split('.').reduce(
        (value, segment) => value?.[segment],
        this.flags?.[scope]
      );
    },
    async setFlag(scope, key, value) {
      this.flags[scope] ??= {};
      const path = key.split('.');
      let current = this.flags[scope];
      for (const segment of path.slice(0, -1)) current = current[segment] ??= {};
      current[path.at(-1)] = structuredClone(value);
    },
    async unsetFlag(scope, key) {
      const path = key.split('.');
      let current = this.flags?.[scope];
      for (const segment of path.slice(0, -1)) current = current?.[segment];
      if (current) delete current[path.at(-1)];
    }
  };
}

function activity(role, target, {
  id = `activity-${role}`,
  profileUuid = 'Compendium.test.Actor.cursed'
} = {}) {
  const sourceActivity = {
    id,
    flags: flags(role),
    async use() {
      this.useCalls = (this.useCalls ?? 0) + 1;
    }
  };
  const item = {
    id: `item-${role}`,
    actor: target,
    system: { activities: new Map([[id, sourceActivity]]) }
  };
  target.items.set(item.id, item);
  return {
    id,
    flags: flags(role),
    item,
    profiles: [{
      _id: 'profile-choice',
      uuid: profileUuid,
      toObject() { return { _id: this._id, uuid: this.uuid }; }
    }],
    updateSource() {}
  };
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

function tick() {
  return new Promise(resolve => setImmediate(resolve));
}

test('Archon pre-use delegates to async preparation while unrelated activities remain native', () => {
  const target = actor();
  const transform = activity('archon-transform-free', target);
  let prepared;

  assert.equal(handlePreUseActivity(transform, {
    requestArchonActivityPreparation(used, usage, options) {
      prepared = { used, usage, options };
      return false;
    }
  }, { transform: {} }), false);
  assert.equal(prepared.used, transform);
  assert.deepEqual(prepared.usage, { transform: {} });

  const unrelated = activity('other-module-role', target);
  assert.equal(handlePreUseActivity(unrelated), undefined);
});

test('successful Transform use stages payment, profile, activity, and time on its source actor', async () => {
  const target = actor();
  const transform = activity('archon-transform-slot', target);
  const message = {
    getFlag(scope, key) {
      if (scope === 'dnd5e' && key === 'transform.uuid') {
        return 'Compendium.test.Actor.cursed';
      }
    }
  };

  handlePostUseActivity(transform, {
    reportError: error => { throw error; }
  }, {}, { message });
  await tick();

  assert.deepEqual(getArchonPending(target), {
    activityId: transform.id,
    itemId: transform.item.id,
    payment: 'slot',
    profile: 'cursed',
    profileUuid: 'Compendium.test.Actor.cursed',
    stagedAt: 0
  });
});

test('linked transform hook stamps lifecycle state and finalizes through normal createActor', async () => {
  const pending = {
    activityId: 'activity-archon-transform-free',
    itemId: 'item-archon-transform-free',
    payment: 'free',
    profile: 'cursed',
    profileUuid: 'Compendium.test.Actor.cursed',
    stagedAt: 25
  };
  const original = actor({ pending });
  const profile = {
    uuid: pending.profileUuid,
    type: 'npc',
    flags: {
      [MODULE_ID]: {
        vessel: { archon: { profile: 'cursed', acBonus: 1 } }
      }
    },
    system: { traits: { languages: { value: new Set(['abyssal']), custom: '' } } }
  };
  const changes = {
    flags: { dnd5e: { isPolymorphed: true } },
    system: {
      traits: { languages: { value: new Set(['abyssal']), custom: '' } },
      attributes: { hp: { temp: 0 } }
    }
  };
  const hooks = registry();
  const finalized = [];
  registerVesselAutomationHooks(hooks.hooks, {
    currentUserId: () => 'user',
    finalizeArchon: async form => { finalized.push(form); }
  });

  hooks.on.get('dnd5e.transformActorV2')(original, profile, changes);
  assert.equal(
    changes.flags[MODULE_ID].vessel.archon.state.profileUuid,
    pending.profileUuid
  );
  const form = actor({
    id: 'transformed',
    state: changes.flags[MODULE_ID].vessel.archon.state
  });
  hooks.on.get('createActor')(form, {}, 'user');
  await tick();

  assert.deepEqual(finalized, [form]);
  assert.equal(getArchonPending(original), undefined);
});

test('linked transform ignores an older chat card whose profile no longer matches pending state', () => {
  const original = actor({
    pending: {
      activityId: 'new-card',
      itemId: 'control',
      payment: 'slot',
      profile: 'fallen',
      profileUuid: 'Compendium.test.Actor.fallen',
      stagedAt: 30
    }
  });
  const changes = {
    flags: { dnd5e: { isPolymorphed: true } },
    system: {
      traits: { languages: { value: new Set(), custom: '' } },
      attributes: { hp: { temp: 0 } }
    }
  };
  const hooks = registry();
  registerVesselAutomationHooks(hooks.hooks);

  hooks.on.get('dnd5e.transformActorV2')(
    original,
    { uuid: 'Compendium.test.Actor.cursed' },
    changes
  );
  assert.equal(changes.flags[MODULE_ID], undefined);
});

test('unlinked native actor update is stamped in preUpdateActor then finalized', async () => {
  const pending = {
    activityId: 'activity-archon-transform-slot',
    itemId: 'item-archon-transform-slot',
    payment: 'slot',
    profile: 'cursed',
    profileUuid: 'Compendium.test.Actor.cursed',
    stagedAt: 25
  };
  const tokenActor = actor({ pending, token: true });
  const changes = {
    flags: {
      dnd5e: { isPolymorphed: true },
      [MODULE_ID]: { vessel: { archon: { pending } } }
    },
    system: {
      traits: { languages: { value: new Set(['abyssal']), custom: '' } },
      attributes: { hp: { temp: 0 } }
    }
  };
  const hooks = registry();
  const finalized = [];
  registerVesselAutomationHooks(hooks.hooks, {
    currentUserId: () => 'user',
    finalizeArchon: async form => { finalized.push(form); }
  });

  hooks.on.get('preUpdateActor')(tokenActor, changes, {}, 'user');
  assert.equal(
    changes.flags[MODULE_ID].vessel.archon.state.profileUuid,
    pending.profileUuid
  );
  tokenActor.flags = structuredClone(changes.flags);
  tokenActor.system = changes.system;
  hooks.on.get('updateActor')(tokenActor, changes, {}, 'user');
  await tick();

  assert.deepEqual(finalized, [tokenActor]);
});

test('Extend and Revert remain native at post-use boundaries', async () => {
  const active = {
    active: true,
    startedAt: 0,
    expiresAt: 600,
    profile: 'cursed',
    profileUuid: 'Compendium.test.Actor.cursed',
    sourceActorUuid: 'Actor.vessel-actor',
    payment: 'free',
    acBonus: 1,
    tempHPBeforeTransform: 0
  };
  const target = actor({ state: active });
  const extend = activity('archon-extend', target);
  const revert = activity('archon-revert', target);
  let extended = 0;
  let reverted = 0;

  handlePostUseActivity(extend, {
    extendArchonForm: async () => { extended += 1; },
    reportError: error => { throw error; }
  });
  handlePostUseActivity(revert, {
    revertArchonForm: async () => { reverted += 1; },
    reportError: error => { throw error; }
  });
  await tick();

  assert.equal(extended, 1);
  assert.equal(reverted, 1);
});

test('inactive Extend and Revert are rejected before native consumption', () => {
  const target = actor();
  assert.equal(
    handlePreUseActivity(activity('archon-extend', target)),
    false
  );
  assert.equal(
    handlePreUseActivity(activity('archon-revert', target)),
    false
  );
});

test('expiry prompt displays the profile and routes Extend, Revert, and Later safely', async () => {
  const state = {
    active: true,
    startedAt: 0,
    expiresAt: 600,
    profile: 'cursed',
    profileUuid: 'Compendium.test.Actor.cursed',
    sourceActorUuid: 'Actor.vessel-actor',
    payment: 'free',
    acBonus: 1,
    tempHPBeforeTransform: 0
  };
  const target = actor({ state });
  const extend = activity('archon-extend', target);
  let content;
  let reverted = 0;

  await promptForArchonExpiry(target, {
    choose: async options => {
      content = options.content;
      return 'extend';
    },
    revertArchonForm: async () => { reverted += 1; }
  });
  assert.match(content, /cursed/i);
  assert.match(content, /remaining/i);
  assert.equal(
    target.items.get(extend.item.id).system.activities.get(extend.id).useCalls,
    1
  );

  await promptForArchonExpiry(target, {
    choose: async () => 'revert',
    revertArchonForm: async () => { reverted += 1; }
  });
  await promptForArchonExpiry(target, {
    choose: async () => 'later',
    revertArchonForm: async () => { reverted += 1; }
  });
  assert.equal(reverted, 1);
});

test('rule-boundary confirmation reverts only after the player accepts', async () => {
  const target = actor({
    state: {
      active: true,
      startedAt: 0,
      expiresAt: 600,
      profile: 'cursed',
      profileUuid: 'Compendium.test.Actor.cursed',
      sourceActorUuid: 'Actor.vessel-actor',
      payment: 'free',
      acBonus: 1,
      tempHPBeforeTransform: 0
    }
  });
  let reverted = 0;
  await promptForArchonReversion(target, 'zero-hp', {
    confirm: async () => false,
    revertArchonForm: async () => { reverted += 1; }
  });
  await promptForArchonReversion(target, 'unconscious', {
    confirm: async () => true,
    revertArchonForm: async () => { reverted += 1; }
  });
  assert.equal(reverted, 1);
});

test('responsible user receives deduped expiry and rule prompts with level gates', async () => {
  const state = {
    active: true,
    startedAt: 0,
    expiresAt: 10,
    profile: 'cursed',
    profileUuid: 'Compendium.test.Actor.cursed',
    sourceActorUuid: 'Actor.vessel-actor',
    payment: 'free',
    acBonus: 1,
    tempHPBeforeTransform: 0
  };
  const lowLevel = actor({ state, level: 6 });
  lowLevel.testUserPermission = user => user.id === 'owner';
  lowLevel.statuses = new Set();
  const highLevel = actor({ id: 'controlled', state, level: 7 });
  highLevel.testUserPermission = user => user.id === 'owner';
  highLevel.statuses = new Set(['unconscious']);
  const users = [{ id: 'owner', active: true, isGM: false }];
  const hooks = registry();
  const expiry = [];
  const rules = [];
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  registerVesselAutomationHooks(hooks.hooks, {
    actors: () => [lowLevel],
    users: () => users,
    currentUserId: () => 'owner',
    promptArchonExpiry: async used => {
      expiry.push(used);
      await blocked;
    },
    promptArchonReversion: async (used, reason) => {
      rules.push([used, reason]);
    }
  });

  hooks.on.get('updateWorldTime')(20);
  hooks.on.get('updateWorldTime')(21);
  await tick();
  assert.equal(expiry.length, 1);
  release();
  await tick();

  lowLevel.system.attributes.hp.value = 0;
  hooks.on.get('updateActor')(
    lowLevel,
    { system: { attributes: { hp: { value: 0 } } } },
    {},
    'owner'
  );
  await tick();
  assert.deepEqual(rules, [[lowLevel, 'zero-hp']]);

  lowLevel.system.attributes.hp.value = 20;
  lowLevel.statuses.add('unconscious');
  hooks.on.get('updateActor')(lowLevel, {}, {}, 'owner');
  hooks.on.get('updateActor')(highLevel, {}, {}, 'owner');
  await tick();
  assert.deepEqual(rules, [
    [lowLevel, 'zero-hp'],
    [lowLevel, 'unconscious']
  ]);
});

test('default expiry enumeration includes active-scene unlinked token actors', async () => {
  const previousGame = globalThis.game;
  const previousCanvas = globalThis.canvas;
  const state = {
    active: true,
    startedAt: 0,
    expiresAt: 10,
    profile: 'cursed',
    profileUuid: 'Compendium.test.Actor.cursed',
    sourceActorUuid: 'Actor.vessel-actor',
    payment: 'free',
    acBonus: 1,
    tempHPBeforeTransform: 0
  };
  const linked = actor({ id: 'linked-expiry', state });
  const synthetic = actor({ id: 'synthetic-expiry', state, token: true });
  const owner = { id: 'owner', active: true, isGM: false };
  linked.testUserPermission = synthetic.testUserPermission =
    user => user.id === owner.id;
  globalThis.game = {
    actors: [linked],
    users: [owner],
    user: owner
  };
  globalThis.canvas = {
    scene: { tokens: [{ actor: synthetic }] }
  };
  const hooks = registry();
  const prompted = [];
  try {
    registerVesselAutomationHooks(hooks.hooks, {
      promptArchonExpiry: async used => { prompted.push(used); }
    });
    hooks.on.get('updateWorldTime')(20);
    await tick();
    assert.deepEqual(new Set(prompted), new Set([linked, synthetic]));
  } finally {
    globalThis.game = previousGame;
    globalThis.canvas = previousCanvas;
  }
});

test('level 11 finalization emits one non-blocking Elder Archon reminder', async () => {
  const state = {
    active: true,
    startedAt: 0,
    expiresAt: 3600,
    profile: 'cursed',
    profileUuid: 'Compendium.test.Actor.cursed',
    sourceActorUuid: 'Actor.vessel-actor',
    payment: 'free',
    acBonus: 1,
    tempHPBeforeTransform: 0
  };
  const form = actor({ id: 'elder-form', state, level: 11 });
  const hooks = registry();
  const reminders = [];
  registerVesselAutomationHooks(hooks.hooks, {
    currentUserId: () => 'owner',
    finalizeArchon: async () => ({ handled: true }),
    remindElderArchon: used => { reminders.push(used); }
  });

  hooks.on.get('createActor')(form, {}, 'owner');
  hooks.on.get('createActor')(form, {}, 'owner');
  await tick();
  assert.deepEqual(reminders, [form]);
});
