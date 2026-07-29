import test from 'node:test';
import assert from 'node:assert/strict';

const {
  getAutomationRole,
  getIridescentStrikeDie,
  getUnlockedIridescentDamageTypes,
  getVesselLevel,
  isEtherealArmorEligible
} = await import('../scripts/vessel/rules.mjs');

function item(identifier, type = 'feat', system = {}) {
  return { type, identifier, system: { identifier, ...system } };
}

function actor({
  level = 1,
  items = [],
  equipment = [],
  affinity
} = {}) {
  return {
    classes: { vessel: { system: { levels: level } } },
    items,
    itemTypes: { equipment },
    flags: {
      'declan-homebrew-classes': {
        vessel: { elementalAffinity: affinity }
      }
    }
  };
}

test('gets Vessel levels without counting other classes', () => {
  assert.equal(getVesselLevel(actor({ level: 11 })), 11);
  assert.equal(getVesselLevel({ classes: {} }), 0);
  assert.equal(getVesselLevel({
    items: [item('vessel', 'class', { levels: 7 })]
  }), 7);
});

test('maps Vessel levels to the Iridescent Strike die', () => {
  assert.equal(getIridescentStrikeDie(1), 'd6');
  assert.equal(getIridescentStrikeDie(4), 'd6');
  assert.equal(getIridescentStrikeDie(5), 'd8');
  assert.equal(getIridescentStrikeDie(11), 'd10');
  assert.equal(getIridescentStrikeDie(17), 'd12');
  assert.equal(getIridescentStrikeDie(20), 'd12');
});

test('adds only unlocked subclass damage types', () => {
  assert.deepEqual(getUnlockedIridescentDamageTypes(actor()), ['radiant']);
  assert.deepEqual(getUnlockedIridescentDamageTypes(actor({
    items: [item('ancient-knowledge')]
  })), ['radiant']);
  assert.deepEqual(getUnlockedIridescentDamageTypes(actor({
    items: [item('cursed-magic'), item('formless-magic'), item('trickster-magic')]
  })), ['radiant', 'fire', 'acid', 'psychic']);
  assert.deepEqual(getUnlockedIridescentDamageTypes(actor({
    items: [item('cataclysm-magic')],
    affinity: 'air'
  })), ['radiant', 'thunder']);
  assert.deepEqual(getUnlockedIridescentDamageTypes(actor({
    items: [item('cataclysm-magic')],
    affinity: 'earth'
  })), ['radiant', 'bludgeoning']);
  assert.deepEqual(getUnlockedIridescentDamageTypes(actor({
    items: [item('cataclysm-magic')],
    affinity: 'fire'
  })), ['radiant', 'fire']);
  assert.deepEqual(getUnlockedIridescentDamageTypes(actor({
    items: [item('cataclysm-magic')],
    affinity: 'water'
  })), ['radiant', 'cold']);
  assert.deepEqual(getUnlockedIridescentDamageTypes(actor({
    items: [item('cataclysm-magic')]
  })), ['radiant']);
});

test('allows Ethereal Armor only without equipped armor or Shield', () => {
  const equipped = type => ({
    system: { equipped: true, type: { value: type } }
  });
  const stowed = type => ({
    system: { equipped: false, type: { value: type } }
  });

  assert.equal(isEtherealArmorEligible(actor()), true);
  assert.equal(isEtherealArmorEligible(actor({
    equipment: [stowed('light')]
  })), true);
  assert.equal(isEtherealArmorEligible(actor({
    equipment: [equipped('clothing')]
  })), true);
  assert.equal(isEtherealArmorEligible(actor({
    equipment: [equipped('light')]
  })), false);
  assert.equal(isEtherealArmorEligible(actor({
    equipment: [equipped('medium')]
  })), false);
  assert.equal(isEtherealArmorEligible(actor({
    equipment: [equipped('heavy')]
  })), false);
  assert.equal(isEtherealArmorEligible(actor({
    equipment: [equipped('shield')]
  })), false);
});

test('reads automation roles without Foundry globals', () => {
  assert.equal(getAutomationRole({
    flags: {
      'declan-homebrew-classes': {
        vessel: { role: 'mantle-toggle' }
      }
    }
  }), 'mantle-toggle');
  assert.equal(getAutomationRole({ flags: {} }), undefined);
});
