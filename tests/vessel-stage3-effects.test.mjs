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
