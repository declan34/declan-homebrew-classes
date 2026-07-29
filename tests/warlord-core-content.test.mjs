import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(
  new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url)
);
const yaml = require('js-yaml');

function loadFeature(identifier) {
  return yaml.load(readFileSync(
    new URL(`../src/warlord/class-features/${identifier}.yml`, import.meta.url),
    'utf8'
  ));
}

function activities(item) {
  return Object.values(item.system.activities);
}

function byRole(item, role) {
  const activity = activities(item).find(candidate => (
    candidate.flags?.['declan-homebrew-classes']?.warlord?.role === role
  ));
  assert.ok(activity, `expected ${item.name} to define ${role}`);
  return activity;
}

function helpers(item) {
  return activities(item).filter(candidate => (
    candidate.flags?.['declan-homebrew-classes']?.warlord?.role
      === 'inspiring-word-helper'
  ));
}

const leadership = loadFeature('leadership-style');
const tactical = loadFeature('tactical-exploits');
const inspiring = loadFeature('inspiring-word');
const rally = loadFeature('rallying-cry');
const superiority = loadFeature('tactical-superiority');

test('Leadership Style exposes a no-cost configuration launcher', () => {
  const launcher = byRole(leadership, 'leadership-config');
  assert.equal(launcher.type, 'utility');
  assert.equal(launcher.activation.type, '');
  assert.deepEqual(launcher.consumption.targets, []);
});

test('Tactical Exploits owns and spends the shared Exploit Dice pool', () => {
  assert.equal(tactical.system.uses.max, '@scale.warlord.exploit-dice');
  assert.deepEqual(tactical.system.uses.recovery, [
    { period: 'sr', type: 'recoverAll' }
  ]);

  const skill = byRole(tactical, 'tactical-skill');
  assert.equal(skill.type, 'utility');
  assert.equal(skill.roll.formula, '@scale.warlord.exploit-die');
  assert.equal(skill.roll.visible, true);
  assert.deepEqual(skill.consumption.targets, [{
    type: 'itemUses',
    target: 'tactical-exploits',
    value: '1',
    scaling: {}
  }]);
});

test('Inspiring Word exposes a router and the twelve immutable Heal helpers', () => {
  assert.deepEqual(inspiring.system.uses.recovery, [
    { period: 'sr', type: 'recoverAll' },
    { period: 'initiative', type: 'recover', formula: '1' }
  ]);

  const launcher = byRole(inspiring, 'inspiring-word-launcher');
  assert.equal(launcher.type, 'utility');
  assert.equal(launcher.consumption.targets.length, 0);
  assert.equal(
    launcher.flags['declan-homebrew-classes'].warlord.routerOnly,
    true
  );

  const helperActivities = helpers(inspiring);
  assert.equal(helperActivities.length, 12);
  for (const helper of helperActivities) {
    assert.equal(helper.type, 'heal');
    assert.equal(helper.activation.type, 'bonus');
    assert.equal(helper.range.value, '30');
    assert.equal(helper.target.affects.count, '1');
    assert.equal(helper.target.affects.type, 'creature');
    assert.deepEqual(helper.consumption.targets, [{
      type: 'itemUses', target: '', value: '1', scaling: {}
    }]);
    assert.equal(helper.flags['declan-homebrew-classes'].warlord.hidden, true);
  }
  assert.deepEqual(
    new Set(inspiring.flags.dnd5e.riders.activity),
    new Set(helperActivities.map(helper => helper._id))
  );

  const dice = [6, 8, 10, 12];
  const abilities = ['cha', 'wis', 'int'];
  const formulas = new Set(dice.flatMap(faces => abilities.map(
    ability => `1d${faces} + @abilities.${ability}.mod`
  )));
  assert.deepEqual(
    new Set(helperActivities.map(helper => helper.healing.custom.formula)),
    formulas
  );
  for (const helper of helperActivities) {
    const warlord = helper.flags['declan-homebrew-classes'].warlord;
    assert.equal(helper.healing.custom.formula,
      `1d${warlord.hitDie} + @abilities.${warlord.leadershipAbility}.mod`);
  }
});

test('Rallying Cry has native reaction and recovery mechanics', () => {
  assert.deepEqual(rally.system.uses.recovery, [
    { period: 'sr', type: 'recoverAll' },
    { period: 'initiative', type: 'recover', formula: '1' }
  ]);
  const cry = byRole(rally, 'rallying-cry');
  assert.equal(cry.type, 'utility');
  assert.equal(cry.activation.type, 'reaction');
  assert.equal(cry.range.value, '30');
  assert.equal(cry.target.affects.count, '1');
  assert.equal(cry.target.affects.type, 'creature');
  assert.equal(cry.roll.formula, '@abilities.cha.mod');
  assert.deepEqual(cry.consumption.targets, [{
    type: 'itemUses', target: '', value: '1', scaling: {}
  }]);
});

test('Tactical Superiority provides no duplicate activity', () => {
  assert.deepEqual(activities(superiority), []);
});
