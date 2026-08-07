import {
  ELEMENTAL_AFFINITY_FLAG,
  MODULE_ID
} from './constants.mjs';
import { getVesselSubclassIdentifier } from './rules.mjs';

const VESSEL_SUBCLASSES = new Set([
  'the-ascended',
  'the-cataclysm',
  'the-cursed',
  'the-fallen',
  'the-formless',
  'the-trickster'
]);

const ELEMENTAL_AFFINITIES = new Set(['air', 'earth', 'fire', 'water']);

function normalizedName(name) {
  return String(name ?? '')
    .normalize('NFC')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/(^-|-$)/gu, '');
}

function stableKey(subclass, vesselLevel, name, affinity) {
  const subclassKey = subclass.replace(/^the-/u, '');
  const affinityKey = affinity ? `-${affinity}` : '';
  return `${subclassKey}${affinityKey}-${vesselLevel}-${normalizedName(name)}`;
}

function nonBlankString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function manifestEntry(subclass, vesselLevel, name, affinity) {
  return {
    key: stableKey(subclass, vesselLevel, name, affinity),
    name,
    subclass,
    vesselLevel,
    ...(affinity ? { affinity } : {})
  };
}

/**
 * Validates and freezes content-light Sealed Magic entries.
 *
 * This is exported so future manifest revisions can be validated independently
 * before they are used for actor reconciliation.
 */
export function validateSealedMagicEntries(entries) {
  if (!Array.isArray(entries)) {
    throw new TypeError('Sealed Magic entries must be an array.');
  }

  const keys = new Set();
  const identities = new Set();

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      throw new TypeError('A Sealed Magic entry is required.');
    }
    if (!nonBlankString(entry.name)) {
      throw new TypeError('A Sealed Magic entry requires a non-blank name.');
    }
    if (!VESSEL_SUBCLASSES.has(entry.subclass)) {
      throw new TypeError('A Sealed Magic entry requires a valid Vessel subclass.');
    }
    if (!Number.isInteger(entry.vesselLevel) || entry.vesselLevel < 1 || entry.vesselLevel > 20) {
      throw new TypeError('A Sealed Magic entry requires a Vessel level from 1 to 20.');
    }
    if (entry.affinity !== undefined && !ELEMENTAL_AFFINITIES.has(entry.affinity)) {
      throw new TypeError('A Sealed Magic entry requires a known elemental affinity.');
    }
    if (entry.affinity && entry.subclass !== 'the-cataclysm') {
      throw new TypeError('Only Cataclysm Sealed Magic entries may have an elemental affinity.');
    }

    if (keys.has(entry.key)) {
      throw new TypeError(`Sealed Magic entries contain a duplicate key: "${entry.key}".`);
    }

    const identity = [
      entry.subclass,
      entry.affinity ?? '',
      entry.vesselLevel,
      normalizedName(entry.name)
    ].join('|');
    if (identities.has(identity)) {
      throw new TypeError('Sealed Magic entries contain a duplicate subclass, affinity, level, and normalized-name entry.');
    }

    keys.add(entry.key);
    identities.add(identity);

    const expectedKey = stableKey(entry.subclass, entry.vesselLevel, entry.name, entry.affinity);
    if (entry.key !== expectedKey) {
      throw new TypeError(`A Sealed Magic entry key must be "${expectedKey}".`);
    }
  }

  return Object.freeze(entries.map(entry => Object.freeze({ ...entry })));
}

const entries = [
  manifestEntry('the-ascended', 3, 'Identify'),
  manifestEntry('the-ascended', 3, 'Shield'),
  manifestEntry('the-ascended', 5, 'Locate Creature'),
  manifestEntry('the-ascended', 5, 'Invisibility'),
  manifestEntry('the-ascended', 9, 'Counterspell'),
  manifestEntry('the-ascended', 9, 'Minute Meteors'),
  manifestEntry('the-ascended', 13, 'Divination'),
  manifestEntry('the-ascended', 13, 'Resilient Sphere'),
  manifestEntry('the-ascended', 17, 'Arcane Hand'),
  manifestEntry('the-ascended', 17, 'Commune'),

  manifestEntry('the-cataclysm', 3, 'Absorb Elements'),
  manifestEntry('the-cataclysm', 5, 'Elemental Blade'),
  manifestEntry('the-cataclysm', 9, 'Elemental Bane'),
  manifestEntry('the-cataclysm', 13, 'Resilient Sphere'),
  manifestEntry('the-cataclysm', 17, 'Far Step'),
  manifestEntry('the-cataclysm', 3, 'Beckon Air', 'air'),
  manifestEntry('the-cataclysm', 3, 'Thunderwave', 'air'),
  manifestEntry('the-cataclysm', 5, 'Dust Devil', 'air'),
  manifestEntry('the-cataclysm', 9, 'Sonic Wave', 'air'),
  manifestEntry('the-cataclysm', 13, 'Storm Sphere', 'air'),
  manifestEntry('the-cataclysm', 17, 'Control Winds', 'air'),
  manifestEntry('the-cataclysm', 3, 'Mold Earth', 'earth'),
  manifestEntry('the-cataclysm', 3, 'Earth Tremor', 'earth'),
  manifestEntry('the-cataclysm', 5, 'Spike Growth', 'earth'),
  manifestEntry('the-cataclysm', 9, 'Erupting Earth', 'earth'),
  manifestEntry('the-cataclysm', 13, 'Pillars of Earth', 'earth'),
  manifestEntry('the-cataclysm', 17, 'Wall of Stone', 'earth'),
  manifestEntry('the-cataclysm', 3, 'Control Flame', 'fire'),
  manifestEntry('the-cataclysm', 3, 'Hellish Rebuke', 'fire'),
  manifestEntry('the-cataclysm', 5, 'Flaming Sphere', 'fire'),
  manifestEntry('the-cataclysm', 5, 'Misty Step', 'fire'),
  manifestEntry('the-cataclysm', 9, 'Fireball', 'fire'),
  manifestEntry('the-cataclysm', 13, 'Wall of Fire', 'fire'),
  manifestEntry('the-cataclysm', 17, 'Flame Strike', 'fire'),
  manifestEntry('the-cataclysm', 3, 'Shape Water', 'water'),
  manifestEntry('the-cataclysm', 3, 'Torrent', 'water'),
  manifestEntry('the-cataclysm', 5, 'Misty Step', 'water'),
  manifestEntry('the-cataclysm', 9, 'Tidal Wave', 'water'),
  manifestEntry('the-cataclysm', 13, 'Watery Sphere', 'water'),
  manifestEntry('the-cataclysm', 17, 'Maelstrom', 'water'),

  manifestEntry('the-cursed', 3, 'Hellish Rebuke'),
  manifestEntry('the-cursed', 3, 'Jump'),
  manifestEntry('the-cursed', 5, 'Flame Whip'),
  manifestEntry('the-cursed', 5, 'Scorching Ray'),
  manifestEntry('the-cursed', 9, 'Fireball'),
  manifestEntry('the-cursed', 9, 'Haste'),
  manifestEntry('the-cursed', 13, 'Dominate Creature'),
  manifestEntry('the-cursed', 13, 'Wall of Fire'),
  manifestEntry('the-cursed', 17, 'Destructive Wave'),
  manifestEntry('the-cursed', 17, 'Insect Plague'),

  manifestEntry('the-fallen', 3, 'Divine Favor'),
  manifestEntry('the-fallen', 3, 'Ethereal Anchor'),
  manifestEntry('the-fallen', 5, 'Branding Smite'),
  manifestEntry('the-fallen', 5, 'Spiritual Weapon'),
  manifestEntry('the-fallen', 9, "Crusader's Mantle"),
  manifestEntry('the-fallen', 9, 'Revivify'),
  manifestEntry('the-fallen', 13, 'Banishment'),
  manifestEntry('the-fallen', 13, 'Guardian of Faith'),
  manifestEntry('the-fallen', 17, 'Circle of Power'),
  manifestEntry('the-fallen', 17, 'Flame Strike'),

  manifestEntry('the-formless', 3, 'Caustic Brew'),
  manifestEntry('the-formless', 3, 'Entangle'),
  manifestEntry('the-formless', 5, 'Hold Person'),
  manifestEntry('the-formless', 5, 'Web'),
  manifestEntry('the-formless', 9, 'Grasping Vine'),
  manifestEntry('the-formless', 9, 'Slow'),
  manifestEntry('the-formless', 13, 'Eldritch Tentacles'),
  manifestEntry('the-formless', 13, 'Vitriolic Sphere'),
  manifestEntry('the-formless', 17, 'Contagion'),
  manifestEntry('the-formless', 17, 'Hold Monster'),

  manifestEntry('the-trickster', 3, 'Charm Person'),
  manifestEntry('the-trickster', 3, 'Disguise Self'),
  manifestEntry('the-trickster', 5, 'Invisibility'),
  manifestEntry('the-trickster', 5, 'Misty Step'),
  manifestEntry('the-trickster', 9, 'Enemies Abound'),
  manifestEntry('the-trickster', 9, 'Hypnotic Pattern'),
  manifestEntry('the-trickster', 13, 'Charm Monster'),
  manifestEntry('the-trickster', 13, 'Dimension Door'),
  manifestEntry('the-trickster', 17, 'Dream'),
  manifestEntry('the-trickster', 17, 'Mislead')
];

export const SEALED_MAGIC_ENTRIES = validateSealedMagicEntries(entries);

function affinityForActor(actor) {
  const flagged = actor?.getFlag?.(MODULE_ID, ELEMENTAL_AFFINITY_FLAG);
  if (flagged !== undefined) return flagged;

  return actor?.flags?.[MODULE_ID]?.vessel?.elementalAffinity;
}

export function sealedMagicEntriesForActor(actor) {
  const subclass = getVesselSubclassIdentifier(actor);
  if (!subclass) return [];

  const affinity = affinityForActor(actor);
  return SEALED_MAGIC_ENTRIES.filter(entry => entry.subclass === subclass
    && (!entry.affinity || entry.affinity === affinity));
}
