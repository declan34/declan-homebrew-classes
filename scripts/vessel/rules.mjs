import {
  AUTOMATION_ROLES,
  ELEMENTAL_AFFINITY_FLAG,
  MODULE_ID,
  VESSEL_CLASS_IDENTIFIER
} from './constants.mjs';

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
