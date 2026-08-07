import test from 'node:test';
import assert from 'node:assert/strict';

const {
  reconcileStage3Effects
} = await import('../scripts/vessel/stage3-effects.mjs');

const moduleId = 'declan-homebrew-classes';

function template(source, binding) {
  return {
    _id: `${source}Template`,
    disabled: true,
    transfer: false,
    changes: [{key: `test.${source}`, mode: 2, value: '1', priority: 20}],
    flags: {
      [moduleId]: {
        vessel: {stage3Binding: binding, stage3Source: source}
      }
    },
    toObject() {
      const {_id, toObject, ...data} = this;
      return structuredClone({_id, ...data});
    }
  };
}

function item(identifier, binding) {
  return {
    id: identifier,
    uuid: `Actor.test.Item.${identifier}`,
    system: {identifier},
    effects: [template(identifier, binding)]
  };
}

function direStatureItem() {
  return {
    id: 'dire-stature',
    uuid: 'Actor.test.Item.dire-stature',
    system: {identifier: 'dire-stature'},
    effects: [{
      _id: 'direStatureTemplate',
      disabled: true,
      transfer: false,
      changes: [{
        key: 'system.attributes.ac.bonus', mode: 2, value: '1', priority: 20
      }, {
        key: 'system.bonuses.mwak.damage', mode: 2, value: '1d4', priority: 20
      }, {
        key: 'system.bonuses.msak.damage', mode: 2, value: '1d4', priority: 20
      }],
      description: '<p>Increase your melee reach while grown.</p>',
      flags: {
        [moduleId]: {
          vessel: {
            role: 'dire-stature-effect',
            stage3Binding: 'archon',
            stage3Source: 'dire-stature'
          }
        }
      }
    }]
  };
}

function actor({mantle = true, archon = false} = {}) {
  let next = 0;
  return {
    isOwner: true,
    flags: {
      [moduleId]: {
        vessel: {
          mantle: {active: mantle},
          archon: {state: {active: archon}}
        }
      }
    },
    items: [
      item('aether-wings', 'mantle'),
      item('primordial-bulwark', 'archon')
    ],
    effects: [],
    async createEmbeddedDocuments(type, rows) {
      assert.equal(type, 'ActiveEffect');
      const created = rows.map(row => ({...structuredClone(row), _id: `stage3Effect00${++next}`}));
      this.effects.push(...created);
      return created;
    },
    async updateEmbeddedDocuments(type, rows) {
      assert.equal(type, 'ActiveEffect');
      for (const row of rows) Object.assign(
        this.effects.find(effect => effect._id === row._id),
        structuredClone(row)
      );
    },
    async deleteEmbeddedDocuments(type, ids) {
      assert.equal(type, 'ActiveEffect');
      this.effects = this.effects.filter(effect => !ids.includes(effect._id));
    }
  };
}

test('Stage 3 reconciliation creates only effects eligible for current state', async () => {
  const target = actor();
  await reconcileStage3Effects(target);
  assert.deepEqual(
    target.effects.map(effect => effect.flags[moduleId].vessel.stage3Source),
    ['aether-wings']
  );
});

test('Stage 3 reconciliation is idempotent and swaps bindings safely', async () => {
  const target = actor();
  await reconcileStage3Effects(target);
  await reconcileStage3Effects(target);
  assert.equal(target.effects.length, 1);

  target.flags[moduleId].vessel.mantle.active = false;
  target.flags[moduleId].vessel.archon.state.active = true;
  await reconcileStage3Effects(target);
  assert.deepEqual(
    target.effects.map(effect => effect.flags[moduleId].vessel.stage3Source),
    ['primordial-bulwark']
  );
});

test('Stage 3 reconciliation leaves foreign effects untouched', async () => {
  const target = actor({mantle: false});
  target.effects.push({_id: 'foreignEffect001', flags: {other: true}});
  await reconcileStage3Effects(target);
  assert.deepEqual(target.effects.map(effect => effect._id), ['foreignEffect001']);
});

test('Stage 3 reconciliation applies a transformation-tagged Dire effect at the chosen growth', async () => {
  const target = actor({mantle: false, archon: true});
  target.flags[moduleId].vessel.archon.state = {
    active: true,
    growthCategories: 2,
    profile: 'cursed',
    transformationId: 'dire-huge-transform'
  };
  target.items.push(direStatureItem());

  await reconcileStage3Effects(target);

  const applied = target.effects.find(effect =>
    effect.flags?.[moduleId]?.vessel?.role === 'dire-stature-effect'
  );
  assert.ok(applied);
  assert.deepEqual(applied.changes, [{
    key: 'system.attributes.ac.bonus', mode: 2, value: '2', priority: 20
  }, {
    key: 'system.bonuses.mwak.damage', mode: 2, value: '2d4', priority: 20
  }, {
    key: 'system.bonuses.msak.damage', mode: 2, value: '2d4', priority: 20
  }]);
  assert.equal(
    applied.flags[moduleId].vessel.archon.temporary.transformationId,
    'dire-huge-transform'
  );
  assert.match(applied.description, /10-foot reach/i);
});

test('Stage 3 reconciliation does not apply Dire Stature at normal size', async () => {
  const target = actor({mantle: false, archon: true});
  target.flags[moduleId].vessel.archon.state = {
    active: true,
    growthCategories: 0,
    transformationId: 'dire-normal-transform'
  };
  target.items.push(direStatureItem());

  await reconcileStage3Effects(target);

  assert.equal(target.effects.some(effect =>
    effect.flags?.[moduleId]?.vessel?.role === 'dire-stature-effect'
  ), false);
});
