import {
  ARCHON_PENDING_FLAG,
  ARCHON_STATE_FLAG,
  AUTOMATION_ROLES,
  MODULE_ID,
  SPIRIT_MANTLE_ITEM_ID
} from './constants.mjs';
import {
  getArchonACBonus,
  getArchonDurationSeconds,
  getArchonTempHP,
  getAutomationRole
} from './rules.mjs';
import {
  activateSpiritMantleUnlocked,
  reconcileSpiritMantleUnlocked
} from './mantle.mjs';
import {
  requireActorOwner,
  serializeActorOperation
} from './operations.mjs';

function actorDocument(document) {
  if (!document) return undefined;
  if (document.documentName === 'Token' || document.actor) {
    return document.actor ?? document.object?.actor;
  }
  return document;
}

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

function profileMetadata(profileActor) {
  return profileActor?.flags?.[MODULE_ID]?.vessel?.archon ?? {};
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function languageValues(actorOrSource) {
  const value = actorOrSource?.system?.traits?.languages?.value;
  if (value instanceof Set) return [...value];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value ? [value] : [];
  return [];
}

function customLanguageValues(actorOrSource) {
  const custom = actorOrSource?.system?.traits?.languages?.custom;
  if (typeof custom !== 'string') return [];
  return custom.split(';').map(value => value.trim()).filter(Boolean);
}

function setLanguageValues(source, values) {
  source.system ??= {};
  source.system.traits ??= {};
  source.system.traits.languages ??= {};
  const current = source.system.traits.languages.value;
  source.system.traits.languages.value = current instanceof Set
    ? new Set(values)
    : values;
}

function setCustomLanguageValues(source, values) {
  source.system ??= {};
  source.system.traits ??= {};
  source.system.traits.languages ??= {};
  source.system.traits.languages.custom = values.join('; ');
}

function setSourceState(source, state) {
  source.flags ??= {};
  source.flags[MODULE_ID] ??= {};
  source.flags[MODULE_ID].vessel ??= {};
  source.flags[MODULE_ID].vessel.archon ??= {};
  source.flags[MODULE_ID].vessel.archon.state = clone(state);
}

function spiritMantleSource(actor, explicit) {
  if (explicit) return explicit;
  return documents(actor?.items).find(item =>
    identifier(item) === 'spirit-mantle'
      || item?.id === SPIRIT_MANTLE_ITEM_ID
      || item?._id === SPIRIT_MANTLE_ITEM_ID
  );
}

function formOnlyEffects(actor) {
  return documents(actor?.effects).filter(effect =>
    getAutomationRole(effect) === AUTOMATION_ROLES.ARCHON_FORM_EFFECT
  );
}

function currentTempHP(actor) {
  return Math.max(0, Number(actor?.system?.attributes?.hp?.temp) || 0);
}

async function setTempHP(actor, value) {
  if (currentTempHP(actor) === value) return;
  await actor.update({ 'system.attributes.hp.temp': value });
}

async function deleteFormOnlyEffects(actor) {
  const effects = formOnlyEffects(actor);
  if (!effects.length) return;
  await actor.deleteEmbeddedDocuments(
    'ActiveEffect',
    effects.map(effect => effect.id ?? effect._id)
  );
}

async function finalizeUnlocked(actor, {
  sourceItem
} = {}) {
  const state = getArchonState(actor);
  if (!state?.active) return { handled: false };

  const mantle = spiritMantleSource(actor, sourceItem);
  if (!mantle) {
    throw new Error('The transformed Vessel is missing its owned Spirit Mantle feature.');
  }

  await activateSpiritMantleUnlocked(actor, { sourceItem: mantle });
  const floor = Math.max(
    getArchonTempHP(actor),
    Number(state.tempHPBeforeTransform) || 0
  );
  if (currentTempHP(actor) < floor) await setTempHP(actor, floor);
  return { handled: true, state: getArchonState(actor) };
}

async function cleanupRestoredActor(actor, state, {
  sourceItem
} = {}) {
  requireActorOwner(actor);

  const beforeTransform = Math.max(
    0,
    Number(state?.tempHPBeforeTransform) || 0
  );
  if (currentTempHP(actor) !== beforeTransform) {
    await setTempHP(actor, beforeTransform);
  }

  await deleteFormOnlyEffects(actor);
  await reconcileSpiritMantleUnlocked(actor, {
    sourceItem: spiritMantleSource(actor, sourceItem)
  });
  await actor.unsetFlag(MODULE_ID, ARCHON_STATE_FLAG);
}

async function cleanupAfterNativeReversion(actor, state, options) {
  const cleanupState = {
    ...state,
    active: false,
    cleanupPending: true
  };
  await actor.setFlag(MODULE_ID, ARCHON_STATE_FLAG, cleanupState);
  await cleanupRestoredActor(actor, cleanupState, options);
}

export function getArchonState(document) {
  const actor = actorDocument(document);
  const state = actor?.getFlag?.(MODULE_ID, ARCHON_STATE_FLAG)
    ?? rawFlag(actor, ARCHON_STATE_FLAG);
  return clone(state);
}

export function getArchonPending(document) {
  const actor = actorDocument(document);
  const pending = actor?.getFlag?.(MODULE_ID, ARCHON_PENDING_FLAG)
    ?? rawFlag(actor, ARCHON_PENDING_FLAG);
  return clone(pending);
}

export async function stageArchonTransformation(document, pending) {
  const actor = actorDocument(document);
  requireActorOwner(actor);
  if (!pending?.profile || !pending?.profileUuid) {
    throw new Error('Archon Form could not determine the selected profile.');
  }
  await actor.setFlag(MODULE_ID, ARCHON_PENDING_FLAG, clone(pending));
  return clone(pending);
}

export async function clearArchonPending(
  document,
  expectedProfileUuid,
  expectedTransformationId
) {
  const actor = actorDocument(document);
  if (!actor) return false;
  const pending = getArchonPending(actor);
  if (!pending) return false;
  if (expectedProfileUuid && pending.profileUuid !== expectedProfileUuid) {
    return false;
  }
  if (
    expectedTransformationId
    && pending.transformationId !== expectedTransformationId
  ) {
    return false;
  }
  await actor.unsetFlag(MODULE_ID, ARCHON_PENDING_FLAG);
  return true;
}

export function preparePendingArchonTransformData(
  originalDocument,
  transformSource,
  pending,
  options = {}
) {
  if (!pending?.profile || !pending?.profileUuid) {
    throw new Error('Archon Form has no matching pending profile.');
  }
  const profileActor = {
    uuid: pending.profileUuid,
    flags: {
      [MODULE_ID]: {
        vessel: {
          archon: {
            profile: pending.profile,
            acBonus: pending.acBonus
          }
        }
      }
    },
    system: {
      traits: {
        languages: {
          value: new Set(),
          custom: ''
        }
      }
    }
  };
  return prepareArchonTransformData(
    originalDocument,
    profileActor,
    transformSource,
    {
      ...options,
      payment: pending.payment,
      transformationId: pending.transformationId
    }
  );
}

export function isArchonFormActive(document) {
  return getArchonState(document)?.active === true;
}

/**
 * Prepare the Actor source generated by dnd5e's linked transform workflow.
 * This does not create or replace an Actor; it only augments the native source.
 */
export function prepareArchonTransformData(
  originalDocument,
  profileActor,
  transformSource,
  {
    now = globalThis.game?.time?.worldTime ?? 0,
    payment = 'free',
    transformationId
  } = {}
) {
  const originalActor = actorDocument(originalDocument);
  requireActorOwner(originalActor);
  if (!profileActor || !transformSource) {
    throw new Error('Archon Form requires a valid source actor and transform profile.');
  }

  const metadata = profileMetadata(profileActor);
  if (!metadata.profile || !profileActor.uuid || !originalActor.uuid) {
    throw new Error('Archon Form profile metadata is incomplete.');
  }

  const languages = new Set([
    ...languageValues(originalActor),
    ...languageValues(profileActor),
    ...languageValues(transformSource)
  ]);
  setLanguageValues(transformSource, [...languages]);
  const customLanguages = new Set([
    ...customLanguageValues(originalActor),
    ...customLanguageValues(profileActor),
    ...customLanguageValues(transformSource)
  ]);
  setCustomLanguageValues(
    transformSource,
    [...customLanguages].sort((left, right) => left.localeCompare(right))
  );
  transformSource.system.attributes ??= {};
  transformSource.system.attributes.hp ??= {};
  transformSource.system.attributes.hp.temp = Math.max(
    currentTempHP(originalActor),
    getArchonTempHP(originalActor),
    Number(transformSource.system.attributes.hp.temp) || 0
  );

  const startedAt = Number(now) || 0;
  const state = {
    active: true,
    startedAt,
    expiresAt: startedAt + getArchonDurationSeconds(originalActor),
    profile: metadata.profile,
    profileUuid: profileActor.uuid,
    sourceActorUuid: originalActor.uuid,
    payment,
    acBonus: getArchonACBonus(metadata),
    tempHPBeforeTransform: currentTempHP(originalActor),
    ...(transformationId ? { transformationId } : {})
  };
  setSourceState(transformSource, state);
  return clone(state);
}

export async function finalizeArchonTransformation(document, options = {}) {
  const actor = actorDocument(document);
  return serializeActorOperation(
    actor,
    () => finalizeUnlocked(actor, options)
  );
}

export async function reconcileArchonForm(document, options = {}) {
  const actor = actorDocument(document);
  return serializeActorOperation(actor, async () => {
    const state = getArchonState(actor);
    if (state?.cleanupPending) {
      await cleanupRestoredActor(actor, state, options);
      return { handled: true, cleaned: true };
    }
    if (!state?.active) return { handled: false };
    return finalizeUnlocked(actor, options);
  });
}

/**
 * Called only after dnd5e reports successful native Extend consumption.
 */
export async function extendArchonForm(document) {
  const actor = actorDocument(document);
  return serializeActorOperation(actor, async () => {
    const state = getArchonState(actor);
    if (!state?.active) {
      throw new Error('Archon Form is not active and cannot be extended.');
    }
    const extended = {
      ...state,
      expiresAt: (Number(state.expiresAt) || 0) + 600
    };
    await actor.setFlag(MODULE_ID, ARCHON_STATE_FLAG, extended);
    return clone(extended);
  });
}

export async function revertArchonForm(document, {
  sourceItem
} = {}) {
  const actor = actorDocument(document);
  return serializeActorOperation(actor, async () => {
    const state = getArchonState(actor);
    if (state?.cleanupPending) {
      await cleanupRestoredActor(actor, state, { sourceItem });
      return actor;
    }
    if (!state?.active) {
      throw new Error('Archon Form is not active and cannot be reverted.');
    }
    if (typeof actor.revertOriginalForm !== 'function') {
      throw new Error('This Actor cannot use Foundry’s native form reversion.');
    }

    const reverted = await actor.revertOriginalForm();
    const restored = actorDocument(reverted);
    if (!restored) {
      throw new Error('Foundry did not return the restored Actor after reversion.');
    }
    if (restored === actor) {
      await cleanupAfterNativeReversion(restored, state, { sourceItem });
    } else {
      await serializeActorOperation(
        restored,
        () => cleanupAfterNativeReversion(restored, state, { sourceItem })
      );
    }
    return restored;
  });
}
