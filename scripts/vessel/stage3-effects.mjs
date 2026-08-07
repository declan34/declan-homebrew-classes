import {
  ARCHON_STATE_FLAG,
  AUTOMATION_ROLES,
  MODULE_ID
} from './constants.mjs';
import { isSpiritMantleActive } from './mantle.mjs';
import { serializeActorOperation } from './operations.mjs';
import { getAutomationRole, getDireGrowthBonuses } from './rules.mjs';

function documents(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  return Array.from(collection.values?.() ?? collection);
}

function identifier(item) {
  return item?.identifier ?? item?.system?.identifier;
}

function vesselFlags(document) {
  return document?.flags?.[MODULE_ID]?.vessel ?? {};
}

function archonState(actor) {
  return actor?.getFlag?.(MODULE_ID, ARCHON_STATE_FLAG)
    ?? actor?.flags?.[MODULE_ID]?.vessel?.archon?.state;
}

function isArchonActive(actor) {
  return archonState(actor)?.active === true;
}

function bindingEligible(actor, binding) {
  if (binding === 'mantle') return isSpiritMantleActive(actor);
  if (binding === 'archon') return isArchonActive(actor);
  return false;
}

function moduleEffects(actor) {
  return documents(actor?.effects).filter(effect =>
    Boolean(vesselFlags(effect).stage3Source)
  );
}

function desiredTemplates(actor) {
  const desired = new Map();
  for (const item of documents(actor?.items)) {
    const source = identifier(item);
    for (const effect of documents(item?.effects)) {
      const flags = vesselFlags(effect);
      if (
        flags.stage3Source !== source
        || !bindingEligible(actor, flags.stage3Binding)
      ) continue;
      if (
        getAutomationRole(effect) === AUTOMATION_ROLES.DIRE_STATURE_EFFECT
        && !getDireGrowthBonuses(archonState(actor)?.growthCategories).meleeDamage
      ) continue;
      desired.set(source, {item, effect});
    }
  }
  return desired;
}

function transformationMetadata(actor, effect) {
  const state = archonState(actor);
  if (effect?.flags?.[MODULE_ID]?.vessel?.stage3Binding !== 'archon') return;
  if (!state?.transformationId) return;
  return {
    transformationId: state.transformationId,
    profile: state.profile
  };
}

function direStatureData(data, actor) {
  const growth = getDireGrowthBonuses(archonState(actor)?.growthCategories);
  data.changes = data.changes.map(change => {
    if (change.key === 'system.attributes.ac.bonus') {
      return {...change, value: String(growth.acBonus)};
    }
    if (
      change.key === 'system.bonuses.mwak.damage'
      || change.key === 'system.bonuses.msak.damage'
    ) return {...change, value: growth.meleeDamage};
    return change;
  });
  data.description = `<p>Your Armor Class increases by ${growth.acBonus}, and your melee weapon and spell attacks deal ${growth.meleeDamage} bonus damage. Your melee attacks gain ${growth.reachBonus}-foot reach.</p>`;
}

function effectData(actor, item, effect) {
  const data = effect.toObject
    ? effect.toObject()
    : structuredClone(effect);
  delete data._id;
  delete data._key;
  data.origin = item.uuid;
  data.disabled = false;
  data.transfer = false;
  if (getAutomationRole(effect) === AUTOMATION_ROLES.DIRE_STATURE_EFFECT) {
    direStatureData(data, actor);
  }
  const temporary = transformationMetadata(actor, effect);
  if (temporary) {
    data.flags ??= {};
    data.flags[MODULE_ID] ??= {};
    data.flags[MODULE_ID].vessel ??= {};
    data.flags[MODULE_ID].vessel.archon ??= {};
    data.flags[MODULE_ID].vessel.archon.temporary = temporary;
  }
  return data;
}

export async function reconcileStage3EffectsUnlocked(actor) {
  const desired = desiredTemplates(actor);
  const existing = moduleEffects(actor);
  const retained = new Set();
  const remove = [];

  for (const effect of existing) {
    const source = vesselFlags(effect).stage3Source;
    if (!desired.has(source) || retained.has(source)) remove.push(effect);
    else retained.add(source);
  }

  if (remove.length) {
    const enabled = remove.filter(effect => !effect.disabled);
    if (enabled.length) {
      await actor.updateEmbeddedDocuments(
        'ActiveEffect',
        enabled.map(effect => ({_id: effect._id, disabled: true}))
      );
    }
    await actor.deleteEmbeddedDocuments(
      'ActiveEffect',
      remove.map(effect => effect._id)
    );
  }

  const create = [...desired.entries()]
    .filter(([source]) => !retained.has(source))
    .map(([, {item, effect}]) => effectData(actor, item, effect));
  if (create.length) {
    await actor.createEmbeddedDocuments('ActiveEffect', create);
  }
}

export async function reconcileStage3Effects(actor) {
  return serializeActorOperation(actor, reconcileStage3EffectsUnlocked);
}

export async function removeStage3Effects(actor, {binding} = {}) {
  return serializeActorOperation(actor, async () => {
    const effects = moduleEffects(actor).filter(effect =>
      !binding || vesselFlags(effect).stage3Binding === binding
    );
    if (!effects.length) return;
    const enabled = effects.filter(effect => !effect.disabled);
    if (enabled.length) {
      await actor.updateEmbeddedDocuments(
        'ActiveEffect',
        enabled.map(effect => ({_id: effect._id, disabled: true}))
      );
    }
    await actor.deleteEmbeddedDocuments(
      'ActiveEffect',
      effects.map(effect => effect._id)
    );
  });
}
