export const VESSEL_SLOT_TABLE = Object.freeze({
  2: Object.freeze({ slots: 2, level: 1 }),
  5: Object.freeze({ slots: 2, level: 2 }),
  9: Object.freeze({ slots: 2, level: 3 }),
  11: Object.freeze({ slots: 3, level: 3 }),
  13: Object.freeze({ slots: 3, level: 4 }),
  17: Object.freeze({ slots: 4, level: 5 })
});

function vesselSpellcastingConfiguration() {
  return {
    label: 'Vessel Magic',
    type: 'single',
    cantrips: true,
    prepares: true,
    order: 15,
    img: 'icons/magic/unholy/silhouette-robe-evil-power.webp',
    table: Object.fromEntries(Object.entries(VESSEL_SLOT_TABLE).map(
      ([level, slots]) => [level, { ...slots }]
    )),
    progression: {
      vessel: {
        label: 'Vessel Magic',
        divisor: 1
      }
    }
  };
}

function addVesselRecovery(dnd5eConfig) {
  dnd5eConfig.restTypes.short.recoverSpellSlotTypes.add('vessel');
  dnd5eConfig.restTypes.long.recoverSpellSlotTypes.add('vessel');
}

function isVesselConfiguration(value) {
  return value?.progression?.vessel?.divisor === 1
    && value?.table?.[2]?.slots === 2
    && value?.table?.[17]?.level === 5;
}

export function registerVesselSpellcasting(dnd5eConfig) {
  if (!dnd5eConfig?.spellcasting
      || !dnd5eConfig?.restTypes?.short?.recoverSpellSlotTypes
      || !dnd5eConfig?.restTypes?.long?.recoverSpellSlotTypes) {
    console.error("Declan's Homebrew Classes | Unable to register Vessel spellcasting.");
    return false;
  }

  const existing = dnd5eConfig.spellcasting.vessel;
  if (isVesselConfiguration(existing)) {
    addVesselRecovery(dnd5eConfig);
    return true;
  }
  if (existing) {
    console.error(
      "Declan's Homebrew Classes | A 'vessel' spellcasting method is already registered."
    );
    return false;
  }

  dnd5eConfig.spellcasting.vessel = vesselSpellcastingConfiguration();
  addVesselRecovery(dnd5eConfig);
  return true;
}

/**
 * Ensure dnd5e retained the custom model after its i18nInit model conversion.
 * A missing model leaves the class progression unresolved and causes dropped
 * spells to fall back to the Innate section.
 */
export function ensureVesselSpellcastingModel(dnd5eConfig, dnd5eApi) {
  if (!dnd5eConfig?.spellcasting
      || !dnd5eConfig?.spellProgression
      || !dnd5eConfig?.restTypes?.short?.recoverSpellSlotTypes
      || !dnd5eConfig?.restTypes?.long?.recoverSpellSlotTypes) {
    console.error("Declan's Homebrew Classes | Unable to verify Vessel spellcasting.");
    return false;
  }

  let model = dnd5eConfig.spellcasting.vessel;
  if (model && !isVesselConfiguration(model)) {
    console.error(
      "Declan's Homebrew Classes | A different 'vessel' spellcasting model is already registered."
    );
    return false;
  }
  if (!(model?.key === 'vessel' && model?.slots && isVesselConfiguration(model))) {
    const Model = dnd5eApi?.dataModels?.spellcasting?.SingleLevelSpellcasting;
    if (typeof Model !== 'function') {
      console.error("Declan's Homebrew Classes | Vessel spellcasting model is unavailable.");
      return false;
    }
    try {
      model = new Model(vesselSpellcastingConfiguration(), { key: 'vessel' });
      dnd5eConfig.spellcasting.vessel = model;
    } catch (error) {
      console.error(
        "Declan's Homebrew Classes | Unable to construct Vessel spellcasting model.",
        error
      );
      return false;
    }
  }

  dnd5eConfig.spellProgression.vessel = {
    label: 'Vessel Magic',
    divisor: 1,
    type: 'vessel'
  };
  addVesselRecovery(dnd5eConfig);
  return true;
}

Hooks.once('init', () => registerVesselSpellcasting(CONFIG.DND5E));
Hooks.once('i18nInit', () => ensureVesselSpellcastingModel(CONFIG.DND5E, globalThis.dnd5e));
