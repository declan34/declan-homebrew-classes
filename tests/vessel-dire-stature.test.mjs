import test from 'node:test';
import assert from 'node:assert/strict';

const {
  getDireGrowthBonuses,
  getDireStatureOptions
} = await import('../scripts/vessel/rules.mjs');

function aspect(identifier, name = 'An unrelated display name') {
  return {
    type: 'feat',
    name,
    system: { identifier }
  };
}

function actor(items) {
  return { items };
}

test('offers only normal stature when the actor lacks Dire Stature', () => {
  assert.deepEqual(getDireStatureOptions(actor([
    aspect('colossal-archon', 'Colossal Archon')
  ])), [0]);
});

test('offers normal and Large stature with Dire Stature', () => {
  assert.deepEqual(getDireStatureOptions(actor([
    aspect('dire-stature', 'Not the feature name')
  ])), [0, 1]);
});

test('offers Huge stature only with both Dire Stature and Colossal Archon', () => {
  assert.deepEqual(getDireStatureOptions(actor([
    aspect('dire-stature', 'A renamed Dire Stature'),
    aspect('colossal-archon', 'A renamed Colossal Archon')
  ])), [0, 1, 2]);
});

test('maps growth categories to normal, Large, and Huge bonuses with a Huge cap', () => {
  assert.deepEqual(getDireGrowthBonuses(0), {
    size: undefined,
    width: undefined,
    height: undefined,
    acBonus: 0,
    meleeDamage: undefined,
    reachBonus: 0
  });
  assert.deepEqual(getDireGrowthBonuses(1), {
    size: 'lg',
    width: 2,
    height: 2,
    acBonus: 1,
    meleeDamage: '1d4',
    reachBonus: 5
  });
  assert.deepEqual(getDireGrowthBonuses(2), {
    size: 'huge',
    width: 3,
    height: 3,
    acBonus: 2,
    meleeDamage: '2d4',
    reachBonus: 10
  });
  assert.deepEqual(getDireGrowthBonuses(99), {
    size: 'huge',
    width: 3,
    height: 3,
    acBonus: 2,
    meleeDamage: '2d4',
    reachBonus: 10
  });
});
