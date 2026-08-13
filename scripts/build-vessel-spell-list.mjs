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
const SRD_SPELL_PACK = 'dnd5e.spells';

export const APPROVED_SRD_PROFILES = Object.freeze([
  Object.freeze({ name: 'Chill Touch', level: 0, id: 'vrN18tbTw7io5MWd' }),
  Object.freeze({ name: 'Dancing Lights', level: 0, id: 'CAxSzHWizrafT033' }),
  Object.freeze({ name: 'Mage Hand', level: 0, id: 'Utk1OQRwYkMkFRD3' }),
  Object.freeze({ name: 'Message', level: 0, id: 'icZokbgV1jIMpNCv' }),
  Object.freeze({ name: 'Minor Illusion', level: 0, id: 'oIzA2MEHwxhtQneU' }),
  Object.freeze({ name: 'Thaumaturgy', level: 0, id: 'MUO1uYN7JR1hm4dR' }),
  Object.freeze({ name: 'Bane', level: 1, id: '95K2aUhAGV9qXjnf' })
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
  return yamlFiles(sourceDirectory)
    .filter(path => !path.endsWith('_folder.yml'))
    .map(path => yaml.load(readFileSync(path, 'utf8')))
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
}

export function approvedSrdProfiles() {
  return APPROVED_SRD_PROFILES.map(profile => ({
    name: profile.name,
    level: profile.level,
    uuid: `Compendium.${SRD_SPELL_PACK}.Item.${profile.id}`
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

export function buildVesselSpellListDocument({
  homebrewProfiles,
  srdProfiles = approvedSrdProfiles()
} = {}) {
  if (!Array.isArray(homebrewProfiles) || !Array.isArray(srdProfiles)) {
    throw new TypeError('Vessel spell-list profiles must be arrays.');
  }

  const profiles = validateAndSortProfiles([...homebrewProfiles, ...srdProfiles]);
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
        unlinkedSpells: []
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
