import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(
  new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url)
);
const yaml = require('js-yaml');
const root = fileURLToPath(new URL('../', import.meta.url));
const sourcePath = join(root, 'spell-lists-src', 'zeal-spells.yml');

test('public Zeal list uses standard Foundry spells and no LL alternate documents', () => {
  assert.equal(existsSync(sourcePath), true);
  const source = yaml.load(readFileSync(sourcePath, 'utf8'));
  const page = source.pages[0];

  assert.equal(page.type, 'spells');
  assert.equal(page.system.identifier, 'academy-of-zeal');
  assert.equal(page.system.type, 'subclass');
  assert.ok(page.system.spells.includes('Compendium.dnd5e.spells.Item.8dzaICjGy6mTUaUr'));
  assert.ok(page.system.spells.includes('Compendium.dnd5e.spells.Item.ZrTc23tToJ0JpH2h'));
  assert.ok(page.system.spells.includes('Compendium.dnd5e.spells.Item.VtCXMdyM6mAdIJZb'));
  assert.ok(page.system.spells.includes(
    'Compendium.dnd5e.spells24.Item.phbsplSearingSmi'
  ));
  assert.ok(page.system.spells.includes(
    'Compendium.dnd5e.spells24.Item.phbsplAuraofLife'
  ));
  assert.equal(
    page.system.spells.some(uuid => uuid.includes('.homebrew-spells.Item.')),
    false
  );

  const unlinked = new Set(page.system.unlinkedSpells.map(spell => spell.name));
  assert.ok(unlinked.has('Blade Ward'));
  assert.ok(unlinked.has('Compelled Duel'));
  assert.ok(unlinked.has('Aura of Vitality'));
  assert.equal(unlinked.has('Searing Smite'), false);
  assert.equal(unlinked.has('Aura of Life'), false);
  assert.equal(unlinked.has('Ethereal Anchor'), false);
  assert.equal(unlinked.has('Restoration'), false);
  assert.equal(unlinked.has('Conjure Volley'), false);
});

test('module registers both Vessel and Zeal native spell-list pages', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'module.json'), 'utf8'));
  const vessel = yaml.load(readFileSync(
    join(root, 'spell-lists-src', 'vessel-spells.yml'), 'utf8'
  ));
  const zeal = yaml.load(readFileSync(sourcePath, 'utf8'));
  const uuid = document => `Compendium.declan-homebrew-classes.vessel-spell-lists.JournalEntry.${document._id}.JournalEntryPage.${document.pages[0]._id}`;

  assert.deepEqual(manifest.flags.dnd5e.spellLists, [uuid(vessel), uuid(zeal)]);
  assert.equal(
    manifest.packs.find(pack => pack.name === 'vessel-spell-lists').label,
    'Class Spell Lists'
  );
});

test('Zeal list builder rejects a standard spell represented twice', async () => {
  const { buildZealSpellListDocument } = await import('../scripts/build-zeal-spell-list.mjs');
  assert.throws(() => buildZealSpellListDocument({
    linkedProfiles: [
      { name: 'Bless', level: 1, uuid: 'Compendium.dnd5e.spells.Item.aaaaaaaaaaaaaaaa' }
    ],
    unlinkedProfiles: [
      { name: ' bless ', level: 1, source: 'Player’s Handbook' }
    ]
  }), /duplicate normalized spell name/i);
});
