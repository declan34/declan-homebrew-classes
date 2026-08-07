import { isSpiritMantleActive } from './mantle.mjs';

function documents(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  return Array.from(collection.values?.() ?? collection);
}

function isOwnedUncannyStrength(item) {
  const identifier = item?.identifier ?? item?.system?.identifier;
  return item?.isOwner && identifier === 'uncanny-strength';
}

/**
 * Apply Uncanny Strength's Charisma substitution to dnd5e's pending skill-roll
 * configuration, while leaving dnd5e to perform the dialog and final roll.
 */
export function prepareUncannyAthleticsRoll(config, actor, skillId) {
  if (
    skillId === 'ath'
    && actor?.isOwner
    && isSpiritMantleActive(actor)
    && documents(actor.items).some(isOwnedUncannyStrength)
  ) {
    config.ability = 'cha';
  }
  return true;
}
