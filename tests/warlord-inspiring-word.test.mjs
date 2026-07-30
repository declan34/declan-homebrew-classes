import test from 'node:test';
import assert from 'node:assert/strict';

const {
  chooseHitDie,
  findInspiringWordHelper,
  useInspiringWord
} = await import('../scripts/warlord/inspiring-word.mjs');

const MODULE_ID = 'declan-homebrew-classes';

function warlordActivity(id, role, data = {}) {
  return {
    id,
    flags: { [MODULE_ID]: { warlord: { role } } },
    ...data
  };
}

function helper(hitDie, leadershipAbility, use = async () => {}) {
  const entry = warlordActivity(`${hitDie}-${leadershipAbility}`, 'inspiring-word-helper', {
    flags: {
      [MODULE_ID]: { warlord: { role: 'inspiring-word-helper', hitDie, leadershipAbility } }
    },
    useCalls: 0,
    async use() {
      this.useCalls += 1;
      return use();
    }
  });
  return entry;
}

function fixture({ uses = 1, helpers = [] } = {}) {
  const actor = { items: [] };
  const item = {
    actor,
    system: {
      uses: { value: uses },
      activities: new Map()
    },
    updateCalls: [],
    async update(change) { this.updateCalls.push(change); }
  };
  const launcher = warlordActivity('launcher', 'inspiring-word-launcher', { item, actor });
  item.system.activities.set(launcher.id, launcher);
  for (const entry of helpers) item.system.activities.set(entry.id, entry);
  actor.items.push(item);
  return { actor, item, launcher };
}

function allHelpers() {
  return [6, 8, 10, 12].flatMap(hitDie => (
    ['cha', 'wis', 'int'].map(ability => helper(hitDie, ability))
  ));
}

// A router that selects a wrong flag pair would make every entry in this table fail.
test('routes each Hit Die and Leadership ability pair to its actor-owned Heal helper', async () => {
  const helpers = allHelpers();
  const { launcher } = fixture({ helpers });

  for (const ability of ['cha', 'wis', 'int']) {
    for (const hitDie of [6, 8, 10, 12]) {
      await useInspiringWord(launcher, {
        ensureLeadershipAbility: async () => ability,
        chooseHitDie: async () => hitDie
      });
      assert.equal(helpers.find(entry => (
        entry.flags[MODULE_ID].warlord.hitDie === hitDie
        && entry.flags[MODULE_ID].warlord.leadershipAbility === ability
      )).useCalls, 1);
    }
  }
  assert.equal(launcher.useCalls, undefined);
  assert.equal(launcher.item.system.uses.value, 1);
  assert.equal(launcher.item.updateCalls.length, 0);
});

test('does not use a helper when the Leadership selection is cancelled', async () => {
  const selected = helper(8, 'cha');
  const { launcher } = fixture({ helpers: [selected] });
  let hitDieCalls = 0;

  await useInspiringWord(launcher, {
    ensureLeadershipAbility: async () => undefined,
    chooseHitDie: async () => { hitDieCalls += 1; return 8; }
  });

  assert.equal(hitDieCalls, 0);
  assert.equal(selected.useCalls, 0);
});

test('does not use a helper when the Hit Die selection is cancelled', async () => {
  const selected = helper(8, 'cha');
  const { launcher } = fixture({ helpers: [selected] });

  await useInspiringWord(launcher, {
    ensureLeadershipAbility: async () => 'cha',
    chooseHitDie: async () => undefined
  });

  assert.equal(selected.useCalls, 0);
});

test('shares one pending prompt and helper use between concurrent launcher clicks', async () => {
  const selected = helper(8, 'cha');
  const { launcher } = fixture({ helpers: [selected] });
  let leadershipCalls = 0;
  let hitDieCalls = 0;
  let resolveHitDie;
  const hitDie = new Promise(resolve => { resolveHitDie = resolve; });

  const options = {
    ensureLeadershipAbility: async () => { leadershipCalls += 1; return 'cha'; },
    chooseHitDie: async () => { hitDieCalls += 1; return hitDie; }
  };
  const first = useInspiringWord(launcher, options);
  const second = useInspiringWord(launcher, options);
  await new Promise(resolve => queueMicrotask(resolve));
  assert.equal(leadershipCalls, 1);
  assert.equal(hitDieCalls, 1);
  resolveHitDie(8);

  await Promise.all([first, second]);
  assert.equal(selected.useCalls, 1);
});

test('reports a missing native helper without spending the launcher item', async () => {
  const { launcher, item } = fixture();

  await assert.rejects(useInspiringWord(launcher, {
    ensureLeadershipAbility: async () => 'wis',
    chooseHitDie: async () => 10
  }), /Inspiring Word.*helper/i);

  assert.equal(item.system.uses.value, 1);
  assert.equal(item.updateCalls.length, 0);
});

test('stops before either dialog when no Inspiring Word uses remain', async () => {
  const selected = helper(6, 'cha');
  const { launcher } = fixture({ uses: 0, helpers: [selected] });
  let leadershipCalls = 0;
  let hitDieCalls = 0;

  await useInspiringWord(launcher, {
    ensureLeadershipAbility: async () => { leadershipCalls += 1; return 'cha'; },
    chooseHitDie: async () => { hitDieCalls += 1; return 6; }
  });

  assert.equal(leadershipCalls, 0);
  assert.equal(hitDieCalls, 0);
  assert.equal(selected.useCalls, 0);
});

test('surfaces a native helper error without retrying it', async () => {
  const failure = new Error('target rejected healing');
  const selected = helper(12, 'int', async () => { throw failure; });
  const { launcher } = fixture({ helpers: [selected] });

  await assert.rejects(useInspiringWord(launcher, {
    ensureLeadershipAbility: async () => 'int',
    chooseHitDie: async () => 12
  }), failure);

  assert.equal(selected.useCalls, 1);
});

test('finds only the helper matching both immutable router flags', () => {
  const selected = helper(10, 'wis');
  const wrongDie = helper(8, 'wis');
  const wrongAbility = helper(10, 'cha');
  const { item } = fixture({ helpers: [selected, wrongDie, wrongAbility] });

  assert.equal(findInspiringWordHelper(item, 10, 'wis'), selected);
  assert.equal(findInspiringWordHelper(item, 12, 'wis'), undefined);
});

test('uses DialogV2.wait with its class receiver and numeric Hit Die callback values', async () => {
  const previousFoundry = globalThis.foundry;
  const dialog = {
    receiver: undefined,
    buttons: undefined,
    async wait(options) {
      this.receiver = this;
      this.buttons = options.buttons;
      return options.buttons.find(button => button.action === 'd10').callback();
    }
  };
  globalThis.foundry = { applications: { api: { DialogV2: dialog } } };

  try {
    assert.equal(await chooseHitDie(), 10);
    assert.equal(dialog.receiver, dialog);
    assert.deepEqual(dialog.buttons.map(button => button.callback()), [6, 8, 10, 12]);
  } finally {
    globalThis.foundry = previousFoundry;
  }
});
