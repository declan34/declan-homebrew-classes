import {
  AUTOMATION_ROLES,
  MODULE_ID,
  SPIRIT_MANTLE_ITEM_ID,
  VESSEL_CLASS_IDENTIFIER,
  VESSEL_ITEM_ID,
  VESSEL_MIGRATION_FLAG,
  VESSEL_MIGRATION_VERSION
} from './constants.mjs';
import { getAutomationRole } from './rules.mjs';

const IRIDESCENT_SCALE_ID = 'ZReRcAXx7wv1xOTO';

let sourceItemsPromise;

function documents(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  return Array.from(collection.values?.() ?? collection);
}

function identifier(item) {
  return item?.identifier ?? item?.system?.identifier;
}

function documentId(document) {
  return document?.id ?? document?._id;
}

function objectData(document) {
  if (document?.toObject) return document.toObject();
  return structuredClone(document);
}

function mergeMissing(current, source) {
  if (current === undefined) return structuredClone(source);
  if (
    !current
    || !source
    || typeof current !== 'object'
    || typeof source !== 'object'
    || Array.isArray(current)
    || Array.isArray(source)
  ) {
    return structuredClone(current);
  }

  const merged = structuredClone(current);
  for (const [key, value] of Object.entries(source)) {
    merged[key] = key in merged
      ? mergeMissing(merged[key], value)
      : structuredClone(value);
  }
  return merged;
}

function sameData(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function repairArmorChanges(current, canonical) {
  const armorKeys = new Set([
    'system.attributes.ac.calc',
    'system.attributes.ac.min'
  ]);
  const custom = (current ?? []).filter(change => !armorKeys.has(change.key));
  const armor = (canonical ?? []).filter(change => armorKeys.has(change.key));
  return [...structuredClone(custom), ...structuredClone(armor)];
}

function currentMigrationVersion(actor) {
  return Number(
    actor?.getFlag?.(MODULE_ID, VESSEL_MIGRATION_FLAG)
      ?? actor?.flags?.[MODULE_ID]?.vessel?.migrationVersion
  ) || 0;
}

function sourceScale(sourceVessel) {
  return documents(sourceVessel?.system?.advancement).find(
    advancement => advancement.id === IRIDESCENT_SCALE_ID
      || advancement._id === IRIDESCENT_SCALE_ID
      || advancement.configuration?.identifier === 'iridescent-strike'
  );
}

function repairScale(current, canonical) {
  if (!current) return objectData(canonical);

  const repaired = mergeMissing(objectData(current), objectData(canonical));
  const source = objectData(canonical);
  repaired._id = objectData(current)._id ?? source._id;
  repaired.type = source.type;
  repaired.level = source.level;
  repaired.configuration ??= {};
  repaired.configuration.identifier = source.configuration.identifier;
  repaired.configuration.type = source.configuration.type;
  repaired.configuration.distance = structuredClone(source.configuration.distance);
  repaired.configuration.scale = structuredClone(source.configuration.scale);
  return repaired;
}

function repairActivity(current, canonical) {
  if (!current) return objectData(canonical);

  const existing = objectData(current);
  const source = objectData(canonical);
  const repaired = mergeMissing(existing, source);
  repaired._id = existing._id ?? source._id;
  repaired.type = source.type;
  repaired.activation ??= {};
  repaired.activation.type = source.activation.type;
  repaired.consumption ??= {};
  repaired.consumption.targets = structuredClone(source.consumption.targets);
  repaired.flags ??= {};
  repaired.flags[MODULE_ID] ??= {};
  repaired.flags[MODULE_ID].vessel ??= {};
  repaired.flags[MODULE_ID].vessel.role =
    source.flags[MODULE_ID].vessel.role;

  if (getAutomationRole(source) === AUTOMATION_ROLES.IRIDESCENT_STRIKE) {
    repaired.attack ??= {};
    repaired.attack.ability = source.attack.ability;
    repaired.attack.type = structuredClone(source.attack.type);
    repaired.damage ??= {};
    repaired.damage.includeBase = source.damage.includeBase;
    repaired.damage.parts ??= [];
    repaired.damage.parts[0] = mergeMissing(
      repaired.damage.parts[0],
      source.damage.parts[0]
    );
    repaired.damage.parts[0].custom = structuredClone(
      source.damage.parts[0].custom
    );
  }

  return repaired;
}

function repairEffect(current, canonical) {
  if (!current) {
    const created = objectData(canonical);
    delete created._key;
    return created;
  }

  const existing = objectData(current);
  const source = objectData(canonical);
  const repaired = mergeMissing(existing, source);
  repaired._id = existing._id;
  repaired.type = source.type;
  repaired.transfer = false;
  repaired.disabled = true;
  repaired.changes = repairArmorChanges(existing.changes, source.changes);
  repaired.flags ??= {};
  repaired.flags[MODULE_ID] ??= {};
  repaired.flags[MODULE_ID].vessel ??= {};
  repaired.flags[MODULE_ID].vessel.role = AUTOMATION_ROLES.MANTLE_AC;
  delete repaired._key;
  return repaired;
}

async function migrateVesselItem(item, canonical) {
  const source = sourceScale(canonical);
  if (!source) {
    throw new Error('The Vessel compendium Item is missing its Iridescent Strike scale.');
  }

  const current = documents(item.system?.advancement).find(
    advancement => documentId(advancement) === IRIDESCENT_SCALE_ID
      || advancement.configuration?.identifier === 'iridescent-strike'
  );
  const repaired = repairScale(current, source);
  if (!current) {
    if (typeof item.createAdvancement !== 'function') {
      throw new Error('This dnd5e Item cannot create the Iridescent Strike scale.');
    }
    await item.createAdvancement(source.type, repaired, { renderSheet: false });
  } else if (!sameData(objectData(current), repaired)) {
    if (typeof item.updateAdvancement !== 'function') {
      throw new Error('This dnd5e Item cannot repair the Iridescent Strike scale.');
    }
    await item.updateAdvancement(documentId(current), repaired);
  }
}

async function migrateMantleItem(item, canonical) {
  const sourceActivities = documents(canonical?.system?.activities).filter(
    activity => [
      AUTOMATION_ROLES.MANTLE_TOGGLE,
      AUTOMATION_ROLES.IRIDESCENT_STRIKE
    ].includes(getAutomationRole(activity))
  );
  if (sourceActivities.length !== 3) {
    throw new Error('The Spirit Mantle compendium Item is missing its automation activities.');
  }

  for (const source of sourceActivities) {
    const current = documents(item.system?.activities).find(
      activity => documentId(activity) === documentId(source)
    );
    const repaired = repairActivity(current, source);
    if (!current || !sameData(objectData(current), repaired)) {
      await item.update({
        [`system.activities.${current?.id ?? current?._id ?? source.id ?? source._id}`]:
          repaired
      });
    }
  }

  const sourceEffect = documents(canonical.effects).find(
    effect => getAutomationRole(effect) === AUTOMATION_ROLES.MANTLE_AC
  );
  if (!sourceEffect) {
    throw new Error('The Spirit Mantle compendium Item is missing its effect template.');
  }

  const currentEffect = documents(item.effects).find(
    effect => documentId(effect) === documentId(sourceEffect)
      || getAutomationRole(effect) === AUTOMATION_ROLES.MANTLE_AC
  );
  const repairedEffect = repairEffect(currentEffect, sourceEffect);
  if (!currentEffect) {
    await item.createEmbeddedDocuments(
      'ActiveEffect',
      [repairedEffect],
      { keepId: true }
    );
  } else if (!sameData(objectData(currentEffect), repairedEffect)) {
    await item.updateEmbeddedDocuments('ActiveEffect', [repairedEffect]);
  }
}

export async function loadVesselSourceItems({
  packs = globalThis.game?.packs
} = {}) {
  sourceItemsPromise ??= (async () => {
    const pack = packs?.get?.(`${MODULE_ID}.homebrew-classes`);
    if (!pack) throw new Error('The Homebrew Classes compendium is unavailable.');

    const [vessel, mantle] = await Promise.all([
      pack.getDocument(VESSEL_ITEM_ID),
      pack.getDocument(SPIRIT_MANTLE_ITEM_ID)
    ]);
    if (!vessel || !mantle) {
      throw new Error('The Homebrew Classes compendium is missing Vessel migration sources.');
    }
    return { vessel, mantle };
  })();
  return sourceItemsPromise;
}

export async function migrateVesselActor(actor, {
  loadSourceItems = loadVesselSourceItems
} = {}) {
  if (!actor?.isOwner) {
    throw new Error('You do not have permission to migrate this Vessel.');
  }
  if (currentMigrationVersion(actor) >= VESSEL_MIGRATION_VERSION) return false;

  const items = documents(actor.items);
  const vesselItems = items.filter(
    item => item?.type === 'class' && identifier(item) === VESSEL_CLASS_IDENTIFIER
  );
  if (!vesselItems.length) return false;

  const mantleItems = items.filter(item => identifier(item) === 'spirit-mantle');
  const source = await loadSourceItems();
  for (const item of vesselItems) await migrateVesselItem(item, source.vessel);
  for (const item of mantleItems) await migrateMantleItem(item, source.mantle);

  await actor.setFlag(
    MODULE_ID,
    VESSEL_MIGRATION_FLAG,
    VESSEL_MIGRATION_VERSION
  );
  return true;
}

export { VESSEL_MIGRATION_VERSION };
