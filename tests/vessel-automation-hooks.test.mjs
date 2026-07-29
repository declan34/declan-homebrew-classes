import test from 'node:test';
import assert from 'node:assert/strict';

const {
  handlePostUseActivity,
  handlePreUseActivity,
  prepareIridescentStrike,
  registerVesselAutomationHooks
} = await import('../scripts/vessel/hooks.mjs');

const MODULE_ID = 'declan-homebrew-classes';

function role(name) {
  return { [MODULE_ID]: { vessel: { role: name } } };
}

function activity(name, actor) {
  const sourceActivity = {
    id: 'gDrrUixnPXPLBDHB',
    useCalls: 0,
    async use() { this.useCalls += 1; }
  };
  const sourceItem = {
    id: 'spiritMantle001',
    identifier: 'spirit-mantle',
    actor,
    effects: [],
    system: { activities: new Map([[sourceActivity.id, sourceActivity]]) }
  };
  const existing = Array.from(actor.items?.values?.() ?? actor.items ?? []);
  actor.items = new Map(
    existing.map((item, index) => [item.id ?? `feature${index}`, item])
  );
  actor.items.set(sourceItem.id, sourceItem);
  return {
    id: sourceActivity.id,
    flags: role(name),
    item: { id: sourceItem.id, actor },
    damage: {
      parts: [{
        toObject() {
          return {
            custom: { enabled: true, formula: '@scale.vessel.iridescent-strike + @mod' },
            types: ['radiant']
          };
        }
      }]
    },
    updateSource(update) {
      this.updated = update;
    },
    sourceItem,
    sourceActivity
  };
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
      if (scope === MODULE_ID && key === 'vessel.mantle.active') return active;
      return undefined;
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

test('an active Strike proceeds through dnd5e', () => {
  const target = actor({ active: true });
  const strike = activity('iridescent-strike', target);
  assert.equal(handlePreUseActivity(strike), undefined);
  assert.ok(strike.updated);
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
