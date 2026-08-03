import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(
  new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url)
);
const yaml = require('js-yaml');

function load(relativePath) {
  return yaml.load(readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8'));
}

test('class and subclass documents use artwork shipped by dnd5e 5.3', () => {
  for (const group of ['talent', 'vessel', 'warlord']) {
    const directory = new URL(`../src/${group}/`, import.meta.url);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.yml')) continue;
      const document = load(`src/${group}/${entry.name}`);
      if (!['class', 'subclass'].includes(document.type)) continue;

      const expected = document.type === 'class'
        ? 'systems/dnd5e/icons/svg/items/class.svg'
        : 'systems/dnd5e/icons/svg/items/subclass.svg';
      assert.equal(document.img, expected, `${group}/${entry.name}`);
    }
  }
});

test('reported spell artwork uses stable dnd5e assets', () => {
  const flameWhip = load('spells-src/2nd-level/flame-whip-ll.yml');
  const deathWard = load('spells-src/4th-level/death-ward-ll.yml');

  assert.equal(flameWhip.img, 'systems/dnd5e/icons/svg/damage/fire.svg');
  assert.equal(
    flameWhip.effects[0].img,
    'systems/dnd5e/icons/svg/damage/fire.svg'
  );
  assert.equal(deathWard.img, 'systems/dnd5e/icons/svg/checked-shield.svg');
});
