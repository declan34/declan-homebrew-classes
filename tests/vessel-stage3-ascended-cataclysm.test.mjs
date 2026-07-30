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

function embeddedItem(actor, identifier) {
  return actor.items.find(item => item.system.identifier === identifier);
}

function activityByRole(item, role) {
  return Object.values(item.system.activities)
    .find(activity => activity.flags?.[moduleId]?.vessel?.role === role);
}

test('Ascended Archon exposes native Arcane Blast and adjudicated Astral Step', () => {
  const actor = load('../archon-src/ascended-archon.yml');
  const blast = activityByRole(embeddedItem(actor, 'arcane-blast'), 'arcane-blast');
  assert.equal(blast.type, 'save');
  assert.deepEqual(blast.save.ability, ['dex']);
  assert.equal(blast.range.value, '60');
  assert.equal(blast.target.template.type, 'radius');
  assert.equal(blast.target.template.size, '5');
  assert.equal(
    blast.damage.parts[0].custom.formula,
    '@scale.vessel.iridescent-strike + @mod'
  );

  const step = activityByRole(embeddedItem(actor, 'astral-step'), 'astral-step');
  assert.equal(step.type, 'utility');
  assert.equal(step.activation.type, 'special');
  assert.match(step.description.chatFlavor, /move the token/i);
});

test('Air Archon exposes Bluster as an explicit player-adjudicated rider', () => {
  const actor = load('../archon-src/cataclysm-air-archon.yml');
  const bluster = activityByRole(embeddedItem(actor, 'bluster'), 'bluster');
  assert.equal(bluster.type, 'utility');
  assert.equal(bluster.activation.type, 'special');
  assert.match(bluster.description.chatFlavor, /10 feet/i);
  assert.match(bluster.description.chatFlavor, /size/i);
});

test('Cataclysmic Eruption uses a native save, area, damage, and feature use', () => {
  const item = load(
    '../src/vessel/subclass-features/the-cataclysm/cataclysmic-eruption.yml'
  );
  const eruption = activityByRole(item, 'cataclysmic-eruption');
  assert.equal(eruption.type, 'save');
  assert.deepEqual(eruption.save.ability, ['dex']);
  assert.equal(eruption.range.value, '30');
  assert.equal(eruption.target.template.type, 'radius');
  assert.equal(eruption.target.template.size, '7.5');
  assert.equal(eruption.damage.onSave, 'half');
  assert.equal(eruption.damage.parts[0].custom.formula, '9d6');
  assert.deepEqual(eruption.consumption.targets, [
    { type: 'itemUses', target: '', value: '1', scaling: {} }
  ]);
});
