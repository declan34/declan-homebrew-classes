import {
  AUTOMATION_ROLES,
  MANTLE_ACTIVE_FLAG,
  MODULE_ID
} from './constants.mjs';
import {
  getAutomationRole,
  isEtherealArmorEligible
} from './rules.mjs';

const actorOperations = new WeakMap();

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

async function serializeActorOperation(actor, operation) {
  requireOwner(actor);
  const previous = actorOperations.get(actor) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  actorOperations.set(actor, current);
  try {
    return await current;
  } finally {
    if (actorOperations.get(actor) === current) actorOperations.delete(actor);
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

async function reconcileSpiritMantleUnlocked(actor, { sourceItem } = {}) {
  const active = isSpiritMantleActive(actor);
  const existing = mantleEffects(actor);

  if (!active) {
    const enabled = existing.filter(effect => !effect.disabled);
    if (enabled.length) {
      try {
        await actor.updateEmbeddedDocuments(
          'ActiveEffect',
          enabled.map(effect => ({
            _id: effect._id,
            disabled: true
          }))
        );
      } catch (error) {
        await actor.setFlag(MODULE_ID, MANTLE_ACTIVE_FLAG, true);
        throw error;
      }
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

  const disabled = !isEtherealArmorEligible(actor);
  const updates = [];
  if (current.disabled !== disabled) {
    updates.push({
      _id: current._id,
      disabled
    });
  }
  updates.push(...duplicates.filter(effect => !effect.disabled).map(effect => ({
    _id: effect._id,
    disabled: true
  })));
  if (updates.length) {
    await actor.updateEmbeddedDocuments('ActiveEffect', updates);
  }
  if (duplicates.length) {
    await actor.deleteEmbeddedDocuments(
      'ActiveEffect',
      duplicates.map(effect => effect._id)
    );
  }
}

async function activateSpiritMantleUnlocked(actor, { sourceItem } = {}) {
  const wasActive = isSpiritMantleActive(actor);
  if (!wasActive) {
    await actor.setFlag(MODULE_ID, MANTLE_ACTIVE_FLAG, true);
  }
  try {
    await reconcileSpiritMantleUnlocked(actor, { sourceItem });
  } catch (error) {
    if (!wasActive) {
      try {
        await deactivateSpiritMantleUnlocked(actor);
      } catch {
        // Preserve the original activation failure without clearing unsafe state.
      }
    }
    throw error;
  }
}

async function deactivateSpiritMantleUnlocked(actor) {
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

export async function reconcileSpiritMantle(actor, { sourceItem } = {}) {
  return serializeActorOperation(
    actor,
    () => reconcileSpiritMantleUnlocked(actor, { sourceItem })
  );
}

export async function activateSpiritMantle(actor, { sourceItem } = {}) {
  return serializeActorOperation(
    actor,
    () => activateSpiritMantleUnlocked(actor, { sourceItem })
  );
}

export async function deactivateSpiritMantle(actor) {
  return serializeActorOperation(actor, () => deactivateSpiritMantleUnlocked(actor));
}

export async function toggleSpiritMantle(actor, { sourceItem } = {}) {
  return serializeActorOperation(actor, async () => {
    if (isSpiritMantleActive(actor)) {
      await deactivateSpiritMantleUnlocked(actor);
      return false;
    }
    await activateSpiritMantleUnlocked(actor, { sourceItem });
    return true;
  });
}
