import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(
  new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url)
);
const yaml = require('js-yaml');

const { configureStrikingPresence, getStrikingPresenceSkill } = await import(
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
  const actor = { isOwner: item.isOwner, items: new Map([[item.id, item]]) };
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

test('queues one missing Striking Presence configuration without blocking actor sheet rendering', async () => {
  const registry = hookRegistry();
  const item = aspect({ skill: 'ath' });
  item.id = 'StrikingPresenceB';
  item.identifier = 'striking-presence';
  const actor = { isOwner: true, items: new Map([[item.id, item]]) };
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
