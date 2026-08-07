import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(
  new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url)
);
const yaml = require('js-yaml');

const {
  configureStrikingPresence,
  getStrikingPresenceSkill,
  reconcileStrikingPresence
} = await import(
  '../scripts/vessel/striking-presence.mjs'
);
const {
  handlePreUseActivity,
  registerVesselAutomationHooks
} = await import('../scripts/vessel/hooks.mjs');

const MODULE_ID = 'declan-homebrew-classes';

function aspect({ isOwner = true, skill } = {}) {
  const item = {
    isOwner,
    flags: skill === undefined ? {} : {
      [MODULE_ID]: { vessel: { strikingPresence: { skill } } }
    },
    setFlagCalls: [],
    getFlag(scope, key) {
      return key.split('.').reduce(
        (value, segment) => value?.[segment],
        this.flags[scope]
      );
    },
    async setFlag(scope, key, value) {
      this.setFlagCalls.push({ scope, key, value });
      this.flags[scope] ??= {};
      this.flags[scope].vessel ??= {};
      this.flags[scope].vessel.strikingPresence ??= {};
      this.flags[scope].vessel.strikingPresence.skill = value;
    }
  };
  return item;
}

function configurationActivity(item) {
  const actor = item.actor
    ?? { isOwner: item.isOwner, items: new Map([[item.id, item]]) };
  item.actor = actor;
  return {
    flags: { [MODULE_ID]: { vessel: { role: 'striking-presence-configure' } } },
    item: { id: item.id, actor }
  };
}

function hookRegistry() {
  const on = new Map();
  return {
    on,
    hooks: {
      on(name, handler) { on.set(name, handler); },
      once() {}
    }
  };
}

function configuredPresence({ id, skill, uuid } = {}) {
  const item = aspect({ skill });
  item.id = id;
  item.uuid = uuid;
  item.identifier = 'striking-presence';
  return item;
}

function reconciliationActor({ mantle = false, items = [] } = {}) {
  let nextEffect = 0;
  const target = {
    isOwner: true,
    flags: {
      [MODULE_ID]: { vessel: { mantle: { active: mantle } } }
    },
    items: new Map(items.map(item => [item.id, item])),
    effects: [],
    operations: [],
    getFlag(scope, key) {
      if (scope === MODULE_ID && key === 'vessel.mantle.active') {
        return this.flags[MODULE_ID].vessel.mantle.active;
      }
    },
    async createEmbeddedDocuments(type, rows) {
      assert.equal(type, 'ActiveEffect');
      this.operations.push(['create', structuredClone(rows)]);
      const created = rows.map(row => ({
        ...structuredClone(row),
        _id: `striking-effect-${++nextEffect}`
      }));
      this.effects.push(...created);
      return created;
    },
    async deleteEmbeddedDocuments(type, ids) {
      assert.equal(type, 'ActiveEffect');
      this.operations.push(['delete', [...ids]]);
      this.effects = this.effects.filter(effect => !ids.includes(effect._id));
    },
    async updateEmbeddedDocuments(type, rows) {
      assert.equal(type, 'ActiveEffect');
      this.operations.push(['update', structuredClone(rows)]);
      for (const row of rows) {
        Object.assign(
          this.effects.find(effect => effect._id === row._id),
          structuredClone(row)
        );
      }
    }
  };
  for (const item of items) item.actor = target;
  return target;
}

function strikingEffects(target, type) {
  return target.effects.filter(effect =>
    effect.flags?.[MODULE_ID]?.vessel?.strikingPresence?.type === type
  );
}

test('reconciles an uncloaked configured copy into a permanent proficiency effect', async () => {
  const presence = configuredPresence({
    id: 'striking-presence-dec',
    uuid: 'Actor.Vessel.Item.StrikingPresenceDec',
    skill: 'dec'
  });
  const target = reconciliationActor({ items: [presence] });

  await reconcileStrikingPresence(target);

  const [proficiency] = strikingEffects(target, 'proficiency');
  assert.equal(strikingEffects(target, 'advantage').length, 0);
  assert.deepEqual(proficiency.changes, [{
    key: 'system.skills.dec.value', mode: 4, value: '1', priority: 20
  }]);
  assert.deepEqual(proficiency.flags[MODULE_ID].vessel.strikingPresence, {
    type: 'proficiency',
    sourceItemId: presence.id,
    sourceItemUuid: presence.uuid
  });
});

test('reconciles a cloaked configured copy into a separate advantage effect', async () => {
  const presence = configuredPresence({
    id: 'striking-presence-itm',
    uuid: 'Actor.Vessel.Item.StrikingPresenceItm',
    skill: 'itm'
  });
  const target = reconciliationActor({ mantle: true, items: [presence] });

  await reconcileStrikingPresence(target);

  const [advantage] = strikingEffects(target, 'advantage');
  assert.deepEqual(advantage.changes, [{
    key: 'system.skills.itm.roll.mode', mode: 2, value: '1', priority: 20
  }]);
  assert.deepEqual(advantage.flags[MODULE_ID].vessel.strikingPresence, {
    type: 'advantage',
    sourceItemId: presence.id,
    sourceItemUuid: presence.uuid
  });
  assert.equal(strikingEffects(target, 'proficiency').length, 1);
});

test('uncloaking deletes only the matching Striking Presence advantage effect', async () => {
  const presence = configuredPresence({
    id: 'striking-presence-per',
    uuid: 'Actor.Vessel.Item.StrikingPresencePer',
    skill: 'per'
  });
  const target = reconciliationActor({ mantle: true, items: [presence] });
  await reconcileStrikingPresence(target);
  target.effects.push({
    _id: 'unrelated-advantage',
    changes: [{ key: 'system.skills.per.roll.mode', mode: 2, value: '1' }],
    flags: { otherModule: { persistent: true } }
  });
  target.flags[MODULE_ID].vessel.mantle.active = false;

  await reconcileStrikingPresence(target);

  assert.equal(strikingEffects(target, 'advantage').length, 0);
  assert.equal(strikingEffects(target, 'proficiency').length, 1);
  assert.ok(target.effects.some(effect => effect._id === 'unrelated-advantage'));
});

test('keeps two configured Striking Presence copies keyed by their exact source IDs', async () => {
  const first = configuredPresence({
    id: 'striking-presence-first',
    uuid: 'Actor.Vessel.Item.StrikingPresenceFirst',
    skill: 'dec'
  });
  const second = configuredPresence({
    id: 'striking-presence-second',
    uuid: 'Actor.Vessel.Item.StrikingPresenceSecond',
    skill: 'dec'
  });
  const target = reconciliationActor({ mantle: true, items: [first, second] });

  await reconcileStrikingPresence(target);

  for (const type of ['proficiency', 'advantage']) {
    assert.deepEqual(
      strikingEffects(target, type).map(effect =>
        effect.flags[MODULE_ID].vessel.strikingPresence.sourceItemId
      ).sort(),
      [first.id, second.id].sort()
    );
  }
});

test('reconciliation refreshes effects when a configured copy changes skill', async () => {
  const presence = configuredPresence({
    id: 'striking-presence-reconfigured',
    uuid: 'Actor.Vessel.Item.StrikingPresenceReconfigured',
    skill: 'dec'
  });
  const target = reconciliationActor({ mantle: true, items: [presence] });
  await reconcileStrikingPresence(target);
  presence.flags[MODULE_ID].vessel.strikingPresence.skill = 'per';

  await reconcileStrikingPresence(target);

  assert.deepEqual(strikingEffects(target, 'proficiency')[0].changes, [{
    key: 'system.skills.per.value', mode: 4, value: '1', priority: 20
  }]);
  assert.deepEqual(strikingEffects(target, 'advantage')[0].changes, [{
    key: 'system.skills.per.roll.mode', mode: 2, value: '1', priority: 20
  }]);
});

test('reconciles Striking Presence after its item and Mantle state change', async () => {
  const registry = hookRegistry();
  const presence = configuredPresence({
    id: 'striking-presence-hook',
    uuid: 'Actor.Vessel.Item.StrikingPresenceHook',
    skill: 'dec'
  });
  const target = reconciliationActor({ items: [presence] });
  const reconciled = [];

  registerVesselAutomationHooks(registry.hooks, {
    currentUserId: () => 'current-user',
    reconcileActor: async actor => { reconciled.push(actor); }
  });

  registry.on.get('createItem')(presence, {}, 'current-user');
  registry.on.get('updateItem')(
    presence,
    { flags: { [MODULE_ID]: { vessel: { strikingPresence: { skill: 'dec' } } } } },
    {},
    'current-user'
  );
  registry.on.get('deleteItem')(presence, {}, 'current-user');
  registry.on.get('updateActor')(
    target,
    { flags: { [MODULE_ID]: { vessel: { mantle: { active: true } } } } },
    {},
    'current-user'
  );
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(reconciled, [target, target, target, target]);
});

test('stores the first Striking Presence choice on its owned Item', async () => {
  const item = aspect();

  assert.equal(await configureStrikingPresence(item, {
    choose: async () => 'dec'
  }), 'dec');
  assert.deepEqual(item.setFlagCalls, [{
    scope: MODULE_ID,
    key: 'vessel.strikingPresence.skill',
    value: 'dec'
  }]);
});

test('leaves a Striking Presence choice unchanged when its dialog is cancelled', async () => {
  const item = aspect({ skill: 'itm' });

  assert.equal(await configureStrikingPresence(item, {
    choose: async () => null
  }), undefined);
  assert.equal(getStrikingPresenceSkill(item), 'itm');
  assert.equal(item.setFlagCalls.length, 0);
});

test('replaces a previous Striking Presence choice when reconfigured', async () => {
  const item = aspect({ skill: 'dec' });

  assert.equal(await configureStrikingPresence(item, {
    choose: async () => 'per'
  }), 'per');
  assert.equal(getStrikingPresenceSkill(item), 'per');
  assert.equal(item.setFlagCalls[0].value, 'per');
});

test('treats an invalid stored Striking Presence skill as unconfigured', async () => {
  const item = aspect({ skill: 'ath' });

  assert.equal(getStrikingPresenceSkill(item), undefined);
  assert.equal(await configureStrikingPresence(item, {
    choose: async () => 'itm'
  }), 'itm');
  assert.equal(item.setFlagCalls[0].value, 'itm');
});

test('does not let a non-owner configure Striking Presence', async () => {
  const item = aspect({ isOwner: false });
  let chooseCalls = 0;

  await assert.rejects(
    configureStrikingPresence(item, {
      choose: async () => { chooseCalls += 1; return 'dec'; }
    }),
    /permission to configure this Striking Presence/
  );
  assert.equal(chooseCalls, 0);
  assert.equal(item.setFlagCalls.length, 0);
});

test('keeps duplicate Striking Presence copies independently configured', async () => {
  const deception = aspect();
  const persuasion = aspect();

  await configureStrikingPresence(deception, { choose: async () => 'dec' });
  await configureStrikingPresence(persuasion, { choose: async () => 'per' });

  assert.equal(getStrikingPresenceSkill(deception), 'dec');
  assert.equal(getStrikingPresenceSkill(persuasion), 'per');
});

test('uses DialogV2.wait with its class receiver and the three valid choices', async () => {
  const previousFoundry = globalThis.foundry;
  const item = aspect();
  const dialog = {
    receiver: undefined,
    options: undefined,
    async wait(options) {
      this.receiver = this;
      this.options = options;
      return options.buttons.find(button => button.action === 'per').callback();
    }
  };
  globalThis.foundry = { applications: { api: { DialogV2: dialog } } };

  try {
    assert.equal(await configureStrikingPresence(item), 'per');
    assert.equal(dialog.receiver, dialog);
    assert.deepEqual(
      dialog.options.buttons.map(button => button.action),
      ['dec', 'itm', 'per', 'cancel']
    );
  } finally {
    globalThis.foundry = previousFoundry;
  }
});

test('routes the Configure activity through one per-item Striking Presence prompt', async () => {
  const item = aspect();
  item.id = 'StrikingPresenceA';
  const activity = configurationActivity(item);
  const configured = [];

  assert.equal(handlePreUseActivity(activity, {
    configureStrikingPresence: async usedItem => { configured.push(usedItem); }
  }), false);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(configured, [item]);
});

test('manual Configure replaces a valid Striking Presence choice and reconciles its effects', async () => {
  const registry = hookRegistry();
  const presence = configuredPresence({
    id: 'StrikingPresenceConfigured',
    uuid: 'Actor.Vessel.Item.StrikingPresenceConfigured',
    skill: 'dec'
  });
  const target = reconciliationActor({mantle: true, items: [presence]});
  await reconcileStrikingPresence(target);
  let configured = 0;

  registerVesselAutomationHooks(registry.hooks, {
    configureStrikingPresence: async item => {
      configured += 1;
      await item.setFlag(
        MODULE_ID,
        'vessel.strikingPresence.skill',
        'per'
      );
      return 'per';
    },
    reconcileActor: reconcileStrikingPresence
  });

  assert.equal(
    registry.on.get('dnd5e.preUseActivity')(configurationActivity(presence)),
    false
  );
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(configured, 1);
  assert.deepEqual(strikingEffects(target, 'proficiency')[0].changes, [{
    key: 'system.skills.per.value', mode: 4, value: '1', priority: 20
  }]);
  assert.deepEqual(strikingEffects(target, 'advantage')[0].changes, [{
    key: 'system.skills.per.roll.mode', mode: 2, value: '1', priority: 20
  }]);
});

test('automatic Striking Presence configuration skips an existing valid choice', async () => {
  const registry = hookRegistry();
  const presence = configuredPresence({
    id: 'StrikingPresenceAutomaticConfigured',
    uuid: 'Actor.Vessel.Item.StrikingPresenceAutomaticConfigured',
    skill: 'itm'
  });
  const target = reconciliationActor({items: [presence]});
  let configured = 0;

  registerVesselAutomationHooks(registry.hooks, {
    configureStrikingPresence: async () => { configured += 1; }
  });
  registry.on.get('renderActorSheet')({actor: target});
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(configured, 0);
  assert.equal(getStrikingPresenceSkill(presence), 'itm');
});

test('queues one missing Striking Presence configuration without blocking actor sheet rendering', async () => {
  const registry = hookRegistry();
  const item = aspect({ skill: 'ath' });
  item.id = 'StrikingPresenceB';
  item.identifier = 'striking-presence';
  const actor = {
    id: 'ActorStrikingPresenceA',
    isOwner: true,
    items: new Map([[item.id, item]])
  };
  item.actor = actor;
  let configured = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });

  registerVesselAutomationHooks(registry.hooks, {
    configureStrikingPresence: async usedItem => {
      configured += 1;
      assert.equal(usedItem, item);
      return pending;
    }
  });
  const render = registry.on.get('renderActorSheet');

  assert.equal(render({ actor }), undefined);
  assert.equal(render({ actor }), undefined);
  assert.equal(configured, 0);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(configured, 1);
  release();
  await new Promise(resolve => setImmediate(resolve));
  render({ actor });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(configured, 1);
});

test('attempts every unconfigured Striking Presence copy once after automatic cancellation', async () => {
  const registry = hookRegistry();
  const deception = aspect();
  deception.id = 'StrikingPresenceCancelA';
  deception.identifier = 'striking-presence';
  const persuasion = aspect();
  persuasion.id = 'StrikingPresenceCancelB';
  persuasion.identifier = 'striking-presence';
  const actor = {
    id: 'ActorStrikingPresenceB',
    isOwner: true,
    items: new Map([[deception.id, deception], [persuasion.id, persuasion]])
  };
  deception.actor = actor;
  persuasion.actor = actor;
  const configured = [];

  registerVesselAutomationHooks(registry.hooks, {
    configureStrikingPresence: async item => { configured.push(item.id); }
  });
  const render = registry.on.get('renderActorSheet');

  render({ actor });
  await new Promise(resolve => setImmediate(resolve));
  render({ actor });
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(configured.sort(), [deception.id, persuasion.id]);
});

test('does not retry an automatic Striking Presence prompt after it rejects', async () => {
  const registry = hookRegistry();
  const item = aspect();
  item.id = 'StrikingPresenceReject';
  item.identifier = 'striking-presence';
  const actor = {
    id: 'ActorStrikingPresenceReject',
    isOwner: true,
    items: new Map([[item.id, item]])
  };
  item.actor = actor;
  let configured = 0;
  const previousError = console.error;
  console.error = () => {};

  try {
    registerVesselAutomationHooks(registry.hooks, {
      configureStrikingPresence: async () => {
        configured += 1;
        throw new Error('dismissed dialog');
      }
    });
    const render = registry.on.get('renderActorSheet');

    render({ actor });
    await new Promise(resolve => setImmediate(resolve));
    render({ actor });
    await new Promise(resolve => setImmediate(resolve));
  } finally {
    console.error = previousError;
  }

  assert.equal(configured, 1);
});

test('keeps manual Striking Presence configuration available after an automatic cancellation', async () => {
  const registry = hookRegistry();
  const item = aspect();
  item.id = 'StrikingPresenceManual';
  item.identifier = 'striking-presence';
  const actor = {
    id: 'ActorStrikingPresenceC',
    isOwner: true,
    items: new Map([[item.id, item]])
  };
  item.actor = actor;
  let configured = 0;

  const configure = async () => { configured += 1; };
  registerVesselAutomationHooks(registry.hooks, {
    configureStrikingPresence: configure
  });
  registry.on.get('renderActorSheet')({ actor });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(handlePreUseActivity(configurationActivity(item), {
    configureStrikingPresence: configure
  }), false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(configured, 2);
});

test('ships one role-tagged utility activity for configuring Striking Presence', () => {
  const source = yaml.load(readFileSync(
    new URL('../aspects-src/striking-presence.yml', import.meta.url),
    'utf8'
  ));
  const activities = Object.values(source.system.activities);
  const configure = activities.filter(activity =>
    activity.flags?.[MODULE_ID]?.vessel?.role === 'striking-presence-configure'
  );

  assert.equal(configure.length, 1);
  assert.equal(configure[0].type, 'utility');
  assert.equal(configure[0].name, 'Configure Striking Presence');
});
