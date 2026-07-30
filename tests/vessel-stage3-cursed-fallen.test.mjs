import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(
  new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url)
);
const yaml = require('js-yaml');
const moduleId = 'declan-homebrew-classes';

function load(path) {
  return yaml.load(readFileSync(new URL(path, import.meta.url), 'utf8'));
}

function activity(item, role) {
  return Object.values(item.system.activities)
    .find(candidate => candidate.flags?.[moduleId]?.vessel?.role === role);
}

function embedded(actor, identifier) {
  return actor.items.find(item => item.system.identifier === identifier);
}

test('Cursed Archon exposes Frenzy and an explicit Infernal Drain recovery', () => {
  const actor = load('../archon-src/cursed-archon.yml');
  const frenzyItem = embedded(actor, 'frenzy');
  const frenzy = activity(frenzyItem, 'frenzy');
  assert.equal(frenzy.type, 'utility');
  assert.equal(frenzy.effects[0]._id, 'FrenzyEffect0001');
  assert.equal(frenzyItem.effects[0]._id, 'FrenzyEffect0001');
  assert.match(frenzyItem.effects[0].description, /attacks targeting/i);

  const drain = activity(embedded(actor, 'infernal-drain'), 'infernal-drain');
  assert.equal(drain.type, 'heal');
  assert.equal(drain.healing.custom.formula, '@abilities.cha.mod');
  assert.deepEqual(drain.healing.types, ['temphp']);
  assert.match(drain.description.chatFlavor, /twice your Vessel level/i);
});

test('Fallen exposes native Divine Wrath and Divine Ward controls', () => {
  const wrathItem = load(
    '../src/vessel/subclass-features/the-fallen/divine-wrath.yml'
  );
  const wrath = activity(wrathItem, 'divine-wrath');
  assert.equal(wrath.type, 'attack');
  assert.equal(wrath.attack.ability, 'cha');
  assert.deepEqual(wrath.damage.parts[0].types, ['radiant']);
  assert.equal(wrath.damage.parts[0].custom.formula, '@mod');
  assert.match(wrath.description.chatFlavor, /weapon damage die/i);

  const actor = load('../archon-src/fallen-archon.yml');
  const ward = activity(embedded(actor, 'divine-ward'), 'divine-ward');
  assert.equal(ward.type, 'heal');
  assert.equal(ward.activation.type, 'bonus');
  assert.equal(ward.range.value, '30');
  assert.deepEqual(ward.healing.types, ['temphp']);
  assert.equal(ward.healing.custom.formula, '@abilities.cha.mod');
});

test('Fallen grants a cleanup-safe Condemnation marker at level 6', () => {
  const item = load(
    '../src/vessel/subclass-features/the-fallen/condemnation.yml'
  );
  const condemn = activity(item, 'condemnation');
  assert.equal(condemn.type, 'utility');
  assert.equal(condemn.effects[0]._id, 'CondemnedEff0001');
  assert.equal(
    item.effects[0].flags[moduleId].vessel.role,
    'archon-form-effect'
  );
  assert.equal(item.effects[0].flags[moduleId].vessel.source, 'condemnation');

  const subclass = load('../src/vessel/the-fallen.yml');
  const levelSix = subclass.system.advancement.find(entry => entry.level === 6);
  assert.ok(levelSix);
  assert.equal(
    levelSix.configuration.items[0].uuid,
    'Compendium.declan-homebrew-classes.homebrew-classes.Item.hbrFalCondemn001'
  );
});
