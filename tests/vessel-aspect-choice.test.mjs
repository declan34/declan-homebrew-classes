import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(
  new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url)
);
const yaml = require('js-yaml');

const root = fileURLToPath(new URL('..', import.meta.url));
const vessel = yaml.load(
  readFileSync(join(root, 'src/vessel/the-vessel.yml'), 'utf8')
);
const aspects = readdirSync(join(root, 'aspects-src'))
  .filter(file => file.endsWith('.yml') && file !== '_folder.yml')
  .map(file => yaml.load(
    readFileSync(join(root, 'aspects-src', file), 'utf8')
  ));

const expectedMinimumLevel = new Map([
  ['aether-wings', 14],
  ['colossal-archon', 18],
  ['dazzling-lance', 10],
  ['dire-stature', 7],
  ['ethereal-grasp', 7],
  ['ethereal-tendril', 1],
  ['evoke-spirit', 7],
  ['iridescent-aegis', 7],
  ['iridescent-shield', 2],
  ['lord-of-spirits', 18],
  ['minor-magick', 7],
  ['opalescent-armor', 2],
  ['otherworldly-maw', 7],
  ['perilous-visage', 10],
  ['piercing-gaze', 7],
  ['primeval-thirst', 14],
  ['primordial-bulwark', 18],
  ['shimmering-lance', 2],
  ['spirit-sense', 1],
  ['striking-presence', 1],
  ['sundering-strike', 10],
  ['twilight-steps', 14],
  ['uncanny-strength', 1],
  ['vexing-strike', 2]
]);

test('Unsealed Aspect choices expose only aspects available at each Vessel level', () => {
  const advancement = vessel.system.advancement.find(
    entry => entry.title === 'Unsealed Aspects'
  );
  assert.ok(advancement, 'Vessel has an Unsealed Aspects ItemChoice');

  const byId = new Map(aspects.map(aspect => [aspect._id, aspect]));
  const pool = advancement.configuration.pool.map(({ uuid }) => {
    assert.match(
      uuid,
      /^Compendium\.declan-homebrew-classes\.vessel-aspects\.Item\.[A-Za-z0-9]{16}$/
    );
    const aspect = byId.get(uuid.split('.').at(-1));
    assert.ok(aspect, `${uuid} resolves to an Unsealed Aspect source`);
    return aspect;
  });

  assert.equal(pool.length, 24);
  assert.equal(new Set(pool.map(aspect => aspect._id)).size, 24);
  assert.deepEqual(
    new Map(pool.map(aspect => [
      aspect.system.identifier,
      aspect.system.prerequisites.level
    ])),
    expectedMinimumLevel
  );

  const availableAt = level => pool
    .filter(aspect => aspect.system.prerequisites.level <= level)
    .map(aspect => aspect.system.identifier)
    .sort();

  assert.deepEqual(availableAt(1), [
    'ethereal-tendril',
    'spirit-sense',
    'striking-presence',
    'uncanny-strength'
  ]);
  assert.equal(availableAt(2).length, 8);
  assert.equal(availableAt(4).length, 8);
  assert.equal(availableAt(7).length, 15);
  assert.equal(availableAt(10).length, 18);
  assert.equal(availableAt(14).length, 21);
  assert.equal(availableAt(18).length, 24);
});
