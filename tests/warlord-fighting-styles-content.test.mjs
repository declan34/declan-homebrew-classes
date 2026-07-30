import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(
  new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url)
);
const yaml = require('js-yaml');
const MODULE_ID = 'declan-homebrew-classes';
const IDENTIFIERS = Object.freeze([
  'balanced-fighting',
  'classical-swordplay',
  'defensive-fighting',
  'mounted-warrior',
  'protection',
  'standard-bearer',
  'tactical-fighting'
]);

function loadStyle(identifier) {
  return yaml.load(readFileSync(
    new URL(`../fighting-styles-src/${identifier}.yml`, import.meta.url),
    'utf8'
  ));
}

const styles = new Map(IDENTIFIERS.map(identifier => [
  identifier,
  loadStyle(identifier)
]));

function activities(identifier) {
  return Object.values(styles.get(identifier).system.activities);
}

function activity(identifier, mechanic) {
  return activities(identifier).find(candidate =>
    candidate.flags?.[MODULE_ID]?.warlord?.mechanic === mechanic
  );
}

function effects(identifier) {
  return styles.get(identifier).effects;
}

function effect(identifier, mechanic) {
  return effects(identifier).find(candidate =>
    candidate.flags?.[MODULE_ID]?.warlord?.mechanic === mechanic
  );
}

function changes(identifier, mechanic) {
  return effect(identifier, mechanic).changes;
}

test('the Fighting Style pack contains the seven exact style documents', () => {
  assert.equal(styles.size, 7);
  assert.deepEqual([...styles.keys()], IDENTIFIERS);
});

test('all seven Fighting Styles are available at the Warlord level-2 choice', () => {
  for (const identifier of IDENTIFIERS) {
    assert.equal(
      styles.get(identifier).system.prerequisites.level,
      2,
      `${identifier} prerequisite level`
    );
  }
});

test('Balanced and Classical use supported dnd5e enchantment change paths', () => {
  const balanced = activity('balanced-fighting', 'weapon-damage-enchantment');
  assert.equal(balanced.type, 'enchant');
  assert.equal(balanced.restrictions.type, 'weapon');
  assert.deepEqual(balanced.restrictions.categories, ['simpleM', 'martialM']);
  assert.deepEqual(balanced.effects, [{ _id: 'BalFightDmgEff01' }]);
  assert.equal(effect('balanced-fighting', 'weapon-damage-bonus').type, 'enchantment');
  assert.deepEqual(changes('balanced-fighting', 'weapon-damage-bonus'), [{
    key: 'system.damage.base.bonus',
    mode: 2,
    value: '2',
    priority: 20
  }]);

  const classical = activity('classical-swordplay', 'weapon-attack-enchantment');
  assert.equal(classical.type, 'enchant');
  assert.equal(classical.restrictions.type, 'weapon');
  assert.deepEqual(classical.restrictions.properties, ['fin']);
  assert.deepEqual(classical.effects, [{ _id: 'ClsAttackEff0001' }]);
  assert.equal(effect('classical-swordplay', 'weapon-attack-bonus').type, 'enchantment');
  assert.deepEqual(changes('classical-swordplay', 'weapon-attack-bonus'), [{
    key: 'activities[attack].attack.bonus',
    mode: 2,
    value: '2',
    priority: 20
  }]);
});

test('conditional armor bonuses use disabled additive AC effects', () => {
  for (const identifier of ['classical-swordplay', 'defensive-fighting']) {
    const ac = effect(identifier, 'conditional-ac');
    assert.equal(ac.disabled, true, `${identifier} disabled`);
    assert.deepEqual(ac.changes, [{
      key: 'system.attributes.ac.bonus',
      mode: 2,
      value: '1',
      priority: 20
    }], `${identifier} additive AC`);
  }
});

test('Mounted Warrior targets the Warlord and mount with a removable AC effect', () => {
  const use = activity('mounted-warrior', 'mounted-ac');
  assert.equal(use.type, 'utility');
  assert.equal(use.target.affects.count, '2');
  assert.equal(use.target.affects.type, 'creature');
  assert.match(use.target.affects.special, /self.*mount/i);
  assert.match(use.description.chatFlavor, /remove.*dismount/i);
  assert.deepEqual(changes('mounted-warrior', 'mounted-ac'), [{
    key: 'system.attributes.ac.bonus',
    mode: 2,
    value: '1',
    priority: 20
  }]);
});

test('Protection is a native reaction display for proficiency comparison', () => {
  const use = activity('protection', 'proficiency-comparison');
  assert.equal(use.type, 'utility');
  assert.equal(use.activation.type, 'reaction');
  assert.equal(use.target.affects.count, '1');
  assert.equal(use.roll.formula, '@prof');
  assert.equal(use.roll.visible, true);
});

test('Standard Bearer applies next-save advantage with manual removal guidance', () => {
  const use = activity('standard-bearer', 'next-save-advantage');
  assert.equal(use.type, 'utility');
  assert.equal(use.activation.type, 'reaction');
  assert.equal(use.target.affects.count, '1');
  assert.match(use.description.chatFlavor, /remove.*saving throw/i);

  const saveChanges = changes('standard-bearer', 'next-save-advantage');
  assert.equal(saveChanges.length, 6);
  assert.deepEqual(
    saveChanges.map(change => change.key),
    ['str', 'dex', 'con', 'int', 'wis', 'cha'].map(
      ability => `system.abilities.${ability}.save.roll.mode`
    )
  );
  for (const change of saveChanges) {
    assert.equal(change.mode, 2);
    assert.equal(change.value, '1');
  }
});

test('Tactical Fighting provides only the bonus-action Help activity', () => {
  const help = activity('tactical-fighting', 'next-attack-advantage');
  assert.equal(help.type, 'utility');
  assert.equal(help.activation.type, 'bonus');
  assert.equal(help.range.value, '30');
  assert.match(help.description.chatFlavor, /advantage.*next attack/i);
  assert.equal(activity('tactical-fighting', 'search'), undefined);
  assert.equal(activities('tactical-fighting').length, 1);
});

test('all module-owned style activities and effects have stable IDs and exact metadata', () => {
  for (const identifier of IDENTIFIERS) {
    for (const [key, ownedActivity] of Object.entries(
      styles.get(identifier).system.activities
    )) {
      assert.match(key, /^[A-Za-z0-9]{16}$/, `${identifier} activity key`);
      assert.equal(ownedActivity._id, key, `${identifier} activity ID`);
      const metadata = ownedActivity.flags?.[MODULE_ID]?.warlord;
      assert.equal(metadata?.role, 'fighting-style-activity');
      assert.equal(metadata?.style, identifier);
      assert.equal(typeof metadata?.mechanic, 'string');
      assert.ok(metadata.mechanic.length > 0);
    }

    for (const ownedEffect of effects(identifier)) {
      assert.match(ownedEffect._id, /^[A-Za-z0-9]{16}$/, `${identifier} effect ID`);
      const metadata = ownedEffect.flags?.[MODULE_ID]?.warlord;
      assert.equal(metadata?.role, 'fighting-style-effect');
      assert.equal(metadata?.style, identifier);
      assert.equal(typeof metadata?.mechanic, 'string');
      assert.ok(metadata.mechanic.length > 0);
    }
  }
});
