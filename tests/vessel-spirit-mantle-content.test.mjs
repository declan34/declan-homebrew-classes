import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(
  new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url)
);
const yaml = require('js-yaml');

const vessel = yaml.load(
  readFileSync(new URL('../src/vessel/the-vessel.yml', import.meta.url), 'utf8')
);
const mantle = yaml.load(
  readFileSync(
    new URL('../src/vessel/class-features/spirit-mantle.yml', import.meta.url),
    'utf8'
  )
);

function role(document) {
  return document.flags?.['declan-homebrew-classes']?.vessel?.role;
}

test('Vessel defines the Iridescent Strike damage scale', () => {
  const scale = vessel.system.advancement.find(
    advancement => advancement.type === 'ScaleValue'
      && advancement.configuration.identifier === 'iridescent-strike'
  );
  assert.ok(scale);
  assert.equal(scale._id, 'ZReRcAXx7wv1xOTO');
  assert.equal(scale.configuration.type, 'dice');
  assert.deepEqual(scale.configuration.scale, {
    1: { number: null, faces: 6, modifiers: [] },
    5: { number: null, faces: 8, modifiers: [] },
    11: { number: null, faces: 10, modifiers: [] },
    17: { number: null, faces: 12, modifiers: [] }
  });
});

test('Spirit Mantle exposes one toggle and two native Strikes', () => {
  const activities = Object.values(mantle.system.activities);
  assert.deepEqual(
    activities.map(activity => role(activity)).sort(),
    ['iridescent-strike', 'iridescent-strike', 'mantle-toggle']
  );

  const toggle = activities.find(activity => role(activity) === 'mantle-toggle');
  assert.equal(toggle.type, 'utility');
  assert.equal(toggle.activation.type, 'bonus');
  assert.deepEqual(toggle.consumption.targets, []);

  const strikes = activities.filter(
    activity => role(activity) === 'iridescent-strike'
  );
  assert.deepEqual(
    strikes.map(activity => activity.activation.type).sort(),
    ['action', 'bonus']
  );
  for (const strike of strikes) {
    assert.equal(strike.type, 'attack');
    assert.equal(strike.attack.ability, 'cha');
    assert.equal(strike.attack.type.value, 'melee');
    assert.equal(strike.attack.type.classification, 'unarmed');
    assert.equal(
      strike.damage.parts[0].custom.formula,
      '@scale.vessel.iridescent-strike + @mod'
    );
    assert.deepEqual(strike.damage.parts[0].types, ['radiant']);
  }
});

test('Spirit Mantle includes an inactive native AC effect template', () => {
  const effect = mantle.effects.find(candidate => role(candidate) === 'mantle-ac');
  assert.ok(effect);
  assert.equal(effect._id, '9VejV6Hl6RdY5Gzt');
  assert.equal(effect.disabled, true);
  assert.equal(effect.transfer, false);
  assert.deepEqual(effect.changes, [{
    key: 'system.attributes.ac.min',
    mode: 4,
    value: '10 + @abilities.con.mod + @abilities.cha.mod',
    priority: 20
  }]);
});
