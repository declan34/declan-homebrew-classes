import test from 'node:test';
import assert from 'node:assert/strict';

const {
  chooseLeadershipAbility,
  configureLeadershipItems,
  ensureLeadershipAbility
} = await import('../scripts/warlord/leadership.mjs');

const MODULE_ID = 'declan-homebrew-classes';

function activity(id, role, data = {}) {
  return {
    id,
    flags: { [MODULE_ID]: { warlord: { role } } },
    ...data
  };
}

function setPath(target, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let current = target;
  for (const key of keys) current = current[key] ??= {};
  current[last] = value;
}

function itemWithActivities(...activities) {
  const byId = new Map(activities.map(entry => [entry.id, entry]));
  return {
    system: { activities: byId },
    updateCalls: [],
    async update(changes) {
      this.updateCalls.push(changes);
      for (const [path, value] of Object.entries(changes)) {
        const [, , id, ...activityPath] = path.split('.');
        const target = byId.get(id);
        target.update ??= {};
        setPath(target.update, activityPath.join('.'), value);
      }
    }
  };
}

function actor({ items = [], isOwner = true, leadershipAbility } = {}) {
  return {
    isOwner,
    items,
    flags: leadershipAbility === undefined ? {} : {
      [MODULE_ID]: { warlord: { leadershipAbility } }
    },
    setFlagCalls: [],
    async setFlag(scope, key, value) {
      this.setFlagCalls.push({ scope, key, value });
      this.flags[scope] ??= {};
      this.flags[scope].warlord ??= {};
      this.flags[scope].warlord.leadershipAbility = value;
    },
    getFlag(scope, key) {
      return key.split('.').reduce((value, segment) => value?.[segment], this.flags[scope]);
    }
  };
}

test('chooses Mentor as Wisdom, saves it, and configures leadership activities', async () => {
  const saveActivity = activity('save-id', 'leadership-config', {
    save: { dc: { calculation: 'cha' } }
  });
  const rallyActivity = activity('rally-id', 'rallying-cry', {
    roll: { formula: '@abilities.cha.mod' }
  });
  const target = actor({ items: [itemWithActivities(saveActivity, rallyActivity)] });

  assert.equal(await chooseLeadershipAbility(target, {
    prompt: async () => 'mentor'
  }), 'wis');
  assert.equal(target.setFlagCalls[0].value, 'wis');
  assert.equal(saveActivity.update.save.dc.calculation, 'wis');
  assert.equal(rallyActivity.update.roll.formula, '@abilities.wis.mod');
});

test('does not change the actor when the Leadership prompt is cancelled', async () => {
  const target = actor();

  assert.equal(await chooseLeadershipAbility(target, {
    prompt: async () => undefined
  }), undefined);
  assert.equal(target.setFlagCalls.length, 0);
});

test('rejects prompt values outside the three Leadership styles', async () => {
  const target = actor();

  assert.equal(await chooseLeadershipAbility(target, {
    prompt: async () => 'fighter'
  }), undefined);
  assert.equal(target.setFlagCalls.length, 0);
});

test('does not let a non-owner select or save a Leadership ability', async () => {
  const target = actor({ isOwner: false });
  let promptCalls = 0;

  await assert.rejects(
    chooseLeadershipAbility(target, { prompt: async () => { promptCalls += 1; return 'captain'; } }),
    /permission to update this Warlord/
  );
  assert.equal(promptCalls, 0);
  assert.equal(target.setFlagCalls.length, 0);
});

test('shares one pending Leadership prompt for concurrent selections', async () => {
  const target = actor();
  let promptCalls = 0;
  let resolvePrompt;
  const promptResult = new Promise(resolve => { resolvePrompt = resolve; });
  const prompt = async () => {
    promptCalls += 1;
    return promptResult;
  };

  const first = chooseLeadershipAbility(target, { prompt });
  const second = chooseLeadershipAbility(target, { prompt });
  assert.equal(promptCalls, 1);
  resolvePrompt('strategist');

  assert.deepEqual(await Promise.all([first, second]), ['int', 'int']);
  assert.equal(target.setFlagCalls.length, 1);
});

test('uses DialogV2.wait with its class receiver and Leadership-style callback values', async () => {
  const previousFoundry = globalThis.foundry;
  const target = actor();
  const dialog = {
    receiver: undefined,
    buttons: undefined,
    async wait(options) {
      this.receiver = this;
      this.buttons = options.buttons;
      return options.buttons.find(button => button.action === 'captain').callback();
    }
  };
  globalThis.foundry = { applications: { api: { DialogV2: dialog } } };

  try {
    assert.equal(await chooseLeadershipAbility(target), 'cha');
    assert.equal(dialog.receiver, dialog);
    assert.deepEqual(
      dialog.buttons.map(button => button.callback()),
      ['captain', 'mentor', 'strategist']
    );
  } finally {
    globalThis.foundry = previousFoundry;
  }
});

test('returns a stored Leadership ability without prompting again', async () => {
  const target = actor({ leadershipAbility: 'wis' });
  let promptCalls = 0;

  assert.equal(await ensureLeadershipAbility(target, {
    prompt: async () => { promptCalls += 1; return 'captain'; }
  }), 'wis');
  assert.equal(promptCalls, 0);
});

test('updates only module-owned Save and Leadership-roll activity fields', async () => {
  const saveActivity = activity('save-id', 'leadership-config', {
    save: { dc: { calculation: 'cha' } }
  });
  const rallyActivity = activity('rally-id', 'rallying-cry', {
    roll: { formula: '@abilities.cha.mod' }
  });
  const userActivity = { id: 'user-id', save: { dc: { calculation: 'cha' } } };
  const helperSourceFormula = '1d8 + @abilities.cha.mod';
  const helperActivity = activity('helper-id', 'inspiring-word-helper', {
    healing: { custom: { formula: helperSourceFormula } },
    roll: { formula: '@abilities.cha.mod' }
  });
  const item = itemWithActivities(saveActivity, rallyActivity, userActivity, helperActivity);
  const target = actor({ items: [item] });

  assert.equal(await configureLeadershipItems(target, 'int'), true);
  assert.equal(saveActivity.update.save.dc.calculation, 'int');
  assert.equal(rallyActivity.update.roll.formula, '@abilities.int.mod');
  assert.equal(userActivity.update, undefined);
  assert.equal(helperActivity.update, undefined);
  assert.equal(helperActivity.healing.custom.formula, helperSourceFormula);
  assert.deepEqual(item.updateCalls, [{
    'system.activities.save-id.save.dc.calculation': 'int',
    'system.activities.rally-id.roll.formula': '@abilities.int.mod'
  }]);
});

test('does not persist an empty Leadership activity update', async () => {
  const launcher = activity('launcher-id', 'leadership-config');
  const item = itemWithActivities(launcher);

  assert.equal(await configureLeadershipItems(actor({ items: [item] }), 'cha'), false);
  assert.equal(item.updateCalls.length, 0);
});
