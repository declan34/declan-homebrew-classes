import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.ui = {notifications: {warn() {}, error() {}}};
globalThis.game = {time: {worldTime: 0}};

const {
  handlePreUseActivity,
  prepareStage3Activity
} = await import('../scripts/vessel/hooks.mjs');

const moduleId = 'declan-homebrew-classes';

function actor({mantle = false, archon = false, affinity = 'air'} = {}) {
  return {
    isOwner: true,
    flags: {
      [moduleId]: {
        vessel: {
          mantle: {active: mantle},
          elementalAffinity: affinity,
          archon: {state: {active: archon}}
        }
      }
    },
    items: []
  };
}

function activity(role, target, types = ['radiant']) {
  const value = {
    id: `${role}-activity`,
    flags: {[moduleId]: {vessel: {role}}},
    item: {actor: target},
    damage: {
      parts: [{
        toObject() {
          return {types: [...types], custom: {enabled: true, formula: '1d6'}};
        }
      }]
    },
    updateSource(changes) {
      this.updated = structuredClone(changes);
    }
  };
  return value;
}

test('Stage 3 rejects state-bound activities before native use', () => {
  assert.equal(handlePreUseActivity(activity('arcane-blast', actor())), false);
  assert.equal(handlePreUseActivity(activity('shimmering-lance', actor())), false);
  assert.equal(
    handlePreUseActivity(activity('arcane-blast', actor({archon: true}))),
    undefined
  );
  assert.equal(
    handlePreUseActivity(activity('shimmering-lance', actor({mantle: true}))),
    undefined
  );
});

test('Stage 3 prepares unlocked Strike types and saved affinity without rolling', () => {
  const vessel = actor({mantle: true, archon: true, affinity: 'earth'});
  vessel.items.push({system: {identifier: 'cursed-magic'}});
  const strike = activity('shimmering-lance', vessel);
  assert.equal(prepareStage3Activity(strike), undefined);
  assert.deepEqual(strike.updated.damage.parts[0].types, ['radiant', 'fire']);

  const eruption = activity('cataclysmic-eruption', vessel);
  assert.equal(prepareStage3Activity(eruption), undefined);
  assert.deepEqual(eruption.updated.damage.parts[0].types, ['bludgeoning']);
});

test('unrelated activities remain entirely native', () => {
  const unrelated = activity('foreign-role', actor());
  assert.equal(handlePreUseActivity(unrelated), undefined);
  assert.equal(unrelated.updated, undefined);
});
