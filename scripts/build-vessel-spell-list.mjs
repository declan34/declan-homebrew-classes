import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(
  new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url)
);
const yaml = require('js-yaml');

const MODULE_ID = 'declan-homebrew-classes';
const HOMEBREW_SPELL_PACK = `${MODULE_ID}.homebrew-spells`;

export const APPROVED_SRD_PROFILES = Object.freeze([
  Object.freeze({ name: 'Chill Touch', level: 0, id: 'vrN18tbTw7io5MWd' }),
  Object.freeze({ name: 'Dancing Lights', level: 0, id: 'CAxSzHWizrafT033' }),
  Object.freeze({ name: 'Mage Hand', level: 0, id: 'Utk1OQRwYkMkFRD3' }),
  Object.freeze({ name: 'Message', level: 0, id: 'icZokbgV1jIMpNCv' }),
  Object.freeze({ name: 'Minor Illusion', level: 0, id: 'oIzA2MEHwxhtQneU' }),
  Object.freeze({ name: 'Thaumaturgy', level: 0, id: 'MUO1uYN7JR1hm4dR' }),
  Object.freeze({ name: 'Bane', level: 1, id: '95K2aUhAGV9qXjnf' }),
  Object.freeze({ name: 'Jump', level: 1, id: 'ZrTc23tToJ0JpH2h' }),
  Object.freeze({
    name: 'Ensnaring Strike', level: 1, id: 'phbsplEnsnaringS', pack: 'spells24'
  }),
  Object.freeze({ name: 'Death Ward', level: 4, id: 'VtCXMdyM6mAdIJZb' }),
  Object.freeze({ name: 'Polymorph', level: 4, id: '04nMsTWkIFvkbXlY' })
]);

export const APPROVED_HOMEBREW_NAMES = Object.freeze([
  'Dire Wail (LL)',
  'Eldritch Tentacles (LL)',
  'Ethereal Anchor (LL)',
  'Flame Whip (LL)',
  'Glitterbeam (LL)',
  'Otherworldly Grasp (LL)',
  'Spectral Passage (LL)',
  'Spiritual Sundering (LL)'
]);

export const VESSEL_UNLINKED_STANDARD_PROFILES = Object.freeze([
  Object.freeze({ name: 'Friends', level: 0, source: "Player's Handbook" }),
  Object.freeze({ name: 'Witch Bolt', level: 1, source: "Player's Handbook" }),
  Object.freeze({ name: 'Hunger of Hadar', level: 3, source: "Player's Handbook" })
]);

export function normalizeSpellName(name) {
  return String(name ?? '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('en-US');
}

export function stableId(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function yamlFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap(entry => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return yamlFiles(path);
      return entry.isFile() && /\.ya?ml$/u.test(entry.name) ? [path] : [];
    })
    .sort((first, second) => first.localeCompare(second, 'en-US'));
}

export function readHomebrewSpellProfiles(sourceDirectory) {
  const approved = new Set(APPROVED_HOMEBREW_NAMES.map(normalizeSpellName));
  const profiles = yamlFiles(sourceDirectory)
    .filter(path => !path.endsWith('_folder.yml'))
    .map(path => yaml.load(readFileSync(path, 'utf8')))
    .filter(document => approved.has(normalizeSpellName(document?.name)))
    .map(document => {
      if (document?.type !== 'spell' || !document?._id || !document?.name
        || !Number.isInteger(document?.system?.level)) {
        throw new TypeError(`Expected spell source document in ${sourceDirectory}.`);
      }
      return {
        name: document.name,
        level: document.system.level,
        uuid: `Compendium.${HOMEBREW_SPELL_PACK}.Item.${document._id}`
      };
    });
  const found = new Set(profiles.map(profile => normalizeSpellName(profile.name)));
  const missing = [...approved].filter(name => !found.has(name));
  if (missing.length) {
    throw new Error(`Missing approved Vessel homebrew spell: ${missing.join(', ')}`);
  }
  return profiles;
}

export function approvedSrdProfiles() {
  return APPROVED_SRD_PROFILES.map(profile => ({
    name: profile.name,
    level: profile.level,
    uuid: `Compendium.dnd5e.${profile.pack ?? 'spells'}.Item.${profile.id}`
  }));
}

function validateAndSortProfiles(profiles) {
  const names = new Set();
  for (const profile of profiles) {
    if (!profile?.name || !Number.isInteger(profile.level) || !profile?.uuid) {
      throw new TypeError('Each Vessel spell profile requires name, level, and UUID.');
    }
    const normalizedName = normalizeSpellName(profile.name);
    if (!normalizedName || names.has(normalizedName)) {
      throw new Error(`Duplicate normalized spell name: ${normalizedName}`);
    }
    names.add(normalizedName);
  }
  return [...profiles].sort((first, second) => first.level - second.level
    || normalizeSpellName(first.name).localeCompare(normalizeSpellName(second.name), 'en-US'));
}

function buildUnlinkedProfiles(profiles, linkedProfiles) {
  const names = new Set(linkedProfiles.map(profile => normalizeSpellName(profile.name)));
  return profiles.map(profile => {
    const normalizedName = normalizeSpellName(profile.name);
    if (!normalizedName || names.has(normalizedName)) {
      throw new Error(`Duplicate normalized spell name: ${normalizedName}`);
    }
    names.add(normalizedName);
    return {
      _id: stableId(`declan-homebrew-classes:vessel-unlinked:${normalizedName}`),
      identifier: normalizedName.replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, ''),
      name: profile.name,
      system: { level: profile.level, school: '' },
      source: { custom: profile.source }
    };
  }).sort((first, second) => first.system.level - second.system.level
    || normalizeSpellName(first.name).localeCompare(normalizeSpellName(second.name), 'en-US'));
}

export function buildVesselSpellListDocument({
  homebrewProfiles,
  srdProfiles = approvedSrdProfiles(),
  unlinkedProfiles = VESSEL_UNLINKED_STANDARD_PROFILES
} = {}) {
  if (!Array.isArray(homebrewProfiles) || !Array.isArray(srdProfiles)
      || !Array.isArray(unlinkedProfiles)) {
    throw new TypeError('Vessel spell-list profiles must be arrays.');
  }

  const profiles = validateAndSortProfiles([...homebrewProfiles, ...srdProfiles]);
  const unlinked = buildUnlinkedProfiles(unlinkedProfiles, profiles);
  const entryId = stableId('declan-homebrew-classes:vessel-spell-list:entry');
  const pageId = stableId('declan-homebrew-classes:vessel-spell-list:page');

  return {
    _id: entryId,
    name: 'Vessel Spell List',
    flags: {
      dnd5e: { type: 'chapter', showPages: true }
    },
    pages: [{
      _id: pageId,
      name: 'Vessel Spells',
      type: 'spells',
      sort: 0,
      system: {
        identifier: 'vessel',
        type: 'class',
        grouping: 'level',
        description: { value: '' },
        spells: profiles.map(profile => profile.uuid),
        unlinkedSpells: unlinked
      },
      _key: `!journal.pages!${entryId}.${pageId}`
    }],
    _key: `!journal!${entryId}`
  };
}

export function buildVesselSpellList({
  sourceDirectory,
  outputPath
} = {}) {
  if (!sourceDirectory || !outputPath) {
    throw new TypeError('sourceDirectory and outputPath are required.');
  }
  const document = buildVesselSpellListDocument({
    homebrewProfiles: readHomebrewSpellProfiles(sourceDirectory)
  });
  writeFileSync(outputPath, yaml.dump(document, { lineWidth: -1 }));
  return document;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(scriptDirectory, '..');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildVesselSpellList({
    sourceDirectory: join(repositoryRoot, 'spells-src'),
    outputPath: join(repositoryRoot, 'spell-lists-src', 'vessel-spells.yml')
  });
}
