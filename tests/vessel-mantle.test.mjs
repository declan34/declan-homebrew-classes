import test from 'node:test';
import assert from 'node:assert/strict';

const {
  activateSpiritMantle,
  deactivateSpiritMantle,
  isSpiritMantleActive,
  reconcileSpiritMantle,
  toggleSpiritMantle
} = await import('../scripts/vessel/mantle.mjs');

const MODULE_ID = 'declan-homebrew-classes';

function effect(data) {
  return {
    ...structuredClone(data),
    getFlag(scope, key) {
      if (scope !== MODULE_ID || key !== 'vessel.role') return undefined;
      return this.flags?.[scope]?.vessel?.role;
    },
    toObject() {
      const { getFlag, toObject, ...data } = this;
      return structuredClone(data);
    }
  };
}

function sourceItem({ effects, extraChanges = [] } = {}) {
  return {
    uuid: 'Actor.actor00000000001.Item.hbrvespnPw2Da1c3',
    effects: effects ?? [effect({
      _id: '9VejV6Hl6RdY5Gzt',
      _key: '!items.effects!hbrvespnPw2Da1c3.9VejV6Hl6RdY5Gzt',
      disabled: true,
      transfer: false,
      changes: [
        ...structuredClone(extraChanges),
        {
          key: 'system.attributes.ac.min',
          mode: 4,
          value: '10 + @abilities.con.mod + @abilities.cha.mod',
          priority: 20
        }
      ],
      flags: {
        [MODULE_ID]: { vessel: { role: 'mantle-ac' } }
      }
    })]
  };
}

function actor({
  ac = { calc: 'default' },
  armor = [],
  createError,
  createGate,
  deleteError,
  updateError
} = {}) {
  let next = 0;
  return {
    isOwner: true,
    flags: {},
    effects: [],
    itemTypes: { equipment: armor },
    operations: [],
    system: {
      attributes: {
        ac: structuredClone(ac)
      }
    },
    getFlag(scope, key) {
      if (scope !== MODULE_ID || key !== 'vessel.mantle.active') return undefined;
      return this.flags?.[scope]?.vessel?.mantle?.active;
    },
    async setFlag(scope, key, value) {
      this.operations.push(['setFlag', scope, key, value]);
      this.flags[scope] ??= {};
      this.flags[scope].vessel ??= {};
      this.flags[scope].vessel.mantle ??= {};
      this.flags[scope].vessel.mantle.active = value;
    },
    async unsetFlag(scope, key) {
      this.operations.push(['unsetFlag', scope, key]);
      if (scope === MODULE_ID && key === 'vessel.mantle.active') {
        delete this.flags?.[scope]?.vessel?.mantle?.active;
      }
    },
    async createEmbeddedDocuments(type, rows) {
      assert.equal(type, 'ActiveEffect');
      this.operations.push(['createEmbeddedDocuments', type, structuredClone(rows)]);
      if (createError) throw createError;
      if (createGate) await createGate;
      const created = rows.map(row => effect({
        ...structuredClone(row),
        _id: `createdEffect00${++next}`
      }));
      this.effects.push(...created);
      return created;
    },
    async updateEmbeddedDocuments(type, rows) {
      assert.equal(type, 'ActiveEffect');
      this.operations.push(['updateEmbeddedDocuments', type, structuredClone(rows)]);
      if (updateError) throw updateError;
      for (const row of rows) {
        const current = this.effects.find(candidate => candidate._id === row._id);
        Object.assign(current, row);
      }
    },
    async deleteEmbeddedDocuments(type, ids) {
      assert.equal(type, 'ActiveEffect');
      this.operations.push(['deleteEmbeddedDocuments', type, structuredClone(ids)]);
      if (deleteError) throw deleteError;
      this.effects = this.effects.filter(candidate => !ids.includes(candidate._id));
    }
  };
}

function mantleEffects(target) {
  return target.effects.filter(candidate =>
    candidate.flags?.[MODULE_ID]?.vessel?.role === 'mantle-ac'
  );
}

test('activation stores state and enables exactly one eligible AC effect', async () => {
  const target = actor();
  const item = sourceItem();
  await activateSpiritMantle(target, { sourceItem: item });
  assert.equal(isSpiritMantleActive(target), true);
  assert.equal(mantleEffects(target).length, 1);
  assert.equal(mantleEffects(target)[0].disabled, false);
  assert.equal(mantleEffects(target)[0].origin, item.uuid);
  assert.notEqual(mantleEffects(target)[0]._id, '9VejV6Hl6RdY5Gzt');
  assert.equal(mantleEffects(target)[0]._key, undefined);

  await activateSpiritMantle(target, { sourceItem: sourceItem() });
  assert.equal(mantleEffects(target).length, 1);
});

test('concurrent activation creates exactly one Mantle effect', async () => {
  let releaseCreate;
  const createGate = new Promise(resolve => {
    releaseCreate = resolve;
  });
  const target = actor({ createGate });
  const item = sourceItem();

  const activations = Promise.all([
    activateSpiritMantle(target, { sourceItem: item }),
    activateSpiritMantle(target, { sourceItem: item })
  ]);
  await new Promise(resolve => setImmediate(resolve));
  releaseCreate();
  await activations;

  assert.equal(isSpiritMantleActive(target), true);
  assert.equal(mantleEffects(target).length, 1);
});

test('activation keeps the effect disabled while armor is equipped', async () => {
  const target = actor({
    armor: [{
      system: { equipped: true, type: { value: 'light' } }
    }]
  });
  await activateSpiritMantle(target, { sourceItem: sourceItem() });
  assert.equal(isSpiritMantleActive(target), true);
  assert.equal(mantleEffects(target)[0].disabled, true);
});

test('reconciliation follows equipment without changing Mantle state', async () => {
  const target = actor();
  const item = sourceItem();
  await activateSpiritMantle(target, { sourceItem: item });
  target.itemTypes.equipment.push({
    system: { equipped: true, type: { value: 'shield' } }
  });
  await reconcileSpiritMantle(target, { sourceItem: item });
  assert.equal(isSpiritMantleActive(target), true);
  assert.equal(mantleEffects(target)[0].disabled, true);

  target.itemTypes.equipment = [];
  await reconcileSpiritMantle(target, { sourceItem: item });
  assert.equal(isSpiritMantleActive(target), true);
  assert.equal(mantleEffects(target)[0].disabled, false);
});

test('reconciliation removes duplicate Mantle effects and normalizes the survivor', async () => {
  const target = actor();
  await target.setFlag(MODULE_ID, 'vessel.mantle.active', true);
  target.effects.push(
    effect({
      _id: 'mantleDplct00001',
      disabled: true,
      flags: { [MODULE_ID]: { vessel: { role: 'mantle-ac' } } }
    }),
    effect({
      _id: 'mantleDplct00002',
      disabled: false,
      flags: { [MODULE_ID]: { vessel: { role: 'mantle-ac' } } }
    })
  );

  await reconcileSpiritMantle(target, { sourceItem: sourceItem() });

  assert.equal(mantleEffects(target).length, 1);
  assert.equal(mantleEffects(target)[0]._id, 'mantleDplct00001');
  assert.equal(mantleEffects(target)[0].disabled, false);
});

test('active reconciliation repairs a legacy AC override on the actor effect', async () => {
  const target = actor({ ac: { calc: 'mage' } });
  await target.setFlag(MODULE_ID, 'vessel.mantle.active', true);
  target.effects.push(effect({
    _id: 'legacyMantle0001',
    disabled: false,
    transfer: false,
    changes: [{
      key: 'system.attributes.ac.calc',
      mode: 5,
      value: 'vesselMantle',
      priority: 20
    }, {
      key: 'system.attributes.ac.bonus',
      mode: 2,
      value: '1',
      priority: 30
    }],
    flags: { [MODULE_ID]: { vessel: { role: 'mantle-ac' } } }
  }));

  await reconcileSpiritMantle(target, {
    sourceItem: sourceItem({
      extraChanges: [{
        key: 'system.attributes.ac.bonus',
        mode: 2,
        value: '1',
        priority: 30
      }]
    })
  });

  assert.deepEqual(mantleEffects(target)[0].changes, [
    {
      key: 'system.attributes.ac.bonus',
      mode: 2,
      value: '1',
      priority: 30
    },
    {
      key: 'system.attributes.ac.min',
      mode: 4,
      value: '10 + @abilities.con.mod + @abilities.cha.mod',
      priority: 20
    }
  ]);
  assert.deepEqual(target.system.attributes.ac, { calc: 'mage' });
});

test('active Archon state adds its profile bonus only to Mantle minimum AC', async () => {
  const target = actor({ ac: { calc: 'natural', flat: 20 } });
  target.flags[MODULE_ID] = {
    vessel: {
      archon: {
        state: {
          active: true,
          acBonus: 2
        }
      }
    }
  };

  await activateSpiritMantle(target, { sourceItem: sourceItem() });

  assert.deepEqual(target.system.attributes.ac, { calc: 'natural', flat: 20 });
  assert.deepEqual(mantleEffects(target)[0].changes, [{
    key: 'system.attributes.ac.min',
    mode: 4,
    value: '10 + @abilities.con.mod + @abilities.cha.mod + 2',
    priority: 20
  }]);
});

test('armored reconciliation disables duplicates before failed deletion', async () => {
  const target = actor({
    armor: [{
      system: { equipped: true, type: { value: 'light' } }
    }],
    deleteError: new Error('delete failed')
  });
  await target.setFlag(MODULE_ID, 'vessel.mantle.active', true);
  target.effects.push(
    effect({
      _id: 'mantleDplct00001',
      disabled: true,
      flags: { [MODULE_ID]: { vessel: { role: 'mantle-ac' } } }
    }),
    effect({
      _id: 'mantleDplct00002',
      disabled: false,
      flags: { [MODULE_ID]: { vessel: { role: 'mantle-ac' } } }
    })
  );

  await assert.rejects(
    reconcileSpiritMantle(target, { sourceItem: sourceItem() }),
    /delete failed/
  );

  assert.equal(isSpiritMantleActive(target), true);
  assert.equal(mantleEffects(target).length, 2);
  assert.equal(mantleEffects(target).every(candidate => candidate.disabled), true);
});

test('deactivation clears state and removes only module Mantle effects', async () => {
  const target = actor();
  target.effects.push(effect({
    _id: 'unrelated0000000',
    disabled: false,
    flags: {}
  }));
  await activateSpiritMantle(target, { sourceItem: sourceItem() });
  await deactivateSpiritMantle(target);
  assert.equal(isSpiritMantleActive(target), false);
  assert.equal(mantleEffects(target).length, 0);
  assert.equal(target.effects.length, 1);
  assert.equal(target.effects[0]._id, 'unrelated0000000');
});

test('deactivation disables an active effect before clearing state and deleting it', async () => {
  const target = actor();
  await activateSpiritMantle(target, { sourceItem: sourceItem() });
  target.operations.length = 0;

  await deactivateSpiritMantle(target);

  assert.deepEqual(
    target.operations.map(operation => operation[0]),
    ['updateEmbeddedDocuments', 'unsetFlag', 'deleteEmbeddedDocuments']
  );
  assert.deepEqual(target.operations[0][2], [{
    _id: 'createdEffect001',
    disabled: true
  }]);
});

test('failed activation rolls back newly stored state', async () => {
  const target = actor({ createError: new Error('create failed') });

  await assert.rejects(
    activateSpiritMantle(target, { sourceItem: sourceItem() }),
    /create failed/
  );

  assert.equal(isSpiritMantleActive(target), false);
  assert.equal(mantleEffects(target).length, 0);
});

test('failed reconciliation preserves state that was active before activation', async () => {
  const target = actor();
  await target.setFlag(MODULE_ID, 'vessel.mantle.active', true);

  await assert.rejects(
    activateSpiritMantle(target, { sourceItem: sourceItem({ effects: [] }) }),
    /missing its Ethereal Armor effect/
  );

  assert.equal(isSpiritMantleActive(target), true);
});

test('failed activation keeps state active when a stale effect cannot be disabled', async () => {
  const target = actor({
    armor: [{
      system: { equipped: true, type: { value: 'light' } }
    }],
    updateError: new Error('update failed')
  });
  target.effects.push(effect({
    _id: 'staleMantle00001',
    disabled: false,
    flags: { [MODULE_ID]: { vessel: { role: 'mantle-ac' } } }
  }));

  await assert.rejects(
    activateSpiritMantle(target, { sourceItem: sourceItem() }),
    /update failed/
  );

  assert.equal(isSpiritMantleActive(target), true);
  assert.equal(mantleEffects(target)[0].disabled, false);
});

test('inactive reconciliation restores active state when a stale effect cannot be disabled', async () => {
  const target = actor({ updateError: new Error('update failed') });
  target.effects.push(effect({
    _id: 'staleMantle00001',
    disabled: false,
    flags: { [MODULE_ID]: { vessel: { role: 'mantle-ac' } } }
  }));

  await assert.rejects(reconcileSpiritMantle(target), /update failed/);

  assert.equal(isSpiritMantleActive(target), true);
  assert.equal(mantleEffects(target)[0].disabled, false);
});

test('inactive reconciliation deletes an already-disabled stale Mantle effect', async () => {
  const target = actor();
  target.effects.push(effect({
    _id: 'staleMantle00001',
    disabled: true,
    flags: { [MODULE_ID]: { vessel: { role: 'mantle-ac' } } }
  }));

  await reconcileSpiritMantle(target);

  assert.equal(isSpiritMantleActive(target), false);
  assert.equal(mantleEffects(target).length, 0);
});

test('failed inactive cleanup leaves an undeleted stale Mantle effect disabled', async () => {
  const target = actor({ deleteError: new Error('delete failed') });
  target.effects.push(effect({
    _id: 'staleMantle00001',
    disabled: false,
    flags: { [MODULE_ID]: { vessel: { role: 'mantle-ac' } } }
  }));

  await assert.rejects(reconcileSpiritMantle(target), /delete failed/);

  assert.equal(isSpiritMantleActive(target), false);
  assert.equal(mantleEffects(target).length, 1);
  assert.equal(mantleEffects(target)[0].disabled, true);
});

test('Mantle lifecycle preserves alternate unarmored and custom AC calculations', async () => {
  const calculations = [
    { calc: 'unarmoredMonk' },
    { calc: 'unarmoredBarb' },
    { calc: 'mage' },
    { calc: 'custom', formula: '17 + @abilities.dex.mod' },
    { calc: 'natural', flat: 21 }
  ];

  for (const ac of calculations) {
    const target = actor({ ac });
    await activateSpiritMantle(target, { sourceItem: sourceItem() });
    assert.deepEqual(target.system.attributes.ac, ac);

    await deactivateSpiritMantle(target);
    assert.deepEqual(target.system.attributes.ac, ac);
  }
});

test('failed deactivation leaves an undeleted Mantle effect disabled', async () => {
  const target = actor({ deleteError: new Error('delete failed') });
  await activateSpiritMantle(target, { sourceItem: sourceItem() });

  await assert.rejects(deactivateSpiritMantle(target), /delete failed/);

  assert.equal(isSpiritMantleActive(target), false);
  assert.equal(mantleEffects(target).length, 1);
  assert.equal(mantleEffects(target)[0].disabled, true);
});

test('toggle reports the new active state', async () => {
  const target = actor();
  const item = sourceItem();
  assert.equal(await toggleSpiritMantle(target, { sourceItem: item }), true);
  assert.equal(await toggleSpiritMantle(target, { sourceItem: item }), false);
});

test('non-owners cannot mutate Mantle state', async () => {
  const target = actor();
  target.isOwner = false;
  await assert.rejects(
    activateSpiritMantle(target, { sourceItem: sourceItem() }),
    /permission/i
  );
});
