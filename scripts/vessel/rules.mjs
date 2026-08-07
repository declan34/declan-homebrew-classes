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

export const STAGE3_ACTIVITY_ROLES = new Set([
  AUTOMATION_ROLES.ARCANE_BLAST,
  AUTOMATION_ROLES.ASTRAL_STEP,
  AUTOMATION_ROLES.BLUSTER,
  AUTOMATION_ROLES.CATACLYSMIC_ERUPTION,
  AUTOMATION_ROLES.FRENZY,
  AUTOMATION_ROLES.INFERNAL_DRAIN,
  AUTOMATION_ROLES.DIVINE_WRATH,
  AUTOMATION_ROLES.DIVINE_WARD,
  AUTOMATION_ROLES.CONDEMNATION,
  AUTOMATION_ROLES.PSEUDOPOD_STRIKE,
  AUTOMATION_ROLES.STICKY_SLIME,
  AUTOMATION_ROLES.STICKY_SLIME_ESCAPE,
  AUTOMATION_ROLES.DRAIN_VITALITY,
  AUTOMATION_ROLES.DRAIN_VITALITY_RECOVERY,
  AUTOMATION_ROLES.JUXTAPOSE,
  AUTOMATION_ROLES.STOLEN_MEMORY,
  AUTOMATION_ROLES.AETHER_WINGS,
  AUTOMATION_ROLES.OPALESCENT_ARMOR,
  AUTOMATION_ROLES.PERILOUS_VISAGE,
  AUTOMATION_ROLES.OTHERWORLDLY_MAW,
  AUTOMATION_ROLES.OTHERWORLDLY_MAW_RECOVERY,
  AUTOMATION_ROLES.PRIMORDIAL_BULWARK,
  AUTOMATION_ROLES.PRIMORDIAL_BULWARK_HARDEN,
  AUTOMATION_ROLES.TWILIGHT_STEPS,
  AUTOMATION_ROLES.SHIMMERING_LANCE,
  AUTOMATION_ROLES.DAZZLING_LANCE,
  AUTOMATION_ROLES.DAZZLING_ERUPTION,
  AUTOMATION_ROLES.SUNDERING_STRIKE,
  AUTOMATION_ROLES.VEXING_STRIKE
]);

const MANTLE_BOUND_STAGE3_ROLES = new Set([
  AUTOMATION_ROLES.DIVINE_WRATH,
  AUTOMATION_ROLES.AETHER_WINGS,
  AUTOMATION_ROLES.OPALESCENT_ARMOR,
  AUTOMATION_ROLES.SHIMMERING_LANCE,
  AUTOMATION_ROLES.DAZZLING_LANCE,
  AUTOMATION_ROLES.DAZZLING_ERUPTION,
  AUTOMATION_ROLES.SUNDERING_STRIKE,
  AUTOMATION_ROLES.VEXING_STRIKE
]);

const ARCHON_BOUND_STAGE3_ROLES = new Set([
  AUTOMATION_ROLES.ARCANE_BLAST,
  AUTOMATION_ROLES.ASTRAL_STEP,
  AUTOMATION_ROLES.BLUSTER,
  AUTOMATION_ROLES.FRENZY,
  AUTOMATION_ROLES.INFERNAL_DRAIN,
  AUTOMATION_ROLES.DIVINE_WARD,
  AUTOMATION_ROLES.CONDEMNATION,
  AUTOMATION_ROLES.PSEUDOPOD_STRIKE,
  AUTOMATION_ROLES.STICKY_SLIME,
  AUTOMATION_ROLES.STICKY_SLIME_ESCAPE,
  AUTOMATION_ROLES.DRAIN_VITALITY,
  AUTOMATION_ROLES.DRAIN_VITALITY_RECOVERY,
  AUTOMATION_ROLES.JUXTAPOSE,
  AUTOMATION_ROLES.STOLEN_MEMORY,
  AUTOMATION_ROLES.PERILOUS_VISAGE,
  AUTOMATION_ROLES.OTHERWORLDLY_MAW,
  AUTOMATION_ROLES.OTHERWORLDLY_MAW_RECOVERY,
  AUTOMATION_ROLES.PRIMORDIAL_BULWARK,
  AUTOMATION_ROLES.PRIMORDIAL_BULWARK_HARDEN
]);

const DRAIN_VITALITY_DICE = Object.freeze([
  [20, 6],
  [17, 5],
  [13, 4],
  [9, 3],
  [1, 2]
]);

const DAZZLING_LANCE_DICE = Object.freeze([
  [17, 8],
  [13, 7],
  [1, 6]
]);

const WORN_ARMOR_TYPES = new Set(['light', 'medium', 'heavy', 'shield']);
const DIRE_STATURE_IDENTIFIER = 'dire-stature';
const COLOSSAL_ARCHON_IDENTIFIER = 'colossal-archon';

const DIRE_GROWTH_BONUSES = Object.freeze([
  Object.freeze({
    size: undefined,
    width: undefined,
    height: undefined,
    acBonus: 0,
    meleeDamage: undefined,
    reachBonus: 0
  }),
  Object.freeze({
    size: 'lg',
    width: 2,
    height: 2,
    acBonus: 1,
    meleeDamage: '1d4',
    reachBonus: 5
  }),
  Object.freeze({
    size: 'huge',
    width: 3,
    height: 3,
    acBonus: 2,
    meleeDamage: '2d4',
    reachBonus: 10
  })
]);

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

export function getDireStatureOptions(actor) {
  const identifiers = new Set(documents(actor?.items).map(identifier));
  if (!identifiers.has(DIRE_STATURE_IDENTIFIER)) return [0];
  return identifiers.has(COLOSSAL_ARCHON_IDENTIFIER) ? [0, 1, 2] : [0, 1];
}

export function getDireGrowthBonuses(categories) {
  const normalized = Math.min(2, Math.max(0, Math.trunc(Number(categories) || 0)));
  return DIRE_GROWTH_BONUSES[normalized];
}

function levelFrom(value) {
  return typeof value === 'object' && value !== null
    ? getVesselLevel(value)
    : Math.max(0, Number(value) || 0);
}

function scaledValue(levelOrActor, table) {
  const level = levelFrom(levelOrActor);
  return table.find(([minimum]) => level >= minimum)?.[1] ?? table.at(-1)[1];
}

export function getDazzlingLanceDice(levelOrActor) {
  return scaledValue(levelOrActor, DAZZLING_LANCE_DICE);
}

export function getDrainVitalityDice(levelOrActor) {
  return scaledValue(levelOrActor, DRAIN_VITALITY_DICE);
}

export function getVesselTempHPCap(levelOrActor) {
  return 2 * levelFrom(levelOrActor);
}

export function getCataclysmAffinityDamageType(actor) {
  const affinity = actor?.getFlag?.(MODULE_ID, ELEMENTAL_AFFINITY_FLAG)
    ?? rawFlag(actor, ELEMENTAL_AFFINITY_FLAG);
  return AFFINITY_DAMAGE_TYPES[normalizeElementalAffinity(affinity)];
}

export function isMantleBoundStage3Role(role) {
  return MANTLE_BOUND_STAGE3_ROLES.has(role);
}

export function isArchonBoundStage3Role(role) {
  return ARCHON_BOUND_STAGE3_ROLES.has(role);
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
