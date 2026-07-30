import {
  ARCHON_PROFILE_PACK,
  AUTOMATION_ROLES,
  ELEMENTAL_AFFINITY_FLAG,
  MODULE_ID,
  VESSEL_CLASS_IDENTIFIER
} from './constants.mjs';

const profile = (profile, actorId, subclass, acBonus, affinity) => Object.freeze({
  profile,
  actorId,
  uuid: `Compendium.${ARCHON_PROFILE_PACK}.Actor.${actorId}`,
  subclass,
  ...(affinity ? { affinity } : {}),
  acBonus
});

export const ARCHON_PROFILES = Object.freeze({
  ascended: profile('ascended', 'hbrAscArchon0001', 'the-ascended', 0),
  'cataclysm-air': profile(
    'cataclysm-air', 'hbrAirArchon0001', 'the-cataclysm', 0, 'air'
  ),
  'cataclysm-earth': profile(
    'cataclysm-earth', 'hbrErtArchon0001', 'the-cataclysm', 2, 'earth'
  ),
  'cataclysm-fire': profile(
    'cataclysm-fire', 'hbrFirArchon0001', 'the-cataclysm', 0, 'fire'
  ),
  'cataclysm-water': profile(
    'cataclysm-water', 'hbrWatArchon0001', 'the-cataclysm', 0, 'water'
  ),
  cursed: profile('cursed', 'hbrCurArchon0001', 'the-cursed', 1),
  fallen: profile('fallen', 'hbrFalArchon0001', 'the-fallen', 2),
  formless: profile('formless', 'hbrForArchon0001', 'the-formless', 1),
  trickster: profile('trickster', 'hbrTriArchon0001', 'the-trickster', 0)
});

export const ARCHON_TRANSFORM_SETTINGS = Object.freeze({
  effects: Object.freeze(['origin', 'otherOrigin', 'background', 'class', 'feat', 'spell']),
  keep: Object.freeze([
    'physical', 'mental', 'gearProf', 'class', 'feats', 'spells', 'bio', 'hp'
  ]),
  merge: Object.freeze(['saves', 'skills']),
  minimumAC: '',
  other: Object.freeze([]),
  preset: null,
  spellLists: Object.freeze([]),
  tempFormula: '2 * @classes.vessel.levels',
  transformTokens: true
});

const VESSEL_SUBCLASSES = new Set(
  Object.values(ARCHON_PROFILES).map(candidate => candidate.subclass)
);

const STRIKE_DICE = Object.freeze([
  [17, 'd12'],
  [11, 'd10'],
  [5, 'd8'],
  [1, 'd6']
]);

const FEATURE_DAMAGE_TYPES = Object.freeze({
  'cursed-magic': 'fire',
  'formless-magic': 'acid',
  'trickster-magic': 'psychic'
});

const AFFINITY_DAMAGE_TYPES = Object.freeze({
  air: 'thunder',
  earth: 'bludgeoning',
  fire: 'fire',
  water: 'cold'
});

const WORN_ARMOR_TYPES = new Set(['light', 'medium', 'heavy', 'shield']);

function documents(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  return Array.from(collection.values?.() ?? collection);
}

function identifier(item) {
  return item?.identifier ?? item?.system?.identifier;
}

function rawFlag(actor, key) {
  const segments = key.split('.');
  let value = actor?.flags?.[MODULE_ID];
  for (const segment of segments) value = value?.[segment];
  return value;
}

export function getAutomationRole(document) {
  return document?.flags?.[MODULE_ID]?.vessel?.role;
}

export function getVesselLevel(actor) {
  const classItem = actor?.classes?.[VESSEL_CLASS_IDENTIFIER]
    ?? documents(actor?.items).find(candidate =>
      candidate?.type === 'class'
      && identifier(candidate) === VESSEL_CLASS_IDENTIFIER
    );
  return Math.max(0, Number(classItem?.system?.levels) || 0);
}

function levelFrom(value) {
  return typeof value === 'object' && value !== null
    ? getVesselLevel(value)
    : Math.max(0, Number(value) || 0);
}

export function getVesselSubclassIdentifier(actor) {
  return documents(actor?.itemTypes?.subclass ?? actor?.items)
    .filter(candidate => candidate?.type === 'subclass')
    .map(identifier)
    .find(candidate => VESSEL_SUBCLASSES.has(candidate));
}

export function normalizeElementalAffinity(value) {
  const normalized = String(value?.value ?? value ?? '').trim().toLowerCase();
  return Object.hasOwn(AFFINITY_DAMAGE_TYPES, normalized)
    ? normalized
    : undefined;
}

export function getAllowedArchonProfilesForActor(actor) {
  const subclass = getVesselSubclassIdentifier(actor);
  return Object.values(ARCHON_PROFILES)
    .filter(candidate => candidate.subclass === subclass);
}

export function getArchonProfilesForActor(actor) {
  const allowed = getAllowedArchonProfilesForActor(actor);
  if (allowed[0]?.subclass !== 'the-cataclysm') return allowed;

  const affinity = normalizeElementalAffinity(
    actor?.getFlag?.(MODULE_ID, ELEMENTAL_AFFINITY_FLAG)
      ?? rawFlag(actor, ELEMENTAL_AFFINITY_FLAG)
  );
  return affinity
    ? allowed.filter(candidate => candidate.affinity === affinity)
    : allowed;
}

export function selectArchonProfile(actor, requestedProfile) {
  const allowed = getAllowedArchonProfilesForActor(actor);
  const explicit = ARCHON_PROFILES[requestedProfile];
  if (explicit && allowed.includes(explicit)) return explicit;

  const preferred = getArchonProfilesForActor(actor);
  return preferred.length === 1 ? preferred[0] : undefined;
}

export function getArchonDurationSeconds(levelOrActor) {
  return levelFrom(levelOrActor) >= 7 ? 3600 : 600;
}

export function shouldEndArchonFormForUnconscious(levelOrActor) {
  return levelFrom(levelOrActor) < 7;
}

export function shouldEndArchonFormAtZeroHP(hp) {
  const value = Number(hp);
  return Number.isFinite(value) && value <= 0;
}

export function getArchonTempHP(levelOrActor) {
  return 2 * levelFrom(levelOrActor);
}

export function getArchonACBonus(profileIdOrData) {
  const profileData = typeof profileIdOrData === 'string'
    ? ARCHON_PROFILES[profileIdOrData]
    : profileIdOrData;
  return Math.max(0, Number(profileData?.acBonus) || 0);
}

export function getArchonTransformSettings() {
  return {
    ...ARCHON_TRANSFORM_SETTINGS,
    effects: [...ARCHON_TRANSFORM_SETTINGS.effects],
    keep: [...ARCHON_TRANSFORM_SETTINGS.keep],
    merge: [...ARCHON_TRANSFORM_SETTINGS.merge],
    other: [],
    spellLists: []
  };
}

export function getIridescentStrikeDie(level) {
  const vesselLevel = Math.max(1, Number(level) || 1);
  return STRIKE_DICE.find(([minimum]) => vesselLevel >= minimum)[1];
}

export function getUnlockedIridescentDamageTypes(actor) {
  const identifiers = new Set(documents(actor?.items).map(identifier));
  const types = ['radiant'];

  for (const [feature, damageType] of Object.entries(FEATURE_DAMAGE_TYPES)) {
    if (identifiers.has(feature) && !types.includes(damageType)) types.push(damageType);
  }

  if (identifiers.has('cataclysm-magic')) {
    const affinity = actor?.getFlag?.(MODULE_ID, ELEMENTAL_AFFINITY_FLAG)
      ?? rawFlag(actor, ELEMENTAL_AFFINITY_FLAG);
    const damageType = AFFINITY_DAMAGE_TYPES[affinity];
    if (damageType && !types.includes(damageType)) types.push(damageType);
  }

  return types;
}

export function isEtherealArmorEligible(actor) {
  return !documents(actor?.itemTypes?.equipment).some(item =>
    item?.system?.equipped && WORN_ARMOR_TYPES.has(item?.system?.type?.value)
  );
}

export { AUTOMATION_ROLES };
