import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url));
const yaml = require('js-yaml');
const moduleId = 'declan-homebrew-classes';
const load = name => yaml.load(readFileSync(new URL(`../aspects-src/${name}.yml`, import.meta.url), 'utf8'));
const activity = (item, role) => Object.values(item.system.activities)
  .find(value => value.flags?.[moduleId]?.vessel?.role === role);

test('Perilous Visage and Otherworldly Maw expose native saves and follow-ups', () => {
  const perilous = load('perilous-visage');
  const visage = activity(perilous, 'perilous-visage');
  assert.deepEqual(visage.save.ability, ['wis']);
  assert.equal(visage.range.value, '60');
  assert.deepEqual(perilous.effects[0].statuses, ['frightened']);

  const maw = load('otherworldly-maw');
  const damage = activity(maw, 'otherworldly-maw');
  assert.deepEqual(damage.save.ability, ['cha']);
  assert.equal(damage.damage.parts[0].custom.formula, '2d6');
  assert.deepEqual(damage.damage.parts[0].types, ['necrotic']);
  assert.equal(activity(maw, 'otherworldly-maw-recovery').type, 'heal');
});

test('Twilight Steps and both Lance Aspects use native activities', () => {
  const twilight = activity(load('twilight-steps'), 'twilight-steps');
  assert.equal(twilight.type, 'utility');
  assert.equal(twilight.activation.type, 'bonus');
  assert.equal(twilight.duration.units, 'turn');
  assert.equal(twilight.duration.concentration, false);

  const shimmering = activity(load('shimmering-lance'), 'shimmering-lance');
  assert.equal(shimmering.type, 'attack');
  assert.equal(shimmering.attack.ability, 'cha');
  assert.equal(shimmering.range.value, '30');
  assert.equal(shimmering.range.long, '90');

  const dazzling = load('dazzling-lance');
  const lance = activity(dazzling, 'dazzling-lance');
  assert.equal(lance.range.value, '100');
  assert.equal(lance.range.long, '300');
  const eruption = activity(dazzling, 'dazzling-eruption');
  assert.deepEqual(eruption.save.ability, ['dex']);
  assert.equal(eruption.target.template.size, '30');
  assert.equal(eruption.consumption.targets[0].target, 'spells.vessel.value');
  assert.match(eruption.damage.parts[0].custom.formula, /@classes\.vessel\.levels/);
});

test('Sundering and Vexing Strikes apply visible player-adjudicated markers', () => {
  const sundering = load('sundering-strike');
  assert.deepEqual(activity(sundering, 'sundering-strike').save.ability, ['cha']);
  assert.match(sundering.effects[0].description, /cannot.*cast spells/i);

  const vexing = load('vexing-strike');
  assert.equal(activity(vexing, 'vexing-strike').type, 'utility');
  assert.match(vexing.effects[0].description, /targets other than the Vessel/i);
  assert.match(vexing.effects[0].description, /Charmed/i);
});
