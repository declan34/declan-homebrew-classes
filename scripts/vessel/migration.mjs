import {
  ARCHON_FORM_ITEM_ID,
  AUTOMATION_ROLES,
  DIRE_STATURE_IDENTIFIER,
  DIRE_STATURE_ITEM_ID,
  HELLFIRE_ITEM_ID,
  MALIGNANT_AURA_ITEM_ID,
  IRIDESCENT_STRIKES_ITEM_ID,
  MODULE_ID,
  SPIRIT_MANTLE_ITEM_ID,
  STRIKING_PRESENCE_ITEM_ID,
  UNCANNY_STRENGTH_ITEM_ID,
  VESSEL_CLASS_IDENTIFIER,
  VESSEL_ITEM_ID,
  VESSEL_MAGIC_ITEM_ID,
  VESSEL_MIGRATION_FLAG,
  VESSEL_MIGRATION_VERSION
} from './constants.mjs';
import {
  STAGE3_ACTIVITY_ROLES,
  getAutomationRole,
  getVesselLevel,
  getVesselSubclassIdentifier
} from './rules.mjs';

const IRIDESCENT_SCALE_ID = 'ZReRcAXx7wv1xOTO';
const VESSEL_SPELL_PROGRESSION_SCALES = new Set([
  'cantrips-known',
  'spells-known',
  'spell-slots',
  'slot-level'
]);
const ARCHON_CONTROL_IDS = Object.freeze({
  'the-ascended': 'hbrAscCtrlForm01',
  'the-cataclysm': 'hbrCatCtrlForm01',
  'the-cursed': 'hbrCurCtrlForm01',
  'the-fallen': 'hbrFalCtrlForm01',
  'the-formless': 'hbrForCtrlForm01',
  'the-trickster': 'hbrTriCtrlForm01'
});
const ARCHON_ACTIVITY_ROLES = new Set([
  AUTOMATION_ROLES.ARCHON_TRANSFORM_FREE,
  AUTOMATION_ROLES.ARCHON_TRANSFORM_SLOT,
  AUTOMATION_ROLES.ARCHON_EXTEND,
  AUTOMATION_ROLES.ARCHON_REVERT,
  AUTOMATION_ROLES.ARCHON_EQUIPMENT_PREFERENCE
]);
const ARCHON_ACTIVITY_FIELDS = [
  'type',
  'sort',
  'activation',
  'consumption',
  'duration',
  'effects',
  'range',
  'target',
  'profiles',
  'settings',
  'transform',
  'roll'
];

let sourceItemsPromise;
let stage3SourceItemsPromise;
let passiveSourceItemsPromise;

const STAGE3_CLASS_SOURCE_IDS = Object.freeze([
  'hbrvesLGlYzPTrpS',
  'hbrvesQdu3j2S7ev',
  'hbrFalCondemn001',
  'hbrveshZhemFHFD0'
]);
const STAGE3_ASPECT_SOURCE_IDS = Object.freeze([
  'oUmkQMBtbkjpGzhL',
  'CquoRI5JHwQVMxh2',
  'mb56s5afeKP0P5xx',
  'CpYrFMC1h6nw0fkk',
  'IXh8m5czq8ak3Iw2',
  'R1Is4N2JEStH8LOs',
  'oNQaG7C5qlSyRLve',
  'wPQPAvQF3hX7DncV',
  'u1069fpl73SdiBic',
  'r81LpnSWinmglc4u'
]);

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

function sourceSpellProgressionScales(sourceVessel) {
  const scales = documents(sourceVessel?.system?.advancement).filter(
    advancement => VESSEL_SPELL_PROGRESSION_SCALES.has(
      advancement.configuration?.identifier
    )
  );
  if (scales.length !== VESSEL_SPELL_PROGRESSION_SCALES.size) {
    throw new Error(
      'The Vessel compendium Item is missing its spell progression scales.'
    );
  }
  return scales;
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

function moduleArchonMetadata(item) {
  return item?.flags?.[MODULE_ID]?.vessel?.archon;
}

function archonControlSubclass(item) {
  const metadata = moduleArchonMetadata(item);
  if (metadata?.role === 'archon-control' && metadata.subclass) {
    return metadata.subclass;
  }
  const value = identifier(item);
  return Object.keys(ARCHON_CONTROL_IDS).find(
    subclass => value === `${subclass}-archon-form-control`
  );
}

function repairArchonActivity(current, canonical) {
  if (!current) return objectData(canonical);
  const existing = objectData(current);
  const source = objectData(canonical);
  const repaired = mergeMissing(existing, source);
  repaired._id = existing._id ?? source._id;
  for (const field of ARCHON_ACTIVITY_FIELDS) {
    if (Object.hasOwn(source, field)) {
      repaired[field] = structuredClone(source[field]);
    } else {
      delete repaired[field];
    }
  }
  repaired.uses = mergeMissing(existing.uses, source.uses);
  if (source.uses) {
    repaired.uses.max = source.uses.max;
    repaired.uses.recovery = structuredClone(source.uses.recovery);
  }
  repaired.flags ??= {};
  repaired.flags[MODULE_ID] ??= {};
  repaired.flags[MODULE_ID].vessel ??= {};
  repaired.flags[MODULE_ID].vessel.role =
    source.flags[MODULE_ID].vessel.role;
  return repaired;
}

const STAGE3_ACTIVITY_FIELDS = [
  ...ARCHON_ACTIVITY_FIELDS,
  'attack',
  'damage',
  'healing',
  'save'
];

function repairStage3Activity(current, canonical) {
  if (!current) return objectData(canonical);
  const existing = objectData(current);
  const source = objectData(canonical);
  const repaired = mergeMissing(existing, source);
  repaired._id = existing._id ?? source._id;
  for (const field of STAGE3_ACTIVITY_FIELDS) {
    if (Object.hasOwn(source, field)) {
      repaired[field] = structuredClone(source[field]);
    } else {
      delete repaired[field];
    }
  }
  repaired.uses = mergeMissing(existing.uses, source.uses);
  repaired.flags ??= {};
  repaired.flags[MODULE_ID] ??= {};
  repaired.flags[MODULE_ID].vessel ??= {};
  repaired.flags[MODULE_ID].vessel.role =
    source.flags[MODULE_ID].vessel.role;
  return repaired;
}

function isStage3Effect(effect) {
  const flags = effect?.flags?.[MODULE_ID]?.vessel;
  return Boolean(
    flags?.stage3Source
    || (
      flags?.role === AUTOMATION_ROLES.ARCHON_FORM_EFFECT
      && flags?.source
    )
  );
}

function repairStage3Effect(current, canonical) {
  if (!current) {
    const created = objectData(canonical);
    delete created._key;
    return created;
  }
  const existing = objectData(current);
  const source = objectData(canonical);
  const repaired = mergeMissing(existing, source);
  repaired._id = existing._id ?? source._id;
  repaired.type = source.type;
  repaired.transfer = source.transfer;
  repaired.disabled = source.disabled;
  repaired.changes = structuredClone(source.changes);
  repaired.duration = structuredClone(source.duration);
  repaired.statuses = structuredClone(source.statuses);
  repaired.flags ??= {};
  repaired.flags[MODULE_ID] = structuredClone(source.flags?.[MODULE_ID] ?? {});
  delete repaired._key;
  return repaired;
}

async function migrateStage3Item(item, canonical) {
  const sourceActivities = documents(canonical?.system?.activities).filter(
    activity => STAGE3_ACTIVITY_ROLES.has(getAutomationRole(activity))
  );
  for (const source of sourceActivities) {
    const current = documents(item.system?.activities).find(activity =>
      documentId(activity) === documentId(source)
        || getAutomationRole(activity) === getAutomationRole(source)
    );
    const repaired = repairStage3Activity(current, source);
    if (!current || !sameData(objectData(current), repaired)) {
      await item.update({
        [`system.activities.${documentId(current) ?? documentId(source)}`]: repaired
      });
    }
  }

  const sourceEffects = documents(canonical?.effects).filter(isStage3Effect);
  for (const source of sourceEffects) {
    const sourceFlags = source.flags?.[MODULE_ID]?.vessel ?? {};
    const current = documents(item.effects).find(effect => {
      const currentFlags = effect.flags?.[MODULE_ID]?.vessel ?? {};
      return documentId(effect) === documentId(source)
        || (
          currentFlags.role === sourceFlags.role
          && currentFlags.source === sourceFlags.source
          && currentFlags.stage3Source === sourceFlags.stage3Source
        );
    });
    const repaired = repairStage3Effect(current, source);
    if (!current) {
      await item.createEmbeddedDocuments(
        'ActiveEffect',
        [repaired],
        {keepId: true}
      );
    } else if (!sameData(objectData(current), repaired)) {
      await item.updateEmbeddedDocuments('ActiveEffect', [repaired]);
    }
  }
}

async function migrateArchonResource(item, canonical) {
  if (!canonical) {
    throw new Error('The Homebrew Classes compendium is missing Archon Form.');
  }
  const source = objectData(canonical);
  const currentUses = item.system?.uses ?? {};
  const updates = {};
  if (currentUses.max !== source.system.uses.max) {
    updates['system.uses.max'] = source.system.uses.max;
  }
  if (!sameData(currentUses.recovery, source.system.uses.recovery)) {
    updates['system.uses.recovery'] =
      structuredClone(source.system.uses.recovery);
  }
  if (identifier(item) !== source.system.identifier) {
    updates['system.identifier'] = source.system.identifier;
  }
  const currentVesselFlags = item.flags?.[MODULE_ID]?.vessel ?? {};
  const sourceVesselFlags = source.flags?.[MODULE_ID]?.vessel ?? {};
  const repairedVesselFlags = mergeMissing(
    currentVesselFlags,
    sourceVesselFlags
  );
  repairedVesselFlags.role = sourceVesselFlags.role;
  repairedVesselFlags.archon = structuredClone(sourceVesselFlags.archon);
  if (!sameData(currentVesselFlags, repairedVesselFlags)) {
    updates[`flags.${MODULE_ID}.vessel`] = repairedVesselFlags;
  }
  if (Object.keys(updates).length) await item.update(updates);
}

async function migrateArchonControl(item, canonical) {
  if (!canonical) {
    throw new Error('The Homebrew Classes compendium is missing an Archon control.');
  }
  const sourceActivities = documents(canonical?.system?.activities).filter(
    activity => ARCHON_ACTIVITY_ROLES.has(getAutomationRole(activity))
  );
  if (sourceActivities.length !== ARCHON_ACTIVITY_ROLES.size) {
    throw new Error(
      'The Archon control compendium Item is missing its automation activities.'
    );
  }

  for (const source of sourceActivities) {
    const current = documents(item.system?.activities).find(activity =>
      documentId(activity) === documentId(source)
        || getAutomationRole(activity) === getAutomationRole(source)
    );
    const repaired = repairArchonActivity(current, source);
    if (!current || !sameData(objectData(current), repaired)) {
      const id = documentId(current) ?? documentId(source);
      await item.update({ [`system.activities.${id}`]: repaired });
    }
  }

  const sourceData = objectData(canonical);
  const updates = {};
  if (identifier(item) !== sourceData.system.identifier) {
    updates['system.identifier'] = sourceData.system.identifier;
  }
  const currentVesselFlags = item.flags?.[MODULE_ID]?.vessel ?? {};
  const sourceVesselFlags = sourceData.flags?.[MODULE_ID]?.vessel ?? {};
  const repairedVesselFlags = mergeMissing(
    currentVesselFlags,
    sourceVesselFlags
  );
  repairedVesselFlags.archon = structuredClone(sourceVesselFlags.archon);
  if (!sameData(currentVesselFlags, repairedVesselFlags)) {
    updates[`flags.${MODULE_ID}.vessel`] = repairedVesselFlags;
  }
  if (Object.keys(updates).length) await item.update(updates);
}

function ownedItemSource(canonical) {
  const source = objectData(canonical);
  delete source._key;
  delete source.folder;
  delete source.ownership;
  return source;
}

async function createMissingArchonControl(actor, canonical) {
  if (typeof actor.createEmbeddedDocuments !== 'function') {
    throw new Error('This Actor cannot create its missing Archon Form control.');
  }
  const created = await actor.createEmbeddedDocuments(
    'Item',
    [ownedItemSource(canonical)],
    { keepId: true }
  );
  const item = created?.[0];
  if (!item) {
    throw new Error('Foundry did not create the missing Archon Form control.');
  }
  return item;
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

async function migrateVesselSpellTrack(item, canonical) {
  const sourceSpellcasting = canonical?.system?.spellcasting;
  const sourcePrimaryAbility = canonical?.system?.primaryAbility;
  if (!sourceSpellcasting || !sourcePrimaryAbility) {
    throw new Error(
      'The Vessel compendium Item is missing its spellcasting configuration.'
    );
  }

  const updates = {};
  if (!sameData(item.system?.primaryAbility?.value, sourcePrimaryAbility.value)) {
    updates['system.primaryAbility.value'] = structuredClone(
      sourcePrimaryAbility.value
    );
  }
  if (item.system?.primaryAbility?.all !== sourcePrimaryAbility.all) {
    updates['system.primaryAbility.all'] = sourcePrimaryAbility.all;
  }
  if (item.system?.spellcasting?.progression !== sourceSpellcasting.progression) {
    updates['system.spellcasting.progression'] = sourceSpellcasting.progression;
  }
  if (item.system?.spellcasting?.ability !== sourceSpellcasting.ability) {
    updates['system.spellcasting.ability'] = sourceSpellcasting.ability;
  }
  if (
    item.system?.spellcasting?.preparation?.formula
      !== sourceSpellcasting.preparation?.formula
  ) {
    updates['system.spellcasting.preparation.formula'] =
      sourceSpellcasting.preparation?.formula;
  }
  if (Object.keys(updates).length) await item.update(updates);

  for (const progressionScale of sourceSpellProgressionScales(canonical)) {
    const currentProgressionScale = documents(item.system?.advancement).find(
      advancement => documentId(advancement) === documentId(progressionScale)
        || advancement.configuration?.identifier
          === progressionScale.configuration?.identifier
    );
    const repairedProgressionScale = repairScale(
      currentProgressionScale,
      progressionScale
    );
    if (!currentProgressionScale) {
      if (typeof item.createAdvancement !== 'function') {
        throw new Error('This dnd5e Item cannot create Vessel spell progression scales.');
      }
      await item.createAdvancement(
        progressionScale.type,
        repairedProgressionScale,
        { renderSheet: false }
      );
    } else if (!sameData(
      objectData(currentProgressionScale),
      repairedProgressionScale
    )) {
      if (typeof item.updateAdvancement !== 'function') {
        throw new Error('This dnd5e Item cannot repair Vessel spell progression scales.');
      }
      await item.updateAdvancement(
        documentId(currentProgressionScale),
        repairedProgressionScale
      );
    }
  }
}

async function migrateVesselSpellMethods(items, vesselItems) {
  const spellcastingClasses = items.filter(item =>
    item?.type === 'class'
      && item.system?.spellcasting?.progression
      && item.system.spellcasting.progression !== 'none'
  );
  const vesselOnly = spellcastingClasses.length === vesselItems.length
    && vesselItems.length > 0;

  for (const item of items) {
    if (item?.type !== 'spell') continue;
    const sealedMagic = item.flags?.[MODULE_ID]?.vessel?.sealedMagic;
    const classSpellMethod = ['', 'spell', 'vessel'].includes(
      item.system?.method ?? ''
    );
    const linkedToVessel = item.system?.sourceItem === 'class:vessel'
      && classSpellMethod;
    const unlinkedClassSpell = vesselOnly
      && !item.system?.sourceItem
      && ['', 'spell'].includes(item.system?.method ?? '');
    if (!sealedMagic && !linkedToVessel && !unlinkedClassSpell) continue;

    const updates = {};
    if (item.system?.method !== 'vessel') updates['system.method'] = 'vessel';
    if (item.system?.sourceItem !== 'class:vessel') {
      updates['system.sourceItem'] = 'class:vessel';
    }
    if (Object.keys(updates).length) await item.update(updates);
  }
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

async function migrateVesselMagicItem(item, canonical) {
  if (identifier(canonical) !== 'vessel-magic') {
    throw new Error('The Homebrew Classes compendium is missing Vessel Magic.');
  }
  if (Object.hasOwn(item.system ?? {}, 'uses')) {
    await item.update({ 'system.-=uses': null });
  }
}

async function migrateMantleItem(item, canonical) {
  const sourceActivities = documents(canonical?.system?.activities).filter(
    activity => getAutomationRole(activity) === AUTOMATION_ROLES.MANTLE_TOGGLE
  );
  if (sourceActivities.length !== 1) {
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

  for (const activity of documents(item.system?.activities)) {
    if (getAutomationRole(activity) !== AUTOMATION_ROLES.IRIDESCENT_STRIKE) {
      continue;
    }
    await item.update({
      [`system.activities.-=${documentId(activity)}`]: null
    });
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

async function migrateIridescentStrikesItem(item, canonical) {
  const sourceActivities = documents(canonical?.system?.activities).filter(
    activity => getAutomationRole(activity) === AUTOMATION_ROLES.IRIDESCENT_STRIKE
  );
  if (sourceActivities.length !== 1) {
    throw new Error(
      'The Iridescent Strikes compendium Item is missing its attack activity.'
    );
  }

  const source = sourceActivities[0];
  const current = documents(item.system?.activities).find(activity =>
    documentId(activity) === documentId(source)
      || getAutomationRole(activity) === AUTOMATION_ROLES.IRIDESCENT_STRIKE
  );
  const repaired = repairActivity(current, source);
  if (!current || !sameData(objectData(current), repaired)) {
    await item.update({
      [`system.activities.${documentId(current) ?? documentId(source)}`]: repaired
    });
  }
}

async function migrateDireStatureItem(item, canonical) {
  if (!canonical) {
    throw new Error('The Vessel Aspects compendium is missing Dire Stature.');
  }
  const sourceEffects = documents(canonical.effects).filter(
    effect => getAutomationRole(effect) === AUTOMATION_ROLES.DIRE_STATURE_EFFECT
  );
  if (sourceEffects.length !== 1) {
    throw new Error('The Dire Stature compendium Item is missing its effect template.');
  }

  const source = sourceEffects[0];
  const current = documents(item.effects).find(effect =>
    documentId(effect) === documentId(source)
      || getAutomationRole(effect) === AUTOMATION_ROLES.DIRE_STATURE_EFFECT
  );
  const repaired = repairStage3Effect(current, source);
  if (!current) {
    await item.createEmbeddedDocuments(
      'ActiveEffect',
      [repaired],
      { keepId: true }
    );
  } else if (!sameData(objectData(current), repaired)) {
    await item.updateEmbeddedDocuments('ActiveEffect', [repaired]);
  }
}

function syncCanonicalFields(current, canonical) {
  const repaired = structuredClone(current ?? {});
  for (const [key, value] of Object.entries(canonical ?? {})) {
    if (
      value
      && typeof value === 'object'
      && !Array.isArray(value)
      && repaired[key]
      && typeof repaired[key] === 'object'
      && !Array.isArray(repaired[key])
    ) {
      repaired[key] = syncCanonicalFields(repaired[key], value);
    } else {
      repaired[key] = structuredClone(value);
    }
  }
  return repaired;
}

function repairPassiveModuleFlags(item, canonical) {
  const sourceFlags = canonical?.flags?.[MODULE_ID];
  if (!sourceFlags) return undefined;

  const currentFlags = item.flags?.[MODULE_ID] ?? {};
  const repaired = syncCanonicalFields(currentFlags, sourceFlags);
  const strikingPresenceSkill =
    currentFlags?.vessel?.strikingPresence?.skill;
  if (strikingPresenceSkill !== undefined) {
    repaired.vessel ??= {};
    repaired.vessel.strikingPresence ??= {};
    repaired.vessel.strikingPresence.skill = strikingPresenceSkill;
  }
  return sameData(currentFlags, repaired) ? undefined : repaired;
}

function repairPassiveActivity(current, canonical) {
  const source = objectData(canonical);
  const repaired = structuredClone(source);
  repaired._id = documentId(current) ?? documentId(source);
  delete repaired._key;
  return repaired;
}

function moduleEffectRole(effect) {
  return effect?.flags?.[MODULE_ID]?.vessel?.role;
}

function repairPassiveEffect(current, canonical) {
  const source = objectData(canonical);
  const repaired = structuredClone(source);
  repaired._id = documentId(current) ?? documentId(source);
  delete repaired._key;
  return repaired;
}

async function migratePassiveItem(item, canonical) {
  if (!canonical) return;
  const source = objectData(canonical);
  const updates = {};
  if (item.system?.description?.value !== source.system?.description?.value) {
    updates['system.description.value'] = source.system?.description?.value;
  }
  const repairedModuleFlags = repairPassiveModuleFlags(item, source);
  if (repairedModuleFlags) {
    updates[`flags.${MODULE_ID}`] = repairedModuleFlags;
  }
  if (Object.keys(updates).length) await item.update(updates);

  for (const sourceActivity of documents(canonical.system?.activities)) {
    const current = documents(item.system?.activities).find(activity =>
      documentId(activity) === documentId(sourceActivity)
        || (
          getAutomationRole(activity)
          && getAutomationRole(activity) === getAutomationRole(sourceActivity)
        )
    );
    const repaired = repairPassiveActivity(current, sourceActivity);
    if (!current || !sameData(objectData(current), repaired)) {
      await item.update({
        [`system.activities.${documentId(current) ?? documentId(sourceActivity)}`]: repaired
      });
    }
  }

  for (const sourceEffect of documents(canonical.effects)) {
    const current = documents(item.effects).find(effect =>
      documentId(effect) === documentId(sourceEffect)
        || (
          moduleEffectRole(sourceEffect)
          && moduleEffectRole(effect) === moduleEffectRole(sourceEffect)
        )
    );
    const repaired = repairPassiveEffect(current, sourceEffect);
    if (!current) {
      await item.createEmbeddedDocuments(
        'ActiveEffect',
        [repaired],
        { keepId: true }
      );
    } else if (!sameData(objectData(current), repaired)) {
      await item.updateEmbeddedDocuments('ActiveEffect', [repaired]);
    }
  }
}

async function migrateHellfireUses(item, canonical) {
  if (identifier(canonical) !== 'hellfire') {
    throw new Error('The Homebrew Classes compendium is missing Hellfire.');
  }
  const uses = objectData(canonical)?.system?.uses;
  if (!sameData(item.system?.uses, uses)) {
    await item.update({'system.uses': structuredClone(uses)});
  }
}

export async function loadVesselSourceItems({
  packs = globalThis.game?.packs
} = {}) {
  if (sourceItemsPromise) return sourceItemsPromise;
  const request = (async () => {
    const classPack = packs?.get?.(`${MODULE_ID}.homebrew-classes`);
    const aspectPack = packs?.get?.(`${MODULE_ID}.vessel-aspects`);
    if (!classPack || !aspectPack) {
      throw new Error('The Vessel migration compendiums are unavailable.');
    }

    const ids = [
      VESSEL_ITEM_ID,
      VESSEL_MAGIC_ITEM_ID,
      SPIRIT_MANTLE_ITEM_ID,
      IRIDESCENT_STRIKES_ITEM_ID,
      ARCHON_FORM_ITEM_ID,
      ...Object.values(ARCHON_CONTROL_IDS)
    ];
    const documents = await Promise.all([
      ...ids.map(id => classPack.getDocument(id)),
      aspectPack.getDocument(DIRE_STATURE_ITEM_ID)
    ]);
    if (documents.some(document => !document)) {
      throw new Error('The Homebrew Classes compendium is missing Vessel migration sources.');
    }
    const [
      vessel,
      vesselMagic,
      mantle,
      strikes,
      archon,
      ...controlItemsAndDireStature
    ] = documents;
    const direStature = controlItemsAndDireStature.pop();
    const controlItems = controlItemsAndDireStature;
    const controls = Object.fromEntries(
      Object.keys(ARCHON_CONTROL_IDS).map((subclass, index) => [
        subclass,
        controlItems[index]
      ])
    );
    return {
      vessel,
      vesselMagic,
      mantle,
      strikes,
      archon,
      controls,
      direStature
    };
  })();
  sourceItemsPromise = request;
  try {
    return await request;
  } catch (error) {
    if (sourceItemsPromise === request) sourceItemsPromise = undefined;
    throw error;
  }
}

export async function loadVesselPassiveSourceItems({
  packs = globalThis.game?.packs
} = {}) {
  if (passiveSourceItemsPromise) return passiveSourceItemsPromise;
  const request = (async () => {
    const classPack = packs?.get?.(`${MODULE_ID}.homebrew-classes`);
    const aspectPack = packs?.get?.(`${MODULE_ID}.vessel-aspects`);
    if (!classPack || !aspectPack) {
      throw new Error('The Vessel passive migration compendiums are unavailable.');
    }
    const [strikingPresence, uncannyStrength, hellfire, malignantAura] =
      await Promise.all([
        aspectPack.getDocument(STRIKING_PRESENCE_ITEM_ID),
        aspectPack.getDocument(UNCANNY_STRENGTH_ITEM_ID),
        classPack.getDocument(HELLFIRE_ITEM_ID),
        classPack.getDocument(MALIGNANT_AURA_ITEM_ID)
      ]);
    if (![strikingPresence, uncannyStrength, hellfire, malignantAura].every(Boolean)) {
      throw new Error('The Vessel passive migration compendiums are missing sources.');
    }
    return {strikingPresence, uncannyStrength, hellfire, malignantAura};
  })();
  passiveSourceItemsPromise = request;
  try {
    return await request;
  } catch (error) {
    if (passiveSourceItemsPromise === request) passiveSourceItemsPromise = undefined;
    throw error;
  }
}

export async function loadStage3SourceItems({
  packs = globalThis.game?.packs
} = {}) {
  if (stage3SourceItemsPromise) return stage3SourceItemsPromise;
  const request = (async () => {
    const classPack = packs?.get?.(`${MODULE_ID}.homebrew-classes`);
    const aspectPack = packs?.get?.(`${MODULE_ID}.vessel-aspects`);
    if (!classPack || !aspectPack) {
      throw new Error('The Vessel Stage 3 compendiums are unavailable.');
    }
    const sources = await Promise.all([
      ...STAGE3_CLASS_SOURCE_IDS.map(id => classPack.getDocument(id)),
      ...STAGE3_ASPECT_SOURCE_IDS.map(id => aspectPack.getDocument(id))
    ]);
    if (sources.some(document => !document)) {
      throw new Error('The Vessel Stage 3 compendiums are missing migration sources.');
    }
    return new Map(sources.map(source => [identifier(source), source]));
  })();
  stage3SourceItemsPromise = request;
  try {
    return await request;
  } catch (error) {
    if (stage3SourceItemsPromise === request) stage3SourceItemsPromise = undefined;
    throw error;
  }
}

export async function migrateVesselActor(actor, {
  loadSourceItems = loadVesselSourceItems,
  loadPassiveItems = loadVesselPassiveSourceItems,
  loadStage3Items = loadStage3SourceItems
} = {}) {
  if (!actor?.isOwner) {
    throw new Error('You do not have permission to migrate this Vessel.');
  }
  const startingMigrationVersion = currentMigrationVersion(actor);
  if (startingMigrationVersion >= VESSEL_MIGRATION_VERSION) return false;

  const items = documents(actor.items);
  const vesselItems = items.filter(
    item => item?.type === 'class' && identifier(item) === VESSEL_CLASS_IDENTIFIER
  );
  if (!vesselItems.length) return false;

  if (startingMigrationVersion < 6) {
    await migrateVesselSpellMethods(items, vesselItems);
  }

  const source = await loadSourceItems();
  if (startingMigrationVersion < 7) {
    const hellfireItems = items.filter(item => identifier(item) === 'hellfire');
    if (hellfireItems.length) {
      const canonical = source.hellfire
        ?? (await loadPassiveItems()).hellfire;
      for (const item of hellfireItems) {
        await migrateHellfireUses(item, canonical);
      }
    }
  }
  if (startingMigrationVersion < 5) {
    for (const item of vesselItems) {
      await migrateVesselSpellTrack(item, source.vessel);
    }
    const vesselMagicItems = items.filter(item =>
      item?.type === 'feat' && identifier(item) === identifier(source.vesselMagic)
    );
    for (const item of vesselMagicItems) {
      await migrateVesselMagicItem(item, source.vesselMagic);
    }
    const direStatureItems = items.filter(item =>
      identifier(item) === DIRE_STATURE_IDENTIFIER
    );
    for (const item of direStatureItems) {
      await migrateDireStatureItem(item, source.direStature);
    }
    const passiveItems = items.filter(item => [
      'striking-presence',
      'uncanny-strength',
      'hellfire',
      'malignant-aura'
    ].includes(identifier(item)));
    if (passiveItems.length) {
      const passiveSource = source.strikingPresence
        && source.uncannyStrength
        && source.hellfire
        && source.malignantAura
        ? source
        : await loadPassiveItems();
      const passiveSources = new Map([
        ['striking-presence', passiveSource.strikingPresence],
        ['uncanny-strength', passiveSource.uncannyStrength],
        ['hellfire', passiveSource.hellfire],
        ['malignant-aura', passiveSource.malignantAura]
      ]);
      for (const item of passiveItems) {
        const canonical = passiveSources.get(identifier(item));
        if (canonical) await migratePassiveItem(item, canonical);
      }
    }
  }

  if (startingMigrationVersion < 4) {
  const mantleItems = items.filter(item => identifier(item) === 'spirit-mantle');
  for (const item of vesselItems) await migrateVesselItem(item, source.vessel);

  let strikesItem = items.find(item => identifier(item) === 'iridescent-strikes');
  if (!strikesItem) {
    const created = await actor.createEmbeddedDocuments(
      'Item',
      [ownedItemSource(source.strikes)],
      { keepId: true }
    );
    strikesItem = created?.[0];
    if (!strikesItem) {
      throw new Error('Foundry did not create the missing Iridescent Strikes Item.');
    }
  }
  await migrateIridescentStrikesItem(strikesItem, source.strikes);

  for (const item of mantleItems) await migrateMantleItem(item, source.mantle);

  const archonItems = items.filter(item =>
    identifier(item) === 'archon-form'
      || getAutomationRole(item) === AUTOMATION_ROLES.ARCHON_RESOURCE
  );
  for (const item of archonItems) {
    await migrateArchonResource(item, source.archon);
  }

  const controls = items.filter(item => archonControlSubclass(item));
  const subclass = getVesselSubclassIdentifier(actor);
  if (
    subclass
    && getVesselLevel(actor) >= 3
    && !controls.some(item => archonControlSubclass(item) === subclass)
  ) {
    const canonical = source.controls?.[subclass];
    if (!canonical) {
      throw new Error(
        `The Homebrew Classes compendium is missing the ${subclass} Archon control.`
      );
    }
    controls.push(await createMissingArchonControl(actor, canonical));
  }
  for (const item of controls) {
    const controlSubclass = archonControlSubclass(item);
    await migrateArchonControl(item, source.controls?.[controlSubclass]);
  }

  const stage3Owned = items.filter(item =>
    STAGE3_ACTIVITY_ROLES.has(getAutomationRole(item))
      || [
        'cataclysmic-eruption',
        'divine-wrath',
        'condemnation',
        'drain-vitality',
        'aether-wings',
        'opalescent-armor',
        'perilous-visage',
        'otherworldly-maw',
        'primordial-bulwark',
        'twilight-steps',
        'shimmering-lance',
        'dazzling-lance',
        'sundering-strike',
        'vexing-strike'
      ].includes(identifier(item))
  );
  const needsCondemnation = subclass === 'the-fallen'
    && getVesselLevel(actor) >= 6
    && !items.some(item => identifier(item) === 'condemnation');
  if (stage3Owned.length || needsCondemnation) {
    const stage3Sources = await loadStage3Items();
    if (needsCondemnation) {
      const canonical = stage3Sources.get('condemnation');
      if (!canonical) {
        throw new Error(
          'The Vessel Stage 3 compendiums are missing condemnation.'
        );
      }
      const created = await actor.createEmbeddedDocuments(
        'Item',
        [ownedItemSource(canonical)],
        {keepId: true}
      );
      if (!created?.[0]) {
        throw new Error('Foundry did not create the missing Condemnation Item.');
      }
    }
    for (const item of stage3Owned) {
      const canonical = stage3Sources.get(identifier(item));
      if (!canonical) {
        throw new Error(
          `The Vessel Stage 3 compendiums are missing ${identifier(item)}.`
        );
      }
      await migrateStage3Item(item, canonical);
    }
  }
  }

  await actor.setFlag(
    MODULE_ID,
    VESSEL_MIGRATION_FLAG,
    VESSEL_MIGRATION_VERSION
  );
  return true;
}

export { VESSEL_MIGRATION_VERSION };
