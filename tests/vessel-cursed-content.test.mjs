import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(
  new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url)
);
const yaml = require('js-yaml');

function load(relativePath) {
  return yaml.load(readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8'));
}

const hellfire = load('src/vessel/subclass-features/the-cursed/hellfire.yml');
const malignantAura = load('src/vessel/subclass-features/the-cursed/malignant-aura.yml');

const HELLFIRE_DESCRIPTION = '<p>6th-level Cursed Spirit feature You can access the true power of the dark Spirit imprisoned within, conjuring cursed infernal flames. Whenever you deal fire damage to a target, you ignore Resistance to fire damage and treat Immunity to fire as Resistance. Also, if you deal fire damage to a creature it cannot regain hit points until the start of your next turn.</p>';
const MALIGNANT_AURA_DESCRIPTION = '<p>3rd-level Cursed Spirit feature The aura of the Cursed Spirit sealed within your soul bleeds into yours. You gain the Striking Presence Aspect. It does not count against your Unsealed Aspects and cannot be replaced. If you already unlocked this Unsealed Aspect, you unlock another of your choice, or you can unlock Striking Presence again, but must choose a different skill to gain its benefits.</p>';

test('Hellfire contains only its published 6th-level feature description', () => {
  assert.equal(hellfire.system.description.value, HELLFIRE_DESCRIPTION);
});

test('Cursed feature descriptions exclude adjacent subclass contamination', () => {
  assert.equal(malignantAura.system.description.value, MALIGNANT_AURA_DESCRIPTION);

  for (const feature of [hellfire, malignantAura]) {
    for (const forbidden of ['Cursed Archon', 'Dark Sacrifice', 'Lord of Darkness', 'The Fallen']) {
      assert.doesNotMatch(feature.system.description.value, new RegExp(forbidden));
    }
  }
});
