import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(
  new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url)
);
const yaml = require('js-yaml');
const cliEntry = require.resolve('@foundryvtt/foundryvtt-cli');
const { extractPack } = await import(pathToFileURL(cliEntry));

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const sourcePath = join(repositoryRoot, 'spell-lists-src', 'vessel-spells.yml');
const compiledPack = join(repositoryRoot, 'packs', 'vessel-spell-lists');
const modulePath = join(repositoryRoot, 'module.json');

const APPROVED_SRD_PROFILES = [
  { name: 'Chill Touch', level: 0, id: 'vrN18tbTw7io5MWd' },
  { name: 'Dancing Lights', level: 0, id: 'CAxSzHWizrafT033' },
  { name: 'Mage Hand', level: 0, id: 'Utk1OQRwYkMkFRD3' },
  { name: 'Message', level: 0, id: 'icZokbgV1jIMpNCv' },
  { name: 'Minor Illusion', level: 0, id: 'oIzA2MEHwxhtQneU' },
  { name: 'Thaumaturgy', level: 0, id: 'MUO1uYN7JR1hm4dR' },
  { name: 'Bane', level: 1, id: '95K2aUhAGV9qXjnf' },
  { name: 'Jump', level: 1, id: 'ZrTc23tToJ0JpH2h' },
  { name: 'Ensnaring Strike', level: 1, id: 'phbsplEnsnaringS', pack: 'spells24' },
  { name: 'Death Ward', level: 4, id: 'VtCXMdyM6mAdIJZb' },
  { name: 'Polymorph', level: 4, id: '04nMsTWkIFvkbXlY' }
];

const APPROVED_HOMEBREW_NAMES = new Set([
  'Dire Wail (LL)',
  'Eldritch Tentacles (LL)',
  'Ethereal Anchor (LL)',
  'Flame Whip (LL)',
  'Glitterbeam (LL)',
  'Otherworldly Grasp (LL)',
  'Spectral Passage (LL)',
  'Spiritual Sundering (LL)'
].map(normalizeName));

function findYamlFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...findYamlFiles(path));
    else if (entry.isFile() && /\.ya?ml$/u.test(entry.name)) files.push(path);
  }
  return files;
}

function normalizeName(name) {
  return String(name ?? '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('en-US');
}

function localSpellProfiles() {
  return findYamlFiles(join(repositoryRoot, 'spells-src'))
    .filter(path => !path.endsWith('_folder.yml'))
    .map(path => yaml.load(readFileSync(path, 'utf8')))
    .filter(document => APPROVED_HOMEBREW_NAMES.has(normalizeName(document.name)))
    .map(document => ({
      name: document.name,
      level: document.system.level,
      uuid: `Compendium.declan-homebrew-classes.homebrew-spells.Item.${document._id}`
    }));
}

function expectedProfiles() {
  return [
    ...localSpellProfiles(),
    ...APPROVED_SRD_PROFILES.map(profile => ({
      ...profile,
      uuid: `Compendium.dnd5e.${profile.pack ?? 'spells'}.Item.${profile.id}`
    }))
  ].sort((first, second) => first.level - second.level
    || normalizeName(first.name).localeCompare(normalizeName(second.name), 'en-US'));
}

test('Vessel spell-list pack is compiled', () => {
  assert.ok(existsSync(compiledPack), 'Vessel spell-list pack must be compiled');
});

test('Vessel spell-list source contains one ordered profile per authorized public spell', () => {
  const source = yaml.load(readFileSync(sourcePath, 'utf8'));
  const page = source.pages?.[0];
  const expected = expectedProfiles();

  assert.equal(source._id.length, 16);
  assert.deepEqual(source.flags, {
    dnd5e: { type: 'chapter', showPages: true }
  });
  assert.equal(page._id.length, 16);
  assert.equal(page.type, 'spells');
  assert.equal(page.system.identifier, 'vessel');
  assert.equal(page.system.type, 'class');
  assert.equal(page.system.grouping, 'level');
  assert.deepEqual(page.system.spells, expected.map(profile => profile.uuid));
  assert.deepEqual(
    page.system.unlinkedSpells.map(spell => [spell.name, spell.system.level]),
    [
      ['Friends', 0],
      ['Witch Bolt', 1],
      ['Hunger of Hadar', 3]
    ]
  );

  const normalizedNames = expected.map(profile => normalizeName(profile.name));
  assert.equal(new Set(normalizedNames).size, normalizedNames.length);
  assert.deepEqual(
    APPROVED_SRD_PROFILES.map(profile => profile.name),
    [
      'Chill Touch', 'Dancing Lights', 'Mage Hand', 'Message', 'Minor Illusion',
      'Thaumaturgy', 'Bane', 'Jump', 'Ensnaring Strike', 'Death Ward', 'Polymorph'
    ]
  );
});

test('Vessel spell-list builder rejects duplicate normalized spell names', async () => {
  const { buildVesselSpellListDocument } = await import('../scripts/build-vessel-spell-list.mjs');

  assert.throws(() => buildVesselSpellListDocument({
    homebrewProfiles: [
      { name: 'A  Spell', level: 1, uuid: 'Compendium.example.Item.aaaaaaaaaaaaaaaa' }
    ],
    srdProfiles: [
      { name: 'a spell', level: 1, uuid: 'Compendium.example.Item.bbbbbbbbbbbbbbbb' }
    ]
  }), /duplicate normalized spell name/i);
});

test('Vessel spell-list builder sorts equal-level profiles by normalized name', async () => {
  const { buildVesselSpellListDocument } = await import('../scripts/build-vessel-spell-list.mjs');
  const document = buildVesselSpellListDocument({
    homebrewProfiles: [
      { name: 'a   Zebra', level: 1, uuid: 'Compendium.example.Item.aaaaaaaaaaaaaaaa' },
      { name: 'A apple', level: 1, uuid: 'Compendium.example.Item.bbbbbbbbbbbbbbbb' }
    ],
    srdProfiles: []
  });

  assert.deepEqual(document.pages[0].system.spells, [
    'Compendium.example.Item.bbbbbbbbbbbbbbbb',
    'Compendium.example.Item.aaaaaaaaaaaaaaaa'
  ]);
});

test('module registers the native Vessel spell list with a dnd5e table-of-contents pack', () => {
  const module = JSON.parse(readFileSync(modulePath, 'utf8'));
  const pack = module.packs.find(candidate => candidate.name === 'vessel-spell-lists');
  const source = yaml.load(readFileSync(sourcePath, 'utf8'));
  const page = source.pages[0];
  const pageUuid = `Compendium.declan-homebrew-classes.vessel-spell-lists.JournalEntry.${source._id}.JournalEntryPage.${page._id}`;

  assert.deepEqual(pack, {
    name: 'vessel-spell-lists',
    label: 'Class Spell Lists',
    path: 'packs/vessel-spell-lists',
    type: 'JournalEntry',
    system: 'dnd5e',
    flags: { dnd5e: { display: 'table-of-contents' } }
  });
  assert.ok(module.flags?.dnd5e?.spellLists.includes(pageUuid));
});

test('compiled Vessel spell-list pack preserves the registered JournalEntry page', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'vessel-spell-list-pack-'));
  const pack = join(temporary, 'pack');
  const extracted = join(temporary, 'extracted');

  try {
    cpSync(compiledPack, pack, { recursive: true });
    await extractPack(pack, extracted, { yaml: true, recursive: true });
    const documents = findYamlFiles(extracted)
      .map(path => yaml.load(readFileSync(path, 'utf8')));
    const source = yaml.load(readFileSync(sourcePath, 'utf8'));
    const compiled = documents.find(document => document?._id === source._id);

    assert.ok(compiled);
    assert.deepEqual(compiled.flags, source.flags);
    assert.deepEqual(compiled.pages, source.pages);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('compiled Vessel spell-list pack has strict source validation and no generated LOCK', async () => {
  const { verifyPack } = await import(
    new URL('../../dnd5e-pdf-importer/emit/verify.mjs', import.meta.url)
  );
  const result = await verifyPack(join(repositoryRoot, 'spell-lists-src'), {
    packName: 'vessel-spell-lists'
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(existsSync(join(compiledPack, 'LOCK')), false);
});
