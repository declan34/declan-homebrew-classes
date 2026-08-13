import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(
  new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url)
);
const yaml = require('js-yaml');

function spellFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    return entry.isDirectory() ? spellFiles(path) : [path];
  });
}

test('homebrew spell effects do not point at unrelated compendium documents', () => {
  const root = new URL('../spells-src/', import.meta.url);
  for (const file of spellFiles(root)) {
    if (!file.pathname.endsWith('.yml')) continue;
    const spell = yaml.load(readFileSync(file, 'utf8'));
    for (const effect of spell.effects ?? []) {
      assert.ok(
        effect.origin == null
          || effect.origin === `Compendium.declan-homebrew-classes.homebrew-spells.Item.${spell._id}`,
        `${spell.name} effect ${effect.name} has invalid origin ${effect.origin}`
      );
    }
  }
});
