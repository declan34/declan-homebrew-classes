import {
  AUTOMATION_ROLES,
  MANTLE_ACTIVE_FLAG,
  MODULE_ID
} from './constants.mjs';
import {
  getAutomationRole,
  isEtherealArmorEligible
} from './rules.mjs';

function mantleEffects(actor) {
  return Array.from(actor?.effects ?? []).filter(
    effect => getAutomationRole(effect) === AUTOMATION_ROLES.MANTLE_AC
  );
}

function requireOwner(actor) {
  if (!actor?.isOwner) {
    throw new Error('You do not have permission to update this Vessel.');
  }
}

function effectTemplate(sourceItem) {
  const template = Array.from(sourceItem?.effects ?? []).find(
    effect => getAutomationRole(effect) === AUTOMATION_ROLES.MANTLE_AC
  );
  if (!template) throw new Error('Spirit Mantle is missing its Ethereal Armor effect.');

  const data = template.toObject();
  delete data._id;
  delete data._key;
  data.origin = sourceItem.uuid;
  return data;
}

export function isSpiritMantleActive(actor) {
  return actor?.getFlag?.(MODULE_ID, MANTLE_ACTIVE_FLAG) === true
    || actor?.flags?.[MODULE_ID]?.vessel?.mantle?.active === true;
}

export async function reconcileSpiritMantle(actor, { sourceItem } = {}) {
  requireOwner(actor);
  const active = isSpiritMantleActive(actor);
  const existing = mantleEffects(actor);

  if (!active) {
    const enabled = existing.filter(effect => !effect.disabled);
    if (enabled.length) {
      await actor.updateEmbeddedDocuments(
        'ActiveEffect',
        enabled.map(effect => ({
          _id: effect._id,
          disabled: true
        }))
      );
    }
    if (existing.length) {
      await actor.deleteEmbeddedDocuments(
        'ActiveEffect',
        existing.map(effect => effect._id)
      );
    }
    return;
  }

  let [current, ...duplicates] = existing;
  if (!current) {
    const data = effectTemplate(sourceItem);
    data.disabled = !isEtherealArmorEligible(actor);
    [current] = await actor.createEmbeddedDocuments('ActiveEffect', [data]);
  }
  if (duplicates.length) {
    await actor.deleteEmbeddedDocuments(
      'ActiveEffect',
      duplicates.map(effect => effect._id)
    );
  }

  const disabled = !isEtherealArmorEligible(actor);
  if (current.disabled !== disabled) {
    await actor.updateEmbeddedDocuments('ActiveEffect', [{
      _id: current._id,
      disabled
    }]);
  }
}

export async function activateSpiritMantle(actor, { sourceItem } = {}) {
  requireOwner(actor);
  const wasActive = isSpiritMantleActive(actor);
  if (!wasActive) {
    await actor.setFlag(MODULE_ID, MANTLE_ACTIVE_FLAG, true);
  }
  try {
    await reconcileSpiritMantle(actor, { sourceItem });
  } catch (error) {
    if (!wasActive) {
      try {
        await deactivateSpiritMantle(actor);
      } catch {
        // Preserve the original activation failure without clearing unsafe state.
      }
    }
    throw error;
  }
}

export async function deactivateSpiritMantle(actor) {
  requireOwner(actor);
  const existing = mantleEffects(actor);
  const enabled = existing.filter(effect => !effect.disabled);
  if (enabled.length) {
    await actor.updateEmbeddedDocuments(
      'ActiveEffect',
      enabled.map(effect => ({
        _id: effect._id,
        disabled: true
      }))
    );
  }
  await actor.unsetFlag(MODULE_ID, MANTLE_ACTIVE_FLAG);
  if (existing.length) {
    await actor.deleteEmbeddedDocuments(
      'ActiveEffect',
      existing.map(effect => effect._id)
    );
  }
}

export async function toggleSpiritMantle(actor, { sourceItem } = {}) {
  if (isSpiritMantleActive(actor)) {
    await deactivateSpiritMantle(actor);
    return false;
  }
  await activateSpiritMantle(actor, { sourceItem });
  return true;
}
