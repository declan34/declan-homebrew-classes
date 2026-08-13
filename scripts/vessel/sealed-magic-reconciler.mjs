import { MODULE_ID } from './constants.mjs';
import { sealedMagicEntriesForActor } from './sealed-magic-manifest.mjs';
import { resolveSealedMagicEntry } from './sealed-magic-provider.mjs';
import { serializeActorOperation } from './operations.mjs';
import { normalizeSpellName } from './spell-provider.mjs';
import {
  getVesselLevel,
  getVesselSubclassIdentifier,
  normalizeElementalAffinity
} from './rules.mjs';

function documents(collection) {
  if (!collection) return [];
  return Array.from(collection.values?.() ?? collection);
}

function sealedMagicGrant(item) {
  return item?.flags?.[MODULE_ID]?.vessel?.sealedMagic;
}

function sealedMagicKey(item) {
  return sealedMagicGrant(item)?.key;
}

function existingSpellIdentities(actor) {
  const keys = new Set();
  const names = new Set();
  for (const item of documents(actor?.items)) {
    if (item?.type !== 'spell') continue;
    const key = sealedMagicKey(item);
    if (key) keys.add(key);
    const name = normalizeSpellName(item?.name);
    if (name) names.add(name);
  }
  return { keys, names };
}

function cleanSource(source) {
  const cleaned = structuredClone(source);
  for (const key of [
    '_id', 'id', 'uuid', 'ownership', 'folder', 'pack', 'collection', 'sort', '_stats'
  ]) {
    delete cleaned[key];
  }
  return cleaned;
}

function grantSource(source, entry, resolution) {
  const grant = cleanSource(source);
  grant.system ??= {};
  grant.system.method = 'vessel';
  grant.system.sourceItem = 'class:vessel';
  const flags = grant.flags ?? {};
  const moduleFlags = flags[MODULE_ID] ?? {};
  const vesselFlags = moduleFlags.vessel ?? {};
  grant.flags = {
    ...flags,
    [MODULE_ID]: {
      ...moduleFlags,
      vessel: {
        ...vesselFlags,
        sealedMagic: {
          key: entry.key,
          subclass: entry.subclass,
          vesselLevel: entry.vesselLevel,
          ...(entry.affinity ? { affinity: entry.affinity } : {}),
          sourceUuid: resolution.sourceUuid,
          ...(resolution.provider ? {provider: resolution.provider} : {})
        }
      }
    }
  };
  return grant;
}

function unresolved(key, status) {
  return { key, status };
}

function actorAffinity(actor) {
  return normalizeElementalAffinity(
    actor?.getFlag?.(MODULE_ID, 'vessel.elementalAffinity')
      ?? actor?.flags?.[MODULE_ID]?.vessel?.elementalAffinity
  );
}

function affinityManualReview(actor) {
  if (getVesselSubclassIdentifier(actor) !== 'the-cataclysm') return [];
  const currentAffinity = actorAffinity(actor);
  if (!currentAffinity) return [];

  const review = [];
  for (const item of documents(actor?.items)) {
    if (item?.type !== 'spell') continue;
    const grant = sealedMagicGrant(item);
    const recordedAffinity = normalizeElementalAffinity(grant?.affinity);
    if (
      grant?.subclass !== 'the-cataclysm'
      || !grant?.key
      || !recordedAffinity
      || recordedAffinity === currentAffinity
    ) continue;
    review.push({
      key: grant.key,
      name: item.name ?? grant.key,
      recordedAffinity,
      currentAffinity
    });
  }
  return review;
}

function entryRemainsEligible(actor, entry, entriesForActor) {
  if (getVesselSubclassIdentifier(actor) !== entry.subclass) return false;
  if (getVesselLevel(actor) < entry.vesselLevel) return false;
  if (
    entry.affinity
    && actorAffinity(actor) !== normalizeElementalAffinity(entry.affinity)
  ) return false;
  if (!documents(entriesForActor(actor)).some(candidate =>
    candidate?.key === entry.key
  )) return false;

  const current = existingSpellIdentities(actor);
  return !current.keys.has(entry.key)
    && !current.names.has(normalizeSpellName(entry.name));
}

async function reconcileSealedMagicUnlocked(actor, dependencies) {
  const result = {
    created: [],
    skipped: [],
    unresolved: [],
    manualReview: affinityManualReview(actor)
  };
  const entries = dependencies.entriesForActor(actor);
  const level = getVesselLevel(actor);
  const existing = existingSpellIdentities(actor);

  for (const entry of entries) {
    if (entry.vesselLevel > level) {
      result.skipped.push(entry.key);
      continue;
    }
    const normalizedName = normalizeSpellName(entry.name);
    if (existing.keys.has(entry.key) || existing.names.has(normalizedName)) {
      result.skipped.push(entry.key);
      continue;
    }

    let resolution;
    try {
      resolution = await dependencies.resolveEntry(entry);
    } catch (_error) {
      result.unresolved.push(unresolved(entry.key, 'resolver-error'));
      continue;
    }
    if (resolution?.status !== 'resolved' || !resolution.sourceUuid) {
      result.unresolved.push(unresolved(entry.key, resolution?.status ?? 'unresolved'));
      continue;
    }

    if (typeof dependencies.fromUuid !== 'function') {
      result.unresolved.push(unresolved(entry.key, 'source-unavailable'));
      continue;
    }

    let source;
    try {
      source = await dependencies.fromUuid(resolution.sourceUuid);
    } catch (_error) {
      result.unresolved.push(unresolved(entry.key, 'source-unavailable'));
      continue;
    }
    if (!source || source.type !== 'spell' || typeof source.toObject !== 'function') {
      result.unresolved.push(unresolved(entry.key, 'source-unavailable'));
      continue;
    }

    if (!entryRemainsEligible(actor, entry, dependencies.entriesForActor)) {
      result.skipped.push(entry.key);
      continue;
    }

    try {
      const [created] = await actor.createEmbeddedDocuments('Item', [
        grantSource(source.toObject(), entry, resolution)
      ]);
      if (!created) throw new Error('Foundry did not create the Sealed Magic spell.');
      existing.keys.add(entry.key);
      existing.names.add(normalizedName);
      result.created.push(entry.key);
    } catch (_error) {
      result.unresolved.push(unresolved(entry.key, 'create-failed'));
    }
  }
  return result;
}

/**
 * Grant eligible Sealed Magic spells as ordinary actor-owned Item documents.
 * Existing actor Items are intentionally never updated or removed.
 */
export async function reconcileSealedMagic(actor, {
  entriesForActor = sealedMagicEntriesForActor,
  resolveEntry = resolveSealedMagicEntry,
  fromUuid = globalThis.fromUuid,
  serialize = serializeActorOperation
} = {}) {
  if (!actor?.isOwner) {
    return { created: [], skipped: [], unresolved: [], manualReview: [] };
  }
  if (typeof serialize !== 'function') {
    throw new TypeError('Sealed Magic reconciliation requires an actor operation serializer.');
  }
  return serialize(actor, () => reconcileSealedMagicUnlocked(actor, {
    entriesForActor,
    resolveEntry,
    fromUuid
  }));
}
