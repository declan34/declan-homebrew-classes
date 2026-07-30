import {
  AUTOMATION_ROLES,
  MODULE_ID
} from './constants.mjs';
import {
  getAllowedArchonProfilesForActor,
  getArchonProfilesForActor
} from './rules.mjs';

const ARCHON_ROLES = new Set([
  AUTOMATION_ROLES.ARCHON_TRANSFORM_FREE,
  AUTOMATION_ROLES.ARCHON_TRANSFORM_SLOT,
  AUTOMATION_ROLES.ARCHON_EXTEND,
  AUTOMATION_ROLES.ARCHON_REVERT
]);

const TRANSFORM_ROLES = new Set([
  AUTOMATION_ROLES.ARCHON_TRANSFORM_FREE,
  AUTOMATION_ROLES.ARCHON_TRANSFORM_SLOT
]);

const SLOT_ROLES = new Set([
  AUTOMATION_ROLES.ARCHON_TRANSFORM_SLOT,
  AUTOMATION_ROLES.ARCHON_EXTEND
]);

const profileSourceCache = new Map();
const preparationState = new WeakMap();

function documents(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  return Array.from(collection.values?.() ?? collection);
}

function identifier(item) {
  return item?.identifier ?? item?.system?.identifier;
}

function role(document) {
  return document?.flags?.[MODULE_ID]?.vessel?.role;
}

function objectData(document) {
  return document?.toObject ? document.toObject() : structuredClone(document);
}

function activityProfiles(activity) {
  return documents(activity?.profiles);
}

function isActorDocument(document) {
  return document?.documentName === 'Actor'
    || document?.constructor?.documentName === 'Actor'
    || ['character', 'npc'].includes(document?.type);
}

function error(code, message, details) {
  return new ArchonPreparationError(code, message, details);
}

function validateOwner(activity, actor) {
  if (!actor || actor.isOwner === false || activity?.item?.isOwner === false) {
    throw error(
      'not-owner',
      'You must own this Vessel actor to use its Archon Form controls.'
    );
  }
}

function validateTransformPermission({
  activity,
  user,
  allowPolymorphing
}) {
  if (!TRANSFORM_ROLES.has(role(activity)) || !user) return;
  const canCreateActor = typeof user.can !== 'function'
    || user.can('ACTOR_CREATE');
  const polymorphingAllowed = user.isGM
    || allowPolymorphing === true;
  if (!canCreateActor || !polymorphingAllowed) {
    throw error(
      'transform-permission',
      'Your Foundry user cannot create transformed Actors. Ask the GM to enable polymorphing permissions.'
    );
  }
}

function validateVesselSlots(actor) {
  const pool = actor?.system?.spells?.vessel;
  if (!pool) {
    throw error(
      'missing-vessel-slots',
      'This actor does not have a Vessel Magic spell-slot pool.'
    );
  }
  if (!(Number(pool.value) > 0)) {
    throw error(
      'vessel-slots-exhausted',
      'No Vessel Magic spell slots remain.'
    );
  }
}

function updateActivity(activity, changes) {
  if (typeof activity?.updateSource === 'function') {
    activity.updateSource(changes);
    return;
  }
  if (changes.profiles) activity.profiles = structuredClone(changes.profiles);
  if (changes.consumption) {
    activity.consumption = structuredClone(changes.consumption);
  }
}

export class ArchonPreparationError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'ArchonPreparationError';
    this.code = code;
    this.details = details;
  }
}

export function findArchonFormItem(actor) {
  return documents(actor?.items).find(item =>
    identifier(item) === 'archon-form'
      || item?.flags?.[MODULE_ID]?.vessel?.archon?.role === 'archon-resource'
  );
}

export async function resolveArchonProfileSources(profiles, {
  resolveUuid = globalThis.fromUuid,
  cache
} = {}) {
  if (typeof resolveUuid !== 'function') {
    throw error(
      'profile-pack-unavailable',
      'The Archon Form Actor compendium is unavailable.'
    );
  }

  const sourceCache = cache
    ?? (resolveUuid === globalThis.fromUuid ? profileSourceCache : new Map());
  const resolved = [];
  for (const profile of profiles) {
    const uuid = profile?.uuid;
    if (!uuid) {
      throw error(
        'missing-profile-uuid',
        `The ${profile?.profile ?? 'selected'} Archon profile has no Actor UUID.`
      );
    }

    let request = sourceCache.get(uuid);
    if (!request) {
      request = Promise.resolve().then(() => resolveUuid(uuid));
      sourceCache.set(uuid, request);
    }

    let source;
    try {
      source = await request;
    } catch (cause) {
      if (sourceCache.get(uuid) === request) sourceCache.delete(uuid);
      throw error(
        'profile-pack-unavailable',
        `The Archon profile compendium could not be loaded for ${profile.profile}.`,
        { uuid, cause }
      );
    }
    if (!isActorDocument(source)) {
      if (sourceCache.get(uuid) === request) sourceCache.delete(uuid);
      throw error(
        'missing-profile-actor',
        `The Actor for the ${profile.profile} Archon profile is missing.`,
        { uuid }
      );
    }
    resolved.push(source);
  }
  return resolved;
}

function filterTransformProfiles(activity, actor, usageConfig) {
  const allowed = getAllowedArchonProfilesForActor(actor);
  const preferred = getArchonProfilesForActor(actor);
  const allowedUuids = new Set(allowed.map(profile => profile.uuid));
  const current = activityProfiles(activity);
  const filtered = current.filter(profile => allowedUuids.has(profile.uuid));

  if (!filtered.length) {
    throw error(
      'no-allowed-profile',
      'This Archon Form control does not contain a profile for the actor’s Sealed Spirit.'
    );
  }

  const selected = usageConfig?.transform?.profile;
  const selectedAllowed = !selected
    || filtered.some(profile => (profile.id ?? profile._id) === selected);
  if (!selectedAllowed) {
    throw error(
      'invalid-profile-selection',
      'The selected Archon profile does not belong to this actor’s Sealed Spirit.'
    );
  }

  const serialized = filtered.map(objectData);
  updateActivity(activity, { profiles: serialized });
  const preferredUuid = preferred.length === 1 ? preferred[0].uuid : undefined;
  const preferredProfile = preferredUuid
    ? serialized.find(profile => profile.uuid === preferredUuid)
    : undefined;
  if (preferredProfile || serialized.length === 1) {
    usageConfig.transform ??= {};
    usageConfig.transform.profile =
      (preferredProfile ?? serialized[0])._id
      ?? (preferredProfile ?? serialized[0]).id;
  }
  const allowedByUuid = new Map(allowed.map(profile => [profile.uuid, profile]));
  return filtered.map(profile => allowedByUuid.get(profile.uuid));
}

function prepareFreeUse(activity, actor) {
  const resourceItem = findArchonFormItem(actor);
  if (!resourceItem) {
    throw error(
      'missing-archon-resource',
      'The Archon Form class feature is missing from this actor.'
    );
  }

  const uses = resourceItem.system?.uses;
  const maximum = Number(uses?.max);
  const spent = Number(uses?.spent) || 0;
  if (Number.isFinite(maximum) && maximum > 0 && spent >= maximum) {
    throw error(
      'free-use-exhausted',
      'The free Archon Form use has already been spent.'
    );
  }

  const consumption = objectData(activity.consumption ?? {});
  const target = consumption.targets?.find(candidate =>
    candidate.type === 'itemUses'
  );
  if (!target) {
    throw error(
      'missing-free-use-target',
      'The free Archon Form activity has no item-use consumption target.'
    );
  }
  target.target = resourceItem.id ?? resourceItem._id;
  if (!target.target) {
    throw error(
      'missing-archon-resource-id',
      'The owned Archon Form feature has no embedded Item ID.'
    );
  }
  updateActivity(activity, { consumption });
  return resourceItem;
}

export async function prepareArchonActivityUse(activity, usageConfig = {}, {
  user = globalThis.game?.user,
  allowPolymorphing = user?.isGM
    || globalThis.game?.settings?.get?.('dnd5e', 'allowPolymorphing'),
  resolveUuid = globalThis.fromUuid,
  cache
} = {}) {
  const activityRole = role(activity);
  if (!ARCHON_ROLES.has(activityRole)) return { handled: false };

  const actor = activity?.item?.actor;
  validateOwner(activity, actor);
  validateTransformPermission({ activity, user, allowPolymorphing });

  let resourceItem;
  if (activityRole === AUTOMATION_ROLES.ARCHON_TRANSFORM_FREE) {
    resourceItem = prepareFreeUse(activity, actor);
  } else if (SLOT_ROLES.has(activityRole)) {
    validateVesselSlots(actor);
  }

  let profileSources = [];
  let profiles = [];
  if (TRANSFORM_ROLES.has(activityRole)) {
    profiles = filterTransformProfiles(activity, actor, usageConfig);
    profileSources = await resolveArchonProfileSources(profiles, {
      resolveUuid,
      cache
    });
  }

  return {
    handled: true,
    ...(resourceItem ? { resourceItem } : {}),
    profiles,
    profileSources
  };
}

function preparationKey(activity) {
  return [
    activity?.item?.id ?? activity?.item?._id ?? '',
    activity?.id ?? activity?._id ?? '',
    role(activity) ?? ''
  ].join(':');
}

function stateForActor(state, actor) {
  let entries = state.get(actor);
  if (!entries) {
    entries = new Map();
    state.set(actor, entries);
  }
  return entries;
}

function preparedPayload(activity, usageConfig) {
  return {
    profiles: activityProfiles(activity).map(objectData),
    consumption: objectData(activity.consumption ?? {}),
    selectedProfile: usageConfig?.transform?.profile
  };
}

function applyPreparedPayload(activity, usageConfig, payload) {
  updateActivity(activity, {
    profiles: payload.profiles,
    consumption: payload.consumption
  });
  if (payload.selectedProfile) {
    usageConfig.transform ??= {};
    usageConfig.transform.profile = payload.selectedProfile;
  }
}

/**
 * Bridge dnd5e's synchronous pre-use hook to the asynchronous compendium
 * preflight. The first call cancels native use and resolves the profile Actors.
 * The guarded retry applies the prepared clone data synchronously and proceeds.
 */
export function requestArchonActivityPreparation(activity, usageConfig = {}, {
  state = preparationState,
  prepareUse = prepareArchonActivityUse,
  retry,
  onError = error => console.error(
    "Declan's Homebrew Classes | Archon preparation failed.",
    error
  ),
  ...prepareOptions
} = {}) {
  if (!ARCHON_ROLES.has(role(activity))) return;

  const actor = activity?.item?.actor;
  const stateOwner = actor ?? activity?.item ?? activity;
  const entries = stateForActor(state, stateOwner);
  const key = preparationKey(activity);
  const existing = entries.get(key);
  if (existing?.status === 'ready') {
    entries.delete(key);
    applyPreparedPayload(activity, usageConfig, existing.payload);
    return;
  }
  if (existing?.status === 'pending') return false;

  const entry = { status: 'pending' };
  entries.set(key, entry);
  entry.promise = Promise.resolve()
    .then(() => prepareUse(activity, usageConfig, prepareOptions))
    .then(() => {
      if (entries.get(key) !== entry) return;
      entry.status = 'ready';
      entry.payload = preparedPayload(activity, usageConfig);
      return retry?.(activity);
    })
    .catch(failure => {
      if (entries.get(key) === entry) entries.delete(key);
      onError(failure);
    })
    .finally(() => {
      if (entries.get(key) === entry && entry.status === 'ready') {
        entries.delete(key);
      }
    });
  return false;
}
