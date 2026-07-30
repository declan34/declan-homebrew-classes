import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extendArchonForm,
  finalizeArchonTransformation,
  getArchonState,
  isArchonFormActive,
  prepareArchonTransformData,
  reconcileArchonForm,
  revertArchonForm
} from '../scripts/vessel/archon-lifecycle.mjs';
import { activateSpiritMantle } from '../scripts/vessel/mantle.mjs';
import { serializeActorOperation } from '../scripts/vessel/operations.mjs';

const MODULE_ID = 'declan-homebrew-classes';

function effect(data) {
  return {
    ...structuredClone(data),
    toObject() {
      const { toObject, ...source } = this;
      return structuredClone(source);
    }
  };
}

function spiritMantleItem() {
  return {
    id: 'owned-spirit-mantle',
    uuid: 'Actor.formactor0000001.Item.owned-spirit-mantle',
    type: 'feat',
    system: { identifier: 'spirit-mantle' },
    effects: [effect({
      _id: 'mantle-template',
      transfer: false,
      disabled: true,
      changes: [{
        key: 'system.attributes.ac.min',
        mode: 4,
        value: '10 + @abilities.con.mod + @abilities.cha.mod',
        priority: 20
      }],
      flags: {
        [MODULE_ID]: { vessel: { role: 'mantle-ac' } }
      }
    })]
  };
}

function mockActor({
  id = 'formactor0000001',
  level = 6,
  languages = new Set(['common']),
  customLanguages = '',
  temp = 0,
  owner = true,
  state,
  effects = [],
  items,
  isToken = false
} = {}) {
  let nextEffect = 0;
  const target = {
    id,
    uuid: isToken ? `Scene.scene0000000001.Token.${id}` : `Actor.${id}`,
    documentName: 'Actor',
    type: 'character',
    isOwner: owner,
    isToken,
    flags: state ? {
      [MODULE_ID]: { vessel: { archon: { state: structuredClone(state) } } }
    } : {},
    effects: effects.map(effect),
    items: items ?? [],
    itemTypes: { equipment: [] },
    classes: {
      vessel: { system: { levels: level } }
    },
    system: {
      traits: {
        languages: {
          value: new Set(languages),
          custom: customLanguages
        }
      },
      attributes: {
        ac: { calc: 'default' },
        hp: { value: 20, max: 20, temp }
      }
    },
    operations: [],
    getFlag(scope, key) {
      if (scope !== MODULE_ID) return undefined;
      return key.split('.').reduce(
        (value, segment) => value?.[segment],
        this.flags?.[scope]
      );
    },
    async setFlag(scope, key, value) {
      this.operations.push(['setFlag', key, structuredClone(value)]);
      this.flags[scope] ??= {};
      const path = key.split('.');
      let current = this.flags[scope];
      for (const segment of path.slice(0, -1)) current = current[segment] ??= {};
      current[path.at(-1)] = structuredClone(value);
    },
    async unsetFlag(scope, key) {
      this.operations.push(['unsetFlag', key]);
      const path = key.split('.');
      let current = this.flags?.[scope];
      for (const segment of path.slice(0, -1)) current = current?.[segment];
      if (current) delete current[path.at(-1)];
    },
    async update(changes) {
      this.operations.push(['update', structuredClone(changes)]);
      if (Object.hasOwn(changes, 'system.attributes.hp.temp')) {
        this.system.attributes.hp.temp = changes['system.attributes.hp.temp'];
      }
    },
    async createEmbeddedDocuments(type, rows) {
      assert.equal(type, 'ActiveEffect');
      this.operations.push(['createEmbeddedDocuments', structuredClone(rows)]);
      const created = rows.map(row => effect({
        ...structuredClone(row),
        _id: `created-effect-${++nextEffect}`
      }));
      this.effects.push(...created);
      return created;
    },
    async updateEmbeddedDocuments(type, rows) {
      assert.equal(type, 'ActiveEffect');
      this.operations.push(['updateEmbeddedDocuments', structuredClone(rows)]);
      for (const row of rows) {
        Object.assign(
          this.effects.find(candidate => candidate._id === row._id),
          structuredClone(row)
        );
      }
    },
    async deleteEmbeddedDocuments(type, ids) {
      assert.equal(type, 'ActiveEffect');
      this.operations.push(['deleteEmbeddedDocuments', structuredClone(ids)]);
      this.effects = this.effects.filter(candidate => !ids.includes(candidate._id));
    }
  };
  if (!target.items.length) target.items.push(spiritMantleItem());
  return target;
}

function profile({
  profile = 'cursed',
  uuid = 'Compendium.declan-homebrew-classes.vessel-archon-forms.Actor.hbrCurArchon0001',
  languages = new Set(['abyssal']),
  customLanguages = '',
  acBonus = 1
} = {}) {
  return {
    uuid,
    documentName: 'Actor',
    type: 'npc',
    system: {
      traits: {
        languages: {
          value: new Set(languages),
          custom: customLanguages
        }
      }
    },
    flags: {
      [MODULE_ID]: {
        vessel: { archon: { profile, subclass: 'the-cursed', acBonus } }
      }
    }
  };
}

function transformedSource() {
  return {
    flags: {},
    system: {
      traits: {
        languages: {
          value: new Set(['abyssal']),
          custom: 'Deep Speech'
        }
      },
      attributes: { hp: { temp: 0 } }
    }
  };
}

function mantleEffect(actor) {
  return actor.effects.find(candidate =>
    candidate.flags?.[MODULE_ID]?.vessel?.role === 'mantle-ac'
  );
}

test('transform preparation stamps lifecycle state and unions languages', () => {
  const original = mockActor({
    level: 6,
    languages: new Set(['common', 'celestial']),
    customLanguages: 'Trade Cant',
    temp: 7
  });
  const source = transformedSource();
  const selected = profile({ customLanguages: 'Primordial; Deep Speech' });

  const state = prepareArchonTransformData(original, selected, source, {
    now: 100,
    payment: 'free'
  });

  assert.deepEqual(state, {
    active: true,
    startedAt: 100,
    expiresAt: 700,
    profile: 'cursed',
    profileUuid: selected.uuid,
    sourceActorUuid: original.uuid,
    payment: 'free',
    acBonus: 1,
    tempHPBeforeTransform: 7
  });
  assert.deepEqual(
    [...source.system.traits.languages.value].sort(),
    ['abyssal', 'celestial', 'common']
  );
  assert.equal(
    source.system.traits.languages.custom,
    'Deep Speech; Primordial; Trade Cant'
  );
  assert.deepEqual(
    source.flags[MODULE_ID].vessel.archon.state,
    state
  );
});

test('controlled transformation receives a one-hour expiry', () => {
  const original = mockActor({ level: 7 });
  const source = transformedSource();
  const state = prepareArchonTransformData(original, profile(), source, {
    now: 250,
    payment: 'slot'
  });
  assert.equal(state.expiresAt, 3850);
});

test('finalization activates Mantle, applies profile AC, and raises temp HP to its floor', async () => {
  const pending = {
    active: true,
    startedAt: 100,
    expiresAt: 700,
    profile: 'cursed',
    profileUuid: profile().uuid,
    sourceActorUuid: 'Actor.original0000001',
    payment: 'free',
    acBonus: 1,
    tempHPBeforeTransform: 0
  };
  const form = mockActor({ level: 6, temp: 3, state: pending });

  const result = await finalizeArchonTransformation(form);

  assert.equal(result.handled, true);
  assert.equal(isArchonFormActive(form), true);
  assert.deepEqual(getArchonState(form), pending);
  assert.equal(form.system.attributes.hp.temp, 12);
  assert.equal(
    mantleEffect(form).changes.find(change =>
      change.key === 'system.attributes.ac.min'
    ).value,
    '10 + @abilities.con.mod + @abilities.cha.mod + 1'
  );
  assert.deepEqual(form.system.attributes.ac, { calc: 'default' });
});

test('finalization never lowers higher unrelated temp HP and supports +0/+1/+2 AC', async () => {
  for (const [acBonus, expected] of [
    [0, '10 + @abilities.con.mod + @abilities.cha.mod'],
    [1, '10 + @abilities.con.mod + @abilities.cha.mod + 1'],
    [2, '10 + @abilities.con.mod + @abilities.cha.mod + 2']
  ]) {
    const state = {
      active: true,
      startedAt: 10,
      expiresAt: 610,
      profile: 'test',
      profileUuid: `Actor.profile-${acBonus}`,
      sourceActorUuid: 'Actor.original0000001',
      payment: 'slot',
      acBonus,
      tempHPBeforeTransform: 0
    };
    const form = mockActor({ level: 4, temp: 30, state });
    await finalizeArchonTransformation(form);
    assert.equal(form.system.attributes.hp.temp, 30);
    assert.equal(
      mantleEffect(form).changes.find(change =>
        change.key === 'system.attributes.ac.min'
      ).value,
      expected
    );
  }
});

test('extension adds exactly 600 seconds and requires an active form', async () => {
  const form = mockActor({
    state: {
      active: true,
      startedAt: 100,
      expiresAt: 700,
      profile: 'fallen',
      profileUuid: 'Actor.profile',
      sourceActorUuid: 'Actor.original',
      payment: 'slot',
      acBonus: 2,
      tempHPBeforeTransform: 0
    }
  });

  const extended = await extendArchonForm(form);
  assert.equal(extended.expiresAt, 1300);
  assert.equal(getArchonState(form).expiresAt, 1300);

  const inactive = mockActor();
  await assert.rejects(extendArchonForm(inactive), /not active/i);
});

test('native reversion cleans only module form state/effects and preserves unrelated effects', async () => {
  const state = {
    active: true,
    startedAt: 100,
    expiresAt: 700,
    profile: 'formless',
    profileUuid: 'Actor.profile',
    sourceActorUuid: 'Actor.original',
    payment: 'free',
    acBonus: 1,
    tempHPBeforeTransform: 4
  };
  const restored = mockActor({
    id: 'original',
    temp: 12,
    state,
    effects: [{
      _id: 'module-form-only',
      flags: { [MODULE_ID]: { vessel: { role: 'archon-form-effect' } } }
    }, {
      _id: 'unrelated',
      flags: { other: { role: 'keep-me' } }
    }]
  });
  const transformed = mockActor({ state });
  transformed.revertOriginalForm = async () => restored;

  const result = await revertArchonForm(transformed);

  assert.equal(result, restored);
  assert.equal(isArchonFormActive(restored), false);
  assert.equal(restored.system.attributes.hp.temp, 4);
  assert.deepEqual(restored.effects.map(candidate => candidate._id), ['unrelated']);
});

test('failed native reversion leaves lifecycle state and module effects untouched', async () => {
  const state = {
    active: true,
    startedAt: 100,
    expiresAt: 700,
    profile: 'ascended',
    profileUuid: 'Actor.profile',
    sourceActorUuid: 'Actor.original',
    payment: 'free',
    acBonus: 0,
    tempHPBeforeTransform: 0
  };
  const transformed = mockActor({
    state,
    effects: [{
      _id: 'module-form-only',
      flags: { [MODULE_ID]: { vessel: { role: 'archon-form-effect' } } }
    }]
  });
  transformed.revertOriginalForm = async () => {
    throw new Error('native revert failed');
  };

  await assert.rejects(revertArchonForm(transformed), /native revert failed/);
  assert.equal(isArchonFormActive(transformed), true);
  assert.equal(transformed.effects.length, 1);
});

test('failed restored temp-HP cleanup records a retryable cleanup phase', async () => {
  const state = {
    active: true,
    startedAt: 100,
    expiresAt: 700,
    profile: 'cursed',
    profileUuid: 'Actor.profile',
    sourceActorUuid: 'Actor.original',
    payment: 'free',
    acBonus: 1,
    tempHPBeforeTransform: 2
  };
  const restored = mockActor({ state, temp: 12 });
  const originalUpdate = restored.update.bind(restored);
  restored.update = async () => {
    throw new Error('temp update failed');
  };
  const transformed = mockActor({ state });
  transformed.revertOriginalForm = async () => restored;

  await assert.rejects(revertArchonForm(transformed), /temp update failed/);
  assert.equal(isArchonFormActive(restored), false);
  assert.equal(getArchonState(restored).cleanupPending, true);

  restored.update = originalUpdate;
  const retry = await reconcileArchonForm(restored);
  assert.equal(retry.cleaned, true);
  assert.equal(getArchonState(restored), undefined);
  assert.equal(restored.system.attributes.hp.temp, 2);
});

test('post-reversion cleanup joins the restored Actor operation queue', async () => {
  const state = {
    active: true,
    startedAt: 100,
    expiresAt: 700,
    profile: 'fallen',
    profileUuid: 'Actor.profile',
    sourceActorUuid: 'Actor.original',
    payment: 'free',
    acBonus: 2,
    tempHPBeforeTransform: 0
  };
  const restored = mockActor({ id: 'original', state, temp: 12 });
  const transformed = mockActor({ state });
  transformed.revertOriginalForm = async () => restored;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const holding = serializeActorOperation(restored, () => gate);

  const reverting = revertArchonForm(transformed);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(restored.operations.length, 0);

  release();
  await Promise.all([holding, reverting]);
  assert.equal(getArchonState(restored), undefined);
  assert.equal(restored.system.attributes.hp.temp, 0);
});

test('reconciliation accepts token and synthetic actor shapes and is idempotent', async () => {
  const state = {
    active: true,
    startedAt: 100,
    expiresAt: 700,
    profile: 'earth',
    profileUuid: 'Actor.profile',
    sourceActorUuid: 'Actor.original',
    payment: 'slot',
    acBonus: 2,
    tempHPBeforeTransform: 0
  };
  const synthetic = mockActor({ isToken: true, level: 5, temp: 0, state });
  const token = { documentName: 'Token', actor: synthetic };

  await reconcileArchonForm(token);
  await reconcileArchonForm(token);

  assert.equal(synthetic.system.attributes.hp.temp, 10);
  assert.equal(synthetic.effects.filter(candidate =>
    candidate.flags?.[MODULE_ID]?.vessel?.role === 'mantle-ac'
  ).length, 1);
});

test('lifecycle and Mantle operations share one actor serializer', async () => {
  const state = {
    active: true,
    startedAt: 100,
    expiresAt: 700,
    profile: 'ascended',
    profileUuid: 'Actor.profile',
    sourceActorUuid: 'Actor.original',
    payment: 'free',
    acBonus: 0,
    tempHPBeforeTransform: 0
  };
  const form = mockActor({ state });
  let release;
  const gate = new Promise(resolve => {
    release = resolve;
  });
  const originalSetFlag = form.setFlag.bind(form);
  let first = true;
  form.setFlag = async (...args) => {
    if (first) {
      first = false;
      await gate;
    }
    return originalSetFlag(...args);
  };

  const extending = extendArchonForm(form);
  const activating = activateSpiritMantle(form, {
    sourceItem: spiritMantleItem()
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(form.operations.length, 0);
  release();
  await Promise.all([extending, activating]);

  assert.equal(getArchonState(form).expiresAt, 1300);
  assert.equal(mantleEffect(form) !== undefined, true);
});

test('non-owner reconciliation fails safely without mutations', async () => {
  const actor = mockActor({
    owner: false,
    state: {
      active: true,
      startedAt: 0,
      expiresAt: 600,
      profile: 'test',
      profileUuid: 'Actor.profile',
      sourceActorUuid: 'Actor.original',
      payment: 'free',
      acBonus: 0,
      tempHPBeforeTransform: 0
    }
  });
  await assert.rejects(reconcileArchonForm(actor), /permission/i);
  assert.deepEqual(actor.operations, []);
});
