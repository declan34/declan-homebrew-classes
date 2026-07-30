import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url));
const yaml = require('js-yaml');
const moduleId = 'declan-homebrew-classes';
const load = name => yaml.load(readFileSync(
  new URL(`../aspects-src/${name}.yml`, import.meta.url),
  'utf8'
));

function taggedEffect(item, binding) {
  return item.effects.find(effect =>
    effect.flags?.[moduleId]?.vessel?.stage3Binding === binding
  );
}

test('Aether Wings supplies a Mantle-bound 60-foot hover effect', () => {
  const effect = taggedEffect(load('aether-wings'), 'mantle');
  assert.ok(effect);
  assert.ok(effect.changes.some(change =>
    change.key === 'system.attributes.movement.fly'
    && change.mode === 4
    && change.value === '60'
  ));
  assert.ok(effect.changes.some(change =>
    change.key === 'system.attributes.movement.hover'
    && change.value === 'true'
  ));
});

test('Opalescent Armor supplies physical resistance and speed guidance', () => {
  const effect = taggedEffect(load('opalescent-armor'), 'mantle');
  assert.ok(effect);
  assert.deepEqual(
    effect.changes
      .filter(change => change.key === 'system.traits.dr.value')
      .map(change => change.value),
    ['bludgeoning', 'piercing', 'slashing']
  );
  assert.ok(effect.changes.some(change =>
    change.key === 'system.attributes.movement.walk'
    && change.value === '-10'
  ));
  assert.match(effect.description, /silvered/i);
});

test('Primordial Bulwark supplies Archon resistance and a Harden control', () => {
  const item = load('primordial-bulwark');
  const effect = taggedEffect(item, 'archon');
  assert.ok(effect);
  assert.equal(
    effect.changes.filter(change => change.key === 'system.traits.dr.value').length,
    10
  );
  const harden = Object.values(item.system.activities).find(activity =>
    activity.flags?.[moduleId]?.vessel?.role === 'primordial-bulwark-harden'
  );
  assert.equal(harden.type, 'utility');
  assert.equal(harden.activation.type, 'bonus');
  assert.match(harden.description.chatFlavor, /Charisma modifier/i);
});
