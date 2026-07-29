import test from 'node:test';
import assert from 'node:assert/strict';

const {
  getIdentifier,
  getLeadershipAbility,
  getWarlordLevel,
  getWarlordRole,
  hasTacticalSuperiority,
  leadershipFormula,
  warlordRange
} = await import('../scripts/warlord/rules.mjs');

function actorWithClassLevel(level) {
  return {
    items: [{
      type: 'class',
      system: { identifier: 'warlord', levels: level }
    }]
  };
}

function actorWithFlag(leadershipAbility) {
  return {
    flags: {
      'declan-homebrew-classes': {
        warlord: { leadershipAbility }
      }
    }
  };
}

test('finds the greatest valid Warlord class level among embedded class items', () => {
  assert.equal(getWarlordLevel(actorWithClassLevel(11)), 11);
  assert.equal(getWarlordLevel({
    items: [
      { type: 'class', system: { identifier: 'warlord', levels: 3 } },
      { type: 'class', system: { identifier: 'warlord', levels: 11 } },
      { type: 'class', system: { identifier: 'fighter', levels: 20 } },
      { type: 'class', system: { identifier: 'warlord', levels: Infinity } },
      { type: 'class', system: { identifier: 'warlord', levels: -1 } }
    ]
  }), 11);
});

test('reads a valid leadership ability from the actor flag', () => {
  assert.equal(getLeadershipAbility(actorWithFlag('wis')), 'wis');
  assert.equal(getLeadershipAbility(actorWithFlag('dex')), undefined);
});

test('uses the selected ability modifier in a leadership formula', () => {
  assert.equal(leadershipFormula('int'), '@abilities.int.mod');
});

test('unlocks Tactical Superiority at Warlord level eleven', () => {
  assert.equal(hasTacticalSuperiority(actorWithClassLevel(10)), false);
  assert.equal(hasTacticalSuperiority(actorWithClassLevel(11)), true);
});

test('doubles Warlord range after Tactical Superiority unlocks', () => {
  assert.equal(warlordRange(actorWithClassLevel(10), 30), 30);
  assert.equal(warlordRange(actorWithClassLevel(11), 30), 60);
});

test('reads Warlord document roles from plain flags', () => {
  assert.equal(
    getWarlordRole({ flags: { 'declan-homebrew-classes': {
      warlord: { role: 'inspiring-word-launcher' }
    } } }),
    'inspiring-word-launcher'
  );
  assert.equal(getWarlordRole({ flags: { 'declan-homebrew-classes': {
    warlord: { role: 1 }
  } } }), undefined);
});

test('gets identifiers from direct and system values', () => {
  assert.equal(getIdentifier({ identifier: 'warlord' }), 'warlord');
  assert.equal(getIdentifier({ system: { identifier: 'warlord' } }), 'warlord');
});
