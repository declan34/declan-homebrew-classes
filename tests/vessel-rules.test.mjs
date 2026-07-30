import test from 'node:test';
import assert from 'node:assert/strict';

const {
  ARCHON_PROFILES,
  getAutomationRole,
  getArchonACBonus,
  getArchonDurationSeconds,
  getArchonProfilesForActor,
  getArchonTempHP,
  getIridescentStrikeDie,
  getVesselSubclassIdentifier,
  getUnlockedIridescentDamageTypes,
  getVesselLevel,
  isEtherealArmorEligible,
  normalizeElementalAffinity,
  shouldEndArchonFormAtZeroHP,
  shouldEndArchonFormForUnconscious
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

test('inventories the nine stable Archon profiles', () => {
  assert.deepEqual(Object.keys(ARCHON_PROFILES), [
    'ascended',
    'cataclysm-air',
    'cataclysm-earth',
    'cataclysm-fire',
    'cataclysm-water',
    'cursed',
    'fallen',
    'formless',
    'trickster'
  ]);
  assert.equal(new Set(
    Object.values(ARCHON_PROFILES).map(profile => profile.actorId)
  ).size, 9);
  assert.ok(Object.values(ARCHON_PROFILES).every(profile =>
    /^[A-Za-z0-9]{16}$/.test(profile.actorId)
    && profile.uuid.endsWith(`.Actor.${profile.actorId}`)
  ));
});

test('detects the owned Vessel subclass from shape-tolerant Item collections', () => {
  assert.equal(getVesselSubclassIdentifier({
    itemTypes: {
      subclass: [item('the-fallen', 'subclass')]
    }
  }), 'the-fallen');
  assert.equal(getVesselSubclassIdentifier({
    items: new Map([
      ['subclass', item('the-formless', 'subclass')]
    ])
  }), 'the-formless');
  assert.equal(getVesselSubclassIdentifier({
    items: [item('other-subclass', 'subclass')]
  }), undefined);
});

test('selects one subclass profile or the Cataclysm affinity profile', () => {
  assert.deepEqual(
    getArchonProfilesForActor({
      items: [item('the-ascended', 'subclass')]
    }).map(profile => profile.profile),
    ['ascended']
  );
  assert.deepEqual(
    getArchonProfilesForActor({
      items: [item('the-cataclysm', 'subclass')],
      flags: {
        'declan-homebrew-classes': {
          vessel: { elementalAffinity: ' Earth ' }
        }
      }
    }).map(profile => profile.profile),
    ['cataclysm-earth']
  );
  assert.deepEqual(
    getArchonProfilesForActor({
      items: [item('the-cataclysm', 'subclass')]
    }).map(profile => profile.profile),
    [
      'cataclysm-air',
      'cataclysm-earth',
      'cataclysm-fire',
      'cataclysm-water'
    ]
  );
  assert.deepEqual(getArchonProfilesForActor({ items: [] }), []);
});

test('normalizes only supported Cataclysm affinities', () => {
  assert.equal(normalizeElementalAffinity(' FIRE '), 'fire');
  assert.equal(normalizeElementalAffinity({ value: 'water' }), 'water');
  assert.equal(normalizeElementalAffinity('ice'), undefined);
  assert.equal(normalizeElementalAffinity(null), undefined);
});

test('applies Controlled Transformation duration and early-end rules', () => {
  assert.equal(getArchonDurationSeconds(1), 600);
  assert.equal(getArchonDurationSeconds(6), 600);
  assert.equal(getArchonDurationSeconds(7), 3600);
  assert.equal(getArchonDurationSeconds(actor({ level: 20 })), 3600);
  assert.equal(shouldEndArchonFormForUnconscious(6), true);
  assert.equal(shouldEndArchonFormForUnconscious(7), false);
  assert.equal(shouldEndArchonFormAtZeroHP(0), true);
  assert.equal(shouldEndArchonFormAtZeroHP('0'), true);
  assert.equal(shouldEndArchonFormAtZeroHP(1), false);
});

test('calculates Archon temporary HP and AC bonuses safely', () => {
  assert.equal(getArchonTempHP(11), 22);
  assert.equal(getArchonTempHP(actor({ level: 7 })), 14);
  assert.equal(getArchonTempHP(-2), 0);
  assert.equal(getArchonACBonus('cataclysm-earth'), 2);
  assert.equal(getArchonACBonus(ARCHON_PROFILES.cursed), 1);
  assert.equal(getArchonACBonus('missing'), 0);
});
