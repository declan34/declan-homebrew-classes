import {
  LEADERSHIP_FLAG,
  MODULE_ID,
  WARLORD_CLASS_IDENTIFIER
} from './constants.mjs';

const LEADERSHIP_ABILITY_VALUES = new Set(['cha', 'wis', 'int']);

function documents(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  return Array.from(collection.values?.() ?? collection);
}

function rawFlag(actor, key) {
  let value = actor?.flags?.[MODULE_ID];
  for (const segment of key.split('.')) value = value?.[segment];
  return value;
}

export function getIdentifier(document) {
  const identifier = document?.identifier ?? document?.system?.identifier;
  return typeof identifier === 'string' ? identifier : undefined;
}

export function getWarlordRole(document) {
  const role = document?.flags?.[MODULE_ID]?.warlord?.role;
  return typeof role === 'string' ? role : undefined;
}

export function getWarlordLevel(actor) {
  return documents(actor?.items)
    .filter(item => item?.type === 'class' && getIdentifier(item) === WARLORD_CLASS_IDENTIFIER)
    .reduce((highestLevel, item) => {
      const level = item?.system?.levels;
      return Number.isFinite(level) && level >= 0
        ? Math.max(highestLevel, level)
        : highestLevel;
    }, 0);
}

export function getLeadershipAbility(actor) {
  const ability = actor?.getFlag?.(MODULE_ID, LEADERSHIP_FLAG)
    ?? rawFlag(actor, LEADERSHIP_FLAG);
  return LEADERSHIP_ABILITY_VALUES.has(ability) ? ability : undefined;
}

export function leadershipFormula(ability) {
  return `@abilities.${ability}.mod`;
}

export function hasTacticalSuperiority(actor) {
  return getWarlordLevel(actor) >= 11;
}

export function warlordRange(actor, base) {
  return hasTacticalSuperiority(actor) ? base * 2 : base;
}
