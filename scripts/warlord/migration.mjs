import {
  MODULE_ID,
  WARLORD_CLASS_IDENTIFIER,
  WARLORD_MIGRATION_FLAG,
  WARLORD_MIGRATION_VERSION
} from './constants.mjs';
import { configureLeadershipItems } from './leadership.mjs';
import {
  getIdentifier,
  getLeadershipAbility,
  getWarlordLevel,
  getWarlordRole
} from './rules.mjs';

const SOURCE_ITEM_IDS = Object.freeze({
  leadership: 'RsYiNPYft9wtFUVC',
  inspiring: 'GIQLBRE51hb1RDXH',
  rallying: 'VYQXQblhCYLXLAiI',
  tactical: 'pYK8FOsD6alUcqIu',
  superiority: 'OT3zttV6GIbuCbPN'
});

const ACTIVITY_FIELDS = Object.freeze([
  'type',
  'activation',
  'consumption',
  'duration',
  'range',
  'target',
  'uses',
  'roll',
  'healing',
  'save'
]);

const RECOVERY_ITEM_IDENTIFIERS = new Set([
  'inspiring-word',
  'rallying-cry'
]);
const CORE_ITEM_IDENTIFIERS = new Set([
  WARLORD_CLASS_IDENTIFIER,
  'leadership-style',
  'inspiring-word',
  'rallying-cry',
  'tactical-exploits',
  'tactical-superiority'
]);

let sourceItemsPromise;
const reconciliationQueues = new WeakMap();

function documents(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (typeof collection.values === 'function') return Array.from(collection.values());
  return Object.values(collection);
}

function objectData(document) {
  return document?.toObject ? document.toObject() : structuredClone(document);
}

function documentId(document) {
  return document?.id ?? document?._id;
}

function sameData(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function currentMigrationVersion(actor) {
  return Number(
    actor?.getFlag?.(MODULE_ID, WARLORD_MIGRATION_FLAG)
      ?? actor?.flags?.[MODULE_ID]?.warlord?.migrationVersion
  ) || 0;
}

function actorHasWarlordClass(actor) {
  return documents(actor?.items).some(item => (
    item?.type === 'class'
    && getIdentifier(item) === WARLORD_CLASS_IDENTIFIER
  ));
}

function findOwnedItem(actor, source) {
  const sourceIdentifier = getIdentifier(source);
  return documents(actor?.items).find(item => getIdentifier(item) === sourceIdentifier);
}

function findActivity(item, sourceActivity, canonicalItem) {
  const activities = documents(item?.system?.activities);
  const sourceId = documentId(sourceActivity);
  const sourceRole = getWarlordRole(sourceActivity);
  const exact = activities.find(activity => documentId(activity) === sourceId);
  if (exact || !sourceRole) return exact;

  const roleMatches = activities.filter(
    activity => getWarlordRole(activity) === sourceRole
  );
  const sourceFlags = sourceActivity?.flags?.[MODULE_ID]?.warlord ?? {};
  const identity = Object.entries(sourceFlags).filter(([key]) => key !== 'role');
  if (identity.length) {
    const metadataMatch = roleMatches.find(activity => {
      const flags = activity?.flags?.[MODULE_ID]?.warlord;
      return identity.every(([key, value]) => sameData(flags?.[key], value));
    });
    if (metadataMatch) return metadataMatch;
  }

  const sourceRoleCount = documents(canonicalItem?.system?.activities)
    .filter(activity => getWarlordRole(activity) === sourceRole)
    .length;
  return sourceRoleCount === 1 ? roleMatches[0] : undefined;
}

function newActivityData(canonical) {
  const source = objectData(canonical);
  delete source._key;
  return source;
}

function activityChanges(item, canonical) {
  const changes = {};
  for (const sourceActivity of documents(canonical?.system?.activities)) {
    if (!getWarlordRole(sourceActivity)) continue;
    const current = findActivity(item, sourceActivity, canonical);
    const targetId = documentId(current) ?? documentId(sourceActivity);
    if (!current) {
      changes[`system.activities.${targetId}`] = newActivityData(sourceActivity);
      continue;
    }

    const source = objectData(sourceActivity);
    for (const field of ACTIVITY_FIELDS) {
      if (
        Object.hasOwn(source, field)
        && !sameData(current[field], source[field])
      ) {
        changes[`system.activities.${targetId}.${field}`] =
          structuredClone(source[field]);
      }
    }
    const sourceFlags = source.flags[MODULE_ID].warlord;
    if (!sameData(current?.flags?.[MODULE_ID]?.warlord, sourceFlags)) {
      changes[`system.activities.${targetId}.flags.${MODULE_ID}.warlord`] =
        structuredClone(sourceFlags);
    }
  }
  return changes;
}

function resolvedMaximum(canonical, item) {
  const candidates = [
    canonical?.system?.uses?.max,
    item?.system?.uses?.max,
    (
      typeof item?.system?.uses?.value === 'number'
      && typeof item?.system?.uses?.spent === 'number'
    )
      ? item.system.uses.value + item.system.uses.spent
      : undefined
  ];
  return candidates.find(value => (
    typeof value === 'number' && Number.isFinite(value) && value >= 0
  ));
}

function migrationChanges(item, canonical) {
  const changes = activityChanges(item, canonical);
  const sourceUses = canonical?.system?.uses;
  const currentUses = item?.system?.uses;

  if (sourceUses && !sameData(currentUses?.max, sourceUses.max)) {
    changes['system.uses.max'] = structuredClone(sourceUses.max);
  }
  if (sourceUses && !sameData(currentUses?.recovery, sourceUses.recovery)) {
    changes['system.uses.recovery'] = structuredClone(sourceUses.recovery);
  }

  const maximum = resolvedMaximum(canonical, item);
  if (
    maximum !== undefined
    && typeof currentUses?.spent === 'number'
    && currentUses.spent > maximum
  ) {
    changes['system.uses.spent'] = maximum;
  }

  const sourceWarlordFlags = canonical?.flags?.[MODULE_ID]?.warlord;
  if (
    sourceWarlordFlags
    && !sameData(item?.flags?.[MODULE_ID]?.warlord, sourceWarlordFlags)
  ) {
    changes[`flags.${MODULE_ID}.warlord`] = structuredClone(sourceWarlordFlags);
  }

  const sourceRiders = canonical?.flags?.dnd5e?.riders?.activity;
  if (Array.isArray(sourceRiders)) {
    const currentRiders = item?.flags?.dnd5e?.riders?.activity ?? [];
    const riders = [...new Set([...currentRiders, ...sourceRiders])];
    if (!sameData(currentRiders, riders)) {
      changes['flags.dnd5e.riders.activity'] = riders;
    }
  }
  return changes;
}

function numericRange(activity) {
  const raw = activity?.range?.value;
  if (raw === null || raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function recoveryParts(canonical) {
  const recovery = canonical?.system?.uses?.recovery ?? [];
  return {
    shortRest: recovery.filter(entry => entry?.period === 'sr'),
    initiative: recovery.find(entry => entry?.period === 'initiative')
  };
}

function reconciliationChanges(item, canonical, superior) {
  const changes = {};
  for (const sourceActivity of documents(canonical?.system?.activities)) {
    if (!getWarlordRole(sourceActivity)) continue;
    const current = findActivity(item, sourceActivity, canonical);
    if (!current) continue;

    const baseRange = numericRange(sourceActivity);
    if (baseRange !== undefined) {
      const range = objectData(sourceActivity.range);
      range.value = superior ? baseRange * 2 : baseRange;
      if (!sameData(current.range, range)) {
        changes[`system.activities.${documentId(current)}.range`] = range;
      }
    }
  }

  if (RECOVERY_ITEM_IDENTIFIERS.has(getIdentifier(canonical))) {
    const { shortRest, initiative } = recoveryParts(canonical);
    const recovery = superior && initiative
      ? [...shortRest, initiative]
      : shortRest;
    if (!sameData(item?.system?.uses?.recovery, recovery)) {
      changes['system.uses.recovery'] = structuredClone(recovery);
    }
  }
  return changes;
}

export async function loadWarlordSourceItems({
  packs = globalThis.game?.packs
} = {}) {
  if (sourceItemsPromise) return sourceItemsPromise;

  const pending = (async () => {
    const pack = packs?.get?.(`${MODULE_ID}.homebrew-classes`);
    if (!pack) throw new Error('The Homebrew Classes compendium is unavailable.');

    const entries = await Promise.all(Object.entries(SOURCE_ITEM_IDS).map(
      async ([key, id]) => [key, await pack.getDocument(id)]
    ));
    if (entries.some(([, item]) => !item)) {
      throw new Error('The Homebrew Classes compendium is missing Warlord migration sources.');
    }
    return Object.fromEntries(entries);
  })();
  sourceItemsPromise = pending;
  try {
    return await pending;
  } catch (error) {
    if (sourceItemsPromise === pending) sourceItemsPromise = undefined;
    throw error;
  }
}

export async function loadWarlordExploitSourceItems(actor, {
  packs = globalThis.game?.packs
} = {}) {
  const ownedIdentifiers = new Set(documents(actor?.items)
    .map(getIdentifier)
    .filter(identifier => (
      typeof identifier === 'string'
      && identifier.length > 0
      && !CORE_ITEM_IDENTIFIERS.has(identifier)
    )));
  if (!ownedIdentifiers.size) return {};

  const pack = packs?.get?.(`${MODULE_ID}.warlord-exploits`);
  if (!pack) throw new Error('The Warlord Exploits compendium is unavailable.');

  const index = typeof pack.getIndex === 'function'
    ? await pack.getIndex({ fields: ['system.identifier'] })
    : pack.index;
  const selected = documents(index).filter(entry => (
    ownedIdentifiers.has(getIdentifier(entry))
  ));
  const entries = await Promise.all(selected.map(async entry => {
    const source = await pack.getDocument(documentId(entry));
    if (!source) {
      throw new Error('The Warlord Exploits compendium is missing a migration source.');
    }
    return [getIdentifier(source), source];
  }));
  return Object.fromEntries(entries);
}

async function updateOwnedItems(actor, sources, changesForItem) {
  for (const canonical of Object.values(sources)) {
    const item = findOwnedItem(actor, canonical);
    if (!item || typeof item.update !== 'function') continue;
    const changes = changesForItem(item, canonical);
    if (Object.keys(changes).length) await item.update(changes);
  }
}

async function reconcileWarlordActorNow(actor, {
  loadSourceItems = loadWarlordSourceItems,
  loadExploitSourceItems = loadWarlordExploitSourceItems,
  sourceItems,
  exploitSourceItems,
  configureLeadership = configureLeadershipItems
} = {}) {
  if (!actor?.isOwner || !actorHasWarlordClass(actor)) return;

  const sources = sourceItems ?? await loadSourceItems();
  const exploitSources = exploitSourceItems
    ?? await loadExploitSourceItems(actor);
  const superior = getWarlordLevel(actor) >= 11;
  await updateOwnedItems(
    actor,
    sources,
    (item, canonical) => reconciliationChanges(item, canonical, superior)
  );
  await updateOwnedItems(
    actor,
    exploitSources,
    (item, canonical) => reconciliationChanges(item, canonical, superior)
  );

  const ability = getLeadershipAbility(actor);
  if (ability) await configureLeadership(actor, ability);
}

export async function reconcileWarlordActor(actor, options = {}) {
  if (!actor?.isOwner || !actorHasWarlordClass(actor)) return;

  const previous = reconciliationQueues.get(actor) ?? Promise.resolve();
  const pending = previous
    .catch(() => {})
    .then(() => reconcileWarlordActorNow(actor, options));
  reconciliationQueues.set(actor, pending);

  try {
    await pending;
  } finally {
    if (reconciliationQueues.get(actor) === pending) {
      reconciliationQueues.delete(actor);
    }
  }
}

export async function migrateWarlordActor(actor, {
  loadSourceItems = loadWarlordSourceItems,
  loadExploitSourceItems = loadWarlordExploitSourceItems,
  configureLeadership = configureLeadershipItems
} = {}) {
  if (!actor?.isOwner) {
    throw new Error('You do not have permission to migrate this Warlord.');
  }
  if (currentMigrationVersion(actor) >= WARLORD_MIGRATION_VERSION) return false;
  if (!actorHasWarlordClass(actor)) return false;

  const sources = await loadSourceItems();
  await updateOwnedItems(actor, sources, migrationChanges);
  const exploitSources = await loadExploitSourceItems(actor);
  await updateOwnedItems(actor, exploitSources, migrationChanges);

  await reconcileWarlordActor(actor, {
    sourceItems: sources,
    exploitSourceItems: exploitSources,
    configureLeadership
  });
  await actor.setFlag(
    MODULE_ID,
    WARLORD_MIGRATION_FLAG,
    WARLORD_MIGRATION_VERSION
  );
  return true;
}

export { WARLORD_MIGRATION_VERSION };
