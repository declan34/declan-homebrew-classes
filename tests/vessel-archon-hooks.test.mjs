import test from 'node:test';
import assert from 'node:assert/strict';

import {
  handlePostUseActivity,
  handlePreUseActivity,
  handleRenderArchonChatMessage,
  performArchonTransformation,
  promptForArchonEquipmentPreference,
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
  const messageConfig = { data: { flags: {} } };

  assert.equal(handlePreUseActivity(transform, {
    requestArchonActivityPreparation(used, usage, options) {
      prepared = { used, usage, options };
      return false;
    }
  }, { transform: {} }, messageConfig), false);
  assert.equal(prepared.used, transform);
  assert.deepEqual(prepared.usage, { transform: {} });

  const unrelated = activity('other-module-role', target);
  assert.equal(handlePreUseActivity(unrelated), undefined);
});

test('successful Transform use binds the in-place switch to its source actor', async () => {
  const target = actor();
  const transform = activity('archon-transform-slot', target);
  const profile = { uuid: 'Compendium.test.Actor.cursed' };
  const switched = [];
  const message = {
    id: 'message-transform-one',
    getFlag(scope, key) {
      if (scope === 'dnd5e' && key === 'transform.uuid') {
        return 'Compendium.test.Actor.cursed';
      }
    },
    async unsetFlag(scope, key) {
      this.unset = [scope, key];
    }
  };

  handlePostUseActivity(transform, {
    resolveUuid: async uuid => uuid === profile.uuid ? profile : undefined,
    performArchonTransformation: async (used, pending) => {
      switched.push({ used, pending });
      return target;
    },
    reportError: error => { throw error; }
  }, {}, { message });
  await tick();

  assert.deepEqual(switched[0].pending, {
    activityId: transform.id,
    itemId: transform.item.id,
    payment: 'slot',
    profile: 'cursed',
    profileUuid: 'Compendium.test.Actor.cursed',
    stagedAt: 0,
    transformationId: 'message-transform-one'
  });
  assert.equal(switched[0].used, transform);
});

test('Transform use copies the prepared Dire Stature category into pending state', async () => {
  const target = actor();
  const transform = activity('archon-transform-free', target);
  const switched = [];

  handlePostUseActivity(transform, {
    performArchonTransformation: async (_used, pending) => {
      switched.push(pending);
      return target;
    },
    reportError: error => { throw error; }
  }, {
    transform: { profile: 'profile-choice' },
    growthCategories: 1
  }, {
    message: { id: 'message-dire-growth' }
  });
  await tick();

  assert.equal(switched[0].growthCategories, 1);
});

test('Transform use resolves the selected activity profile before its chat flag is persisted', async () => {
  const target = actor();
  const profileUuid = 'Compendium.test.Actor.cursed';
  const transform = activity('archon-transform-slot', target, { profileUuid });
  const switched = [];
  const errors = [];

  handlePostUseActivity(transform, {
    resolveUuid: async uuid => uuid === profileUuid ? { uuid } : undefined,
    performArchonTransformation: async (_used, pending) => {
      switched.push(pending.profileUuid);
      return target;
    },
    reportError: error => errors.push(error)
  }, {
    transform: { profile: 'profile-choice' }
  }, {
    message: {
      id: 'message-transform-flag-race',
      getFlag() { return undefined; }
    }
  });
  await tick();

  assert.deepEqual(errors, []);
  assert.deepEqual(switched, [profileUuid]);
});

test('owner-bound transform ignores unrelated controlled scene targets', async () => {
  const owner = actor();
  const unrelated = actor({ id: 'unrelated' });
  const transform = activity('archon-transform-free', owner);
  transform.settings = { keep: new Set(['class']) };
  const calls = [];
  const profile = { uuid: 'Compendium.test.Actor.cursed' };
  const previousCanvas = globalThis.canvas;
  globalThis.canvas = { tokens: { controlled: [{ actor: unrelated }] } };
  try {
    await performArchonTransformation(transform, {
      payment: 'free',
      profile: 'cursed',
      profileUuid: profile.uuid,
      transformationId: 'message-owner-bound'
    }, {
      message: { async unsetFlag() {} }
    }, {
      resolveUuid: async () => profile,
      activateArchonForm: async (target, source) => {
        calls.push([target === owner ? 'owner' : 'unrelated', source.uuid]);
        return target;
      }
    });
  } finally {
    globalThis.canvas = previousCanvas;
  }

  assert.deepEqual(calls, [['owner', profile.uuid]]);
});

test('Archon post-use activates the selected profile in place without native polymorphing', async () => {
  const target = actor();
  const transform = activity('archon-transform-slot', target);
  const profile = { uuid: 'Compendium.test.Actor.cursed' };
  const calls = [];
  target.transformInto = async () => assert.fail('native transform must not run');

  const result = await performArchonTransformation(transform, {
    payment: 'slot',
    profile: 'cursed',
    profileUuid: profile.uuid,
    transformationId: 'message-in-place'
  }, {}, {
    resolveUuid: async () => profile,
    activateArchonForm: async (actorDocument, profileDocument, pending) => {
      calls.push([actorDocument, profileDocument, pending]);
      return actorDocument;
    }
  });

  assert.equal(result, target);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], target);
  assert.equal(calls[0][1], profile);
  assert.equal(calls[0][2].transformationId, 'message-in-place');
});

test('Archon chat cards suppress Foundry’s generic selected-target transform button', () => {
  const target = actor();
  const transform = activity('archon-transform-free', target);
  const message = {
    getAssociatedActivity() { return transform; }
  };
  const button = {
    disabled: false,
    removeCalls: 0,
    remove() { this.removeCalls += 1; }
  };
  const html = {
    querySelectorAll(selector) {
      assert.equal(
        selector,
        '.card-buttons > button[data-action="transformActor"]'
      );
      return [button];
    }
  };

  handleRenderArchonChatMessage(message, html);

  assert.equal(button.disabled, true);
  assert.equal(button.removeCalls, 1);
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
  let revertOptions = 'not-called';

  handlePostUseActivity(extend, {
    extendArchonForm: async () => { extended += 1; },
    reportError: error => { throw error; }
  });
  handlePostUseActivity(revert, {
    revertArchonForm: async (_actor, options) => {
      reverted += 1;
      revertOptions = options;
    },
    reportError: error => { throw error; }
  });
  await tick();

  assert.equal(extended, 1);
  assert.equal(reverted, 1);
  assert.equal(revertOptions, undefined);
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

test('Transform is rejected while Archon Form is already active', () => {
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
      tempHPBeforeTransform: 0,
      transformationId: 'existing-form'
    }
  });
  let prepared = 0;

  for (const role of ['archon-transform-free', 'archon-transform-slot']) {
    assert.equal(handlePreUseActivity(activity(role, target), {
      requestArchonActivityPreparation: () => { prepared += 1; }
    }), false);
  }
  assert.equal(prepared, 0);
});

test('Transform is rejected during activation or cleanup while Revert can retry cleanup', () => {
  let prepared = 0;
  for (const state of [
    {
      active: false,
      activating: true,
      transformationId: 'activation-in-progress'
    },
    {
      active: false,
      cleanupPending: true,
      transformationId: 'cleanup-in-progress'
    }
  ]) {
    const target = actor({ state });
    for (const role of ['archon-transform-free', 'archon-transform-slot']) {
      assert.equal(handlePreUseActivity(activity(role, target), {
        requestArchonActivityPreparation: () => { prepared += 1; }
      }), false);
    }

    const revert = activity('archon-revert', target);
    assert.equal(handlePreUseActivity(revert, {
      requestArchonActivityPreparation: () => { prepared += 1; }
    }), state.cleanupPending ? undefined : false);
  }
  assert.equal(prepared, 1);
});

test('failed in-place activation clears only its matching pending state', async () => {
  const target = actor({ id: 'failed-in-place' });
  const transform = activity('archon-transform-free', target);
  const pending = {
    payment: 'free',
    profile: 'cursed',
    profileUuid: 'Compendium.test.Actor.cursed',
    transformationId: 'message-failed-in-place'
  };

  await assert.rejects(
    performArchonTransformation(
      transform,
      pending,
      {},
      {
        resolveUuid: async () => ({ uuid: pending.profileUuid }),
        activateArchonForm: async () => {
          throw new Error('in-place activation failed');
        }
      }
    ),
    /in-place activation failed/
  );
  assert.equal(getArchonPending(target), undefined);
});

test('Equipment Preference saves either native equipment policy and never posts an activity card', async () => {
  const target = actor();
  const configure = activity('archon-equipment-preference', target);

  assert.equal(handlePreUseActivity(configure, {
    promptArchonEquipmentPreference: used => promptForArchonEquipmentPreference(
      used,
      { choose: async () => true }
    ),
    reportError: error => { throw error; }
  }), false);
  await tick();
  assert.equal(
    target.getFlag(MODULE_ID, 'vessel.archon.keepEquipment'),
    true
  );

  assert.equal(handlePreUseActivity(configure, {
    promptArchonEquipmentPreference: used => promptForArchonEquipmentPreference(
      used,
      { choose: async () => false }
    ),
    reportError: error => { throw error; }
  }), false);
  await tick();
  assert.equal(
    target.getFlag(MODULE_ID, 'vessel.archon.keepEquipment'),
    false
  );
});

test('Equipment Preference cancellation preserves the current policy and concurrent uses dedupe', async () => {
  const target = actor();
  await target.setFlag(MODULE_ID, 'vessel.archon.keepEquipment', true);
  const configure = activity('archon-equipment-preference', target);
  let resolveChoice;
  const choice = new Promise(resolve => { resolveChoice = resolve; });
  let prompts = 0;
  const prompt = used => {
    prompts += 1;
    return promptForArchonEquipmentPreference(used, {
      choose: async () => choice
    });
  };

  assert.equal(handlePreUseActivity(configure, {
    promptArchonEquipmentPreference: prompt
  }), false);
  assert.equal(handlePreUseActivity(configure, {
    promptArchonEquipmentPreference: prompt
  }), false);
  assert.equal(prompts, 1);
  resolveChoice(null);
  await tick();

  assert.equal(prompts, 1);
  assert.equal(
    target.getFlag(MODULE_ID, 'vessel.archon.keepEquipment'),
    true
  );
});

test('non-owners cannot change Archon equipment preference', async () => {
  const target = actor();
  target.isOwner = false;
  let prompted = 0;

  assert.equal(handlePreUseActivity(
    activity('archon-equipment-preference', target),
    {
      promptArchonEquipmentPreference: async () => { prompted += 1; }
    }
  ), false);
  await tick();
  assert.equal(prompted, 0);
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

test('level 11 finalization emits once per transformation, including a reused synthetic actor', async () => {
  const state = {
    active: true,
    startedAt: 0,
    expiresAt: 3600,
    profile: 'cursed',
    profileUuid: 'Compendium.test.Actor.cursed',
    sourceActorUuid: 'Actor.vessel-actor',
    payment: 'free',
    acBonus: 1,
    tempHPBeforeTransform: 0,
    transformationId: 'message-one'
  };
  const form = actor({ id: 'elder-form', state, level: 11, token: true });
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

  form.flags[MODULE_ID].vessel.archon.state.transformationId = 'message-two';
  hooks.on.get('updateActor')(
    form,
    {
      flags: {
        [MODULE_ID]: {
          vessel: {
            archon: {
              state: {
                ...state,
                transformationId: 'message-two'
              }
            }
          }
        }
      }
    },
    {},
    'owner'
  );
  await tick();
  assert.deepEqual(reminders, [form, form]);
});
