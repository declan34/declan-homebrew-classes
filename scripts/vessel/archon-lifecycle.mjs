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
  getDireGrowthBonuses,
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
import { reconcileStage3EffectsUnlocked } from './stage3-effects.mjs';

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

function activities(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (typeof collection.values === 'function') return Array.from(collection.values());
  return Object.values(collection);
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

function documentSource(document) {
  return document?.toObject ? document.toObject() : clone(document);
}

function serializationSafe(value) {
  if (value instanceof Set) return [...value].map(serializationSafe);
  if (Array.isArray(value)) return value.map(serializationSafe);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, serializationSafe(entry)])
    );
  }
  return value;
}

function actorSnapshotSource(actor) {
  return actor?.toObject?.() ?? actor?._source ?? actor ?? {};
}

function tokenSnapshot(token) {
  const source = token?.toObject?.() ?? token?._source ?? token ?? {};
  return {
    uuid: token?.uuid ?? source.uuid,
    id: token?.id ?? source.id ?? source._id,
    textureSrc: source.texture?.src ?? token?.texture?.src,
    width: source.width ?? token?.width,
    height: source.height ?? token?.height
  };
}

function documentId(document) {
  return document?.id ?? document?._id;
}

function activeTokenDocuments(actor) {
  const tokens = actor?.getActiveTokens?.(true, true) ?? [];
  const documents = tokens.map(token => token?.document ?? token).filter(Boolean);
  if (actor?.isToken && actor?.token && !documents.includes(actor.token)) {
    documents.push(actor.token);
  }
  return [...new Map(documents.map(token => [token.uuid ?? token.id, token])).values()];
}

function archonSnapshot(actor) {
  const source = actorSnapshotSource(actor);
  const system = source.system ?? actor?.system ?? {};
  const prototypeToken = source.prototypeToken ?? actor?.prototypeToken;
  return {
    actor: {
      img: source.img ?? actor?.img,
      prototypeTokenTextureSrc: prototypeToken?.texture?.src,
      movement: serializationSafe(system?.attributes?.movement),
      senses: serializationSafe(system?.attributes?.senses),
      skills: serializationSafe(system?.skills),
      traits: serializationSafe(system?.traits),
      tempHP: currentTempHP(actor)
    },
    tokens: activeTokenDocuments(actor).map(tokenSnapshot)
  };
}

function mergeProfileSkills(current, profile) {
  const merged = clone(current) ?? {};
  for (const [key, skill] of Object.entries(profile ?? {})) {
    const existing = merged[key];
    if (!existing || Number(skill?.value) > Number(existing?.value)) {
      merged[key] = clone(skill);
    }
  }
  return merged;
}

function mergeProfileLanguages(current, profile) {
  const values = new Set([
    ...languageValues({ system: { traits: { languages: current } } }),
    ...languageValues({ system: { traits: { languages: profile } } })
  ]);
  const custom = new Set([
    ...customLanguageValues({ system: { traits: { languages: current } } }),
    ...customLanguageValues({ system: { traits: { languages: profile } } })
  ]);
  return {
    ...clone(profile ?? current ?? {}),
    value: current?.value instanceof Set || profile?.value instanceof Set
      ? new Set(values)
      : [...values],
    custom: [...custom].sort((left, right) => left.localeCompare(right)).join('; ')
  };
}

function profileActorUpdates(actor, profileActor) {
  const profile = profileActor?.system ?? {};
  const currentTraits = actor?.system?.traits ?? {};
  const traits = clone(currentTraits);
  for (const key of ['size', 'di', 'dr', 'dv', 'dm', 'ci']) {
    if (profile.traits?.[key] !== undefined) {
      traits[key] = clone(profile.traits[key]);
    }
  }
  traits.languages = mergeProfileLanguages(
    currentTraits.languages,
    profile.traits?.languages
  );
  const updates = {
    img: profileActor.img,
    'prototypeToken.texture.src': profileActor.img,
    'system.attributes.hp.temp': Math.max(
      currentTempHP(actor),
      getArchonTempHP(actor)
    )
  };
  if (profile.attributes?.movement) {
    updates['system.attributes.movement'] = clone(profile.attributes.movement);
  }
  if (profile.attributes?.senses) {
    updates['system.attributes.senses'] = clone(profile.attributes.senses);
  }
  if (profile.skills) {
    updates['system.skills'] = mergeProfileSkills(actor?.system?.skills, profile.skills);
  }
  if (traits) updates['system.traits'] = traits;
  return updates;
}

function temporaryMetadata(state) {
  return {
    transformationId: state.transformationId,
    profile: state.profile
  };
}

function temporarySource(document, state) {
  const source = documentSource(document);
  delete source._id;
  delete source._key;
  delete source.folder;
  delete source.ownership;
  delete source._stats;
  source.flags ??= {};
  source.flags[MODULE_ID] ??= {};
  source.flags[MODULE_ID].vessel ??= {};
  source.flags[MODULE_ID].vessel.archon ??= {};
  source.flags[MODULE_ID].vessel.archon.temporary = temporaryMetadata(state);
  return source;
}

function temporaryTransformationId(document) {
  return document?.getFlag?.(MODULE_ID, 'vessel.archon.temporary.transformationId')
    ?? document?.flags?.[MODULE_ID]?.vessel?.archon?.temporary?.transformationId;
}

async function updateActiveTokenArt(actor, src) {
  for (const token of activeTokenDocuments(actor)) {
    await token.update({ 'texture.src': src });
  }
}

async function applyDireStatureGeometry(actor, growth) {
  if (!growth.size) return;
  await actor.update({'system.traits.size': growth.size});
  for (const token of activeTokenDocuments(actor)) {
    await token.update({width: growth.width, height: growth.height});
  }
}

function applyDireStatureReach(itemSource, reachBonus) {
  if (!reachBonus) return;
  for (const activity of activities(itemSource?.system?.activities)) {
    if (
      activity?.type !== 'attack'
      || activity?.attack?.type?.value !== 'melee'
    ) continue;
    const range = Number(activity?.range?.value);
    if (!Number.isFinite(range)) continue;
    activity.range ??= {};
    activity.range.value = String(range + reachBonus);
  }
}

async function restoreActiveTokenArt(actor, state, {
  resolveUuid = globalThis.fromUuid
} = {}) {
  const current = new Map(activeTokenDocuments(actor).map(token => [
    token.uuid ?? token.id,
    token
  ]));
  for (const snapshot of state?.snapshot?.tokens ?? []) {
    let token = current.get(snapshot.uuid ?? snapshot.id);
    if (!token && snapshot.uuid && typeof resolveUuid === 'function') {
      token = await resolveUuid(snapshot.uuid);
    }
    if (token?.update) {
      const changes = { 'texture.src': snapshot.textureSrc };
      if (snapshot.width !== undefined) changes.width = snapshot.width;
      if (snapshot.height !== undefined) changes.height = snapshot.height;
      await token.update(changes);
    }
  }
}

async function deleteTemporaryDocuments(actor, state) {
  const transformationId = state?.transformationId;
  if (!transformationId) return;
  const itemIds = documents(actor?.items)
    .filter(item => temporaryTransformationId(item) === transformationId)
    .map(documentId)
    .filter(Boolean);
  const effectIds = documents(actor?.effects)
    .filter(effect => temporaryTransformationId(effect) === transformationId)
    .map(documentId)
    .filter(Boolean);
  if (effectIds.length) {
    await actor.deleteEmbeddedDocuments('ActiveEffect', effectIds);
  }
  if (itemIds.length) await actor.deleteEmbeddedDocuments('Item', itemIds);
}

async function restoreArchonSnapshot(actor, state, options = {}) {
  const snapshot = state?.snapshot?.actor;
  if (!snapshot) return;
  await actor.update({
    img: snapshot.img,
    'prototypeToken.texture.src': snapshot.prototypeTokenTextureSrc,
    'system.attributes.movement': clone(snapshot.movement),
    'system.attributes.senses': clone(snapshot.senses),
    'system.skills': clone(snapshot.skills),
    'system.traits': clone(snapshot.traits),
    'system.attributes.hp.temp': Math.max(0, Number(snapshot.tempHP) || 0)
  });
  await restoreActiveTokenArt(actor, state, options);
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
  sourceItem,
  resolveUuid
} = {}) {
  requireActorOwner(actor);

  await deleteTemporaryDocuments(actor, state);
  if (state?.snapshot) {
    await restoreArchonSnapshot(actor, state, { resolveUuid });
  } else {
    const beforeTransform = Math.max(
      0,
      Number(state?.tempHPBeforeTransform) || 0
    );
    if (currentTempHP(actor) !== beforeTransform) {
      await setTempHP(actor, beforeTransform);
    }
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

/**
 * Apply an Archon profile to the owned Vessel without creating a new Actor.
 * Profile Items and Effects are copied as tagged embedded documents so cleanup
 * cannot touch unrelated owned content.
 */
export async function activateArchonForm(
  document,
  profileActor,
  pending,
  {
    now = globalThis.game?.time?.worldTime ?? 0
  } = {}
) {
  const actor = actorDocument(document);
  return serializeActorOperation(actor, async () => {
    requireActorOwner(actor);
    if (getArchonState(actor)?.active) {
      throw new Error('Revert your current Archon Form before transforming again.');
    }
    if (!profileActor || !pending?.profile || !pending?.profileUuid) {
      throw new Error('Archon Form requires a valid selected profile.');
    }
    const metadata = profileMetadata(profileActor);
    const transformationId = pending.transformationId
      ?? `${actor.uuid}:${pending.profile}:${Date.now()}`;
    const startedAt = Number(now) || 0;
    const growthCategories = Math.min(
      2,
      Math.max(0, Math.trunc(Number(pending.growthCategories) || 0))
    );
    const growth = getDireGrowthBonuses(growthCategories);
    let state = {
      active: false,
      activating: true,
      startedAt,
      expiresAt: startedAt + getArchonDurationSeconds(actor),
      profile: metadata.profile ?? pending.profile,
      profileUuid: profileActor.uuid ?? pending.profileUuid,
      sourceActorUuid: actor.uuid,
      payment: pending.payment ?? 'free',
      acBonus: getArchonACBonus(metadata),
      growthCategories,
      tempHPBeforeTransform: currentTempHP(actor),
      transformationId,
      temporaryItemIds: [],
      temporaryEffectIds: [],
      snapshot: archonSnapshot(actor)
    };
    await actor.setFlag(MODULE_ID, ARCHON_STATE_FLAG, state);

    try {
      await actor.update(profileActorUpdates(actor, profileActor));
      await updateActiveTokenArt(actor, profileActor.img);
      await applyDireStatureGeometry(actor, growth);

      const itemSources = documents(profileActor.items)
        .map(item => {
          const source = temporarySource(item, state);
          applyDireStatureReach(source, growth.reachBonus);
          return source;
        });
      if (itemSources.length) {
        const created = await actor.createEmbeddedDocuments('Item', itemSources);
        state = {
          ...state,
          temporaryItemIds: created.map(documentId).filter(Boolean)
        };
        await actor.setFlag(MODULE_ID, ARCHON_STATE_FLAG, state);
      }

      const effectSources = documents(profileActor.effects)
        .map(effect => temporarySource(effect, state));
      if (effectSources.length) {
        const created = await actor.createEmbeddedDocuments(
          'ActiveEffect',
          effectSources
        );
        state = {
          ...state,
          temporaryEffectIds: created.map(documentId).filter(Boolean)
        };
      }

      state = { ...state, active: true, activating: false };
      await actor.setFlag(MODULE_ID, ARCHON_STATE_FLAG, state);
      await reconcileStage3EffectsUnlocked(actor);
      state = {
        ...state,
        temporaryEffectIds: documents(actor.effects)
          .filter(effect => temporaryTransformationId(effect) === transformationId)
          .map(documentId)
          .filter(Boolean)
      };
      await actor.setFlag(MODULE_ID, ARCHON_STATE_FLAG, state);
      await clearArchonPending(
        actor,
        state.profileUuid,
        state.transformationId
      );
      await finalizeUnlocked(actor);
      return actor;
    } catch (error) {
      const cleanupState = {
        ...state,
        active: false,
        activating: false,
        cleanupPending: true
      };
      await actor.setFlag(MODULE_ID, ARCHON_STATE_FLAG, cleanupState);
      try {
        await cleanupRestoredActor(actor, cleanupState);
        await clearArchonPending(
          actor,
          state.profileUuid,
          state.transformationId
        );
      } catch (cleanupError) {
        console.error(
          "Declan's Homebrew Classes | Failed to roll back Archon Form activation.",
          cleanupError
        );
      }
      throw error;
    }
  });
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
  sourceItem,
  resolveUuid
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
    if (state.snapshot) {
      const cleanupState = {
        ...state,
        active: false,
        cleanupPending: true
      };
      await actor.setFlag(MODULE_ID, ARCHON_STATE_FLAG, cleanupState);
      await cleanupRestoredActor(actor, cleanupState, {
        sourceItem,
        resolveUuid
      });
      return actor;
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
