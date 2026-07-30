import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url));
const yaml = require('js-yaml');
const moduleId = 'declan-homebrew-classes';
const load = path => yaml.load(readFileSync(new URL(path, import.meta.url), 'utf8'));
const embedded = (actor, id) => actor.items.find(item => item.system.identifier === id);
const activity = (item, role) => Object.values(item.system.activities)
  .find(value => value.flags?.[moduleId]?.vessel?.role === role);

test('Formless Archon exposes a reach Strike and native Sticky Slime saves', () => {
  const actor = load('../archon-src/formless-archon.yml');
  const strike = activity(embedded(actor, 'pseudopods'), 'pseudopod-strike');
  assert.equal(strike.type, 'attack');
  assert.equal(strike.attack.ability, 'cha');
  assert.equal(strike.range.value, '10');
  assert.equal(strike.damage.parts[0].custom.formula, '@scale.vessel.iridescent-strike + @mod');

  const slimeItem = embedded(actor, 'sticky-slime');
  const slime = activity(slimeItem, 'sticky-slime');
  assert.equal(slime.type, 'save');
  assert.deepEqual(slime.save.ability, ['dex']);
  assert.equal(slime.effects[0]._id, 'StickyGrapple001');
  assert.deepEqual(slimeItem.effects[0].statuses, ['grappled']);
  assert.deepEqual(activity(slimeItem, 'sticky-slime-escape').save.ability, ['str']);
});

test('Drain Vitality separates native damage from player-invoked recovery', () => {
  const item = load('../src/vessel/subclass-features/the-formless/drain-vitality.yml');
  const drain = activity(item, 'drain-vitality');
  assert.equal(drain.type, 'save');
  assert.deepEqual(drain.save.ability, ['con']);
  assert.deepEqual(drain.damage.parts[0].types, ['acid']);
  assert.match(drain.damage.parts[0].custom.formula, /@classes\.vessel\.levels/);
  const recovery = activity(item, 'drain-vitality-recovery');
  assert.equal(recovery.type, 'heal');
  assert.deepEqual(recovery.healing.types, ['temphp']);
  assert.match(recovery.description.chatFlavor, /half the acid damage/i);
});

test('Trickster Archon exposes Juxtapose and a Stolen Memory marker', () => {
  const actor = load('../archon-src/trickster-archon.yml');
  const juxtapose = activity(embedded(actor, 'juxtapose'), 'juxtapose');
  assert.equal(juxtapose.activation.type, 'bonus');
  assert.deepEqual(juxtapose.save.ability, ['cha']);
  assert.equal(juxtapose.range.value, '60');
  assert.match(juxtapose.description.chatFlavor, /move both tokens/i);

  const memoryItem = embedded(actor, 'stolen-memory');
  const memory = activity(memoryItem, 'stolen-memory');
  assert.deepEqual(memory.save.ability, ['int']);
  assert.equal(memory.effects[0]._id, 'StolenMemoryEff1');
  assert.match(memoryItem.effects[0].description, /cannot.*target/i);
});
