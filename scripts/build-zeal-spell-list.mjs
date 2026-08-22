import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(
  new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url)
);
const yaml = require('js-yaml');
const MODULE_ID = 'declan-homebrew-classes';

export const ZEAL_SRD_PROFILES = Object.freeze([
  ['Light', 0, 'Bnn9Nzajixvow9xi'],
  ['Message', 0, 'icZokbgV1jIMpNCv'],
  ['Resistance', 0, 'dl8YwvMboBqX2OC4'],
  ['Sacred Flame', 0, 'n9pJzTDsAwQxJVRl'],
  ['Spare the Dying', 0, '8zT7njvqbpXs4Cel'],
  ['Thaumaturgy', 0, 'MUO1uYN7JR1hm4dR'],
  ['True Strike', 0, 'mGGlcLdggHwcL7MG'],
  ['Bless', 1, '8dzaICjGy6mTUaUr'],
  ['Command', 1, 'arzCrMRgcNiQuh43'],
  ['Cure Wounds', 1, 'uUWb1wZgtMou0TVP'],
  ['Divine Favor', 1, '8MICCMeOXT3aJUy9'],
  ['Guiding Bolt', 1, '7buEm5KhI5lP8m1z'],
  ['Heroism', 1, 'ge3Saet9zPTDyaoL'],
  ['Inflict Wounds', 1, 'ksaaTxIbKx2sJfia'],
  ['Jump', 1, 'ZrTc23tToJ0JpH2h'],
  ['Protection from Evil and Good', 1, 'xmDBqZhRVrtLP8h2'],
  ['Sanctuary', 1, 'gvdA9nPuWLck4tBl'],
  ['Searing Smite', 1, 'phbsplSearingSmi', 'spells24'],
  ['Shield of Faith', 1, 'jZ6JNykRtdQ90MOo'],
  ['Aid', 2, 'Opwh2PdX4runSBlm'],
  ['Blindness/Deafness', 2, 'zwGsAv6kmwzYGhh3'],
  ['Branding Smite', 2, '7UwUjJ6owIQkEPrs'],
  ['Darkness', 2, 'S7VbUetIfVT7B6Eq'],
  ['Find Steed', 2, '5eh2HFbS13078Y3H'],
  ['Magic Weapon', 2, 'Sgjrf8qqv97CCWM4'],
  ['Spiritual Weapon', 2, 'JbxsYXxSOTZbf9I0'],
  ['Warding Bond', 2, 'JVhKeanAXZH62DrF'],
  ['Zone of Truth', 2, 'CylBa7jR8DSbo8Z3'],
  ['Beacon of Hope', 3, 'ZU9d6woBdUP8pIPt'],
  ['Protection from Energy', 3, 'j8NtLXOOJ3GAKF8I'],
  ['Remove Curse', 3, 'XZhdgVK3cLoxNCQl'],
  ['Revivify', 3, 'LmRHHMtplpxr9fX6'],
  ['Spirit Guardians', 3, 'uCud2s4TjMfjiXUb'],
  ['Banishment', 4, 'pxpb2eOB6bv4phAf'],
  ['Aura of Life', 4, 'phbsplAuraofLife', 'spells24'],
  ['Death Ward', 4, 'VtCXMdyM6mAdIJZb'],
  ['Guardian of Faith', 4, 'TgHsuhNasPbhu8MO']
].map(([name, level, id, pack = 'spells']) => Object.freeze({
  name, level, uuid: `Compendium.dnd5e.${pack}.Item.${id}`
})));

export const ZEAL_UNLINKED_STANDARD_PROFILES = Object.freeze([
  ['Blade Ward', 0, "Player's Handbook"],
  ['Toll the Dead', 0, "Xanathar's Guide to Everything"],
  ['Compelled Duel', 1, "Player's Handbook"],
  ['Thunderous Smite', 1, "Player's Handbook"],
  ['Wrathful Smite', 1, "Player's Handbook"],
  ['Aura of Vitality', 3, "Player's Handbook"],
  ['Blinding Smite', 3, "Player's Handbook"],
  ["Crusader's Mantle", 3, "Player's Handbook"],
  ['Aura of Purity', 4, "Player's Handbook"],
  ['Staggering Smite', 4, "Player's Handbook"]
].map(([name, level, source]) => Object.freeze({ name, level, source })));

export function normalizeSpellName(name) {
  return String(name ?? '').normalize('NFC').trim().replace(/\s+/gu, ' ')
    .toLocaleLowerCase('en-US');
}

export function stableId(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export function buildZealSpellListDocument({
  linkedProfiles = ZEAL_SRD_PROFILES,
  unlinkedProfiles = ZEAL_UNLINKED_STANDARD_PROFILES
} = {}) {
  if (!Array.isArray(linkedProfiles) || !Array.isArray(unlinkedProfiles)) {
    throw new TypeError('Zeal spell-list profiles must be arrays.');
  }
  const names = new Set();
  for (const profile of [...linkedProfiles, ...unlinkedProfiles]) {
    const normalized = normalizeSpellName(profile?.name);
    if (!normalized || names.has(normalized)) {
      throw new Error(`Duplicate normalized spell name: ${normalized}`);
    }
    names.add(normalized);
  }
  const linked = [...linkedProfiles].sort((a, b) => a.level - b.level
    || normalizeSpellName(a.name).localeCompare(normalizeSpellName(b.name), 'en-US'));
  const unlinked = [...unlinkedProfiles].sort((a, b) => a.level - b.level
    || normalizeSpellName(a.name).localeCompare(normalizeSpellName(b.name), 'en-US'))
    .map(profile => {
      const normalized = normalizeSpellName(profile.name);
      return {
        _id: stableId(`${MODULE_ID}:zeal-unlinked:${normalized}`),
        identifier: normalized.replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, ''),
        name: profile.name,
        system: { level: profile.level, school: '' },
        source: { custom: profile.source }
      };
    });
  const entryId = stableId(`${MODULE_ID}:zeal-spell-list:entry`);
  const pageId = stableId(`${MODULE_ID}:zeal-spell-list:page`);
  return {
    _id: entryId,
    name: 'Zeal Spell List',
    flags: { dnd5e: { type: 'chapter', showPages: true } },
    pages: [{
      _id: pageId,
      name: 'Zeal Spells',
      type: 'spells',
      sort: 0,
      system: {
        identifier: 'academy-of-zeal',
        type: 'subclass',
        grouping: 'level',
        description: { value: '' },
        spells: linked.map(profile => profile.uuid),
        unlinkedSpells: unlinked
      },
      _key: `!journal.pages!${entryId}.${pageId}`
    }],
    _key: `!journal!${entryId}`
  };
}

export function buildZealSpellList(outputPath) {
  const document = buildZealSpellListDocument();
  writeFileSync(outputPath, yaml.dump(document, { lineWidth: -1 }));
  return document;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildZealSpellList(join(scriptDirectory, '..', 'spell-lists-src', 'zeal-spells.yml'));
}
