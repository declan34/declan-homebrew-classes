export const ZEAL_SLOT_TABLE = Object.freeze({
  3: Object.freeze({ slots: 1, level: 1 }),
  4: Object.freeze({ slots: 2, level: 1 }),
  7: Object.freeze({ slots: 2, level: 2 }),
  13: Object.freeze({ slots: 2, level: 3 }),
  19: Object.freeze({ slots: 2, level: 4 })
});

function zealSpellcastingConfiguration() {
  return {
    label: 'Zeal Spellcasting',
    type: 'single',
    cantrips: true,
    prepares: false,
    order: 16,
    img: 'icons/magic/holy/angel-winged-humanoid-blue.webp',
    table: Object.fromEntries(Object.entries(ZEAL_SLOT_TABLE).map(
      ([level, slots]) => [level, { ...slots }]
    )),
    progression: {
      zeal: {
        label: 'Zeal Spellcasting',
        divisor: 1
      }
    }
  };
}

function addZealRecovery(dnd5eConfig) {
  dnd5eConfig.restTypes.short.recoverSpellSlotTypes.add('zeal');
  dnd5eConfig.restTypes.long.recoverSpellSlotTypes.add('zeal');
}

function isZealConfiguration(value) {
  return value?.progression?.zeal?.divisor === 1
    && value?.table?.[3]?.slots === 1
    && value?.table?.[19]?.level === 4;
}

export function registerZealSpellcasting(dnd5eConfig) {
  if (!dnd5eConfig?.spellcasting
      || !dnd5eConfig?.restTypes?.short?.recoverSpellSlotTypes
      || !dnd5eConfig?.restTypes?.long?.recoverSpellSlotTypes) {
    console.error("Declan's Homebrew Classes | Unable to register Zeal spellcasting.");
    return false;
  }

  const existing = dnd5eConfig.spellcasting.zeal;
  if (isZealConfiguration(existing)) {
    addZealRecovery(dnd5eConfig);
    return true;
  }
  if (existing) {
    console.error(
      "Declan's Homebrew Classes | A 'zeal' spellcasting method is already registered."
    );
    return false;
  }

  dnd5eConfig.spellcasting.zeal = zealSpellcastingConfiguration();
  addZealRecovery(dnd5eConfig);
  return true;
}

export function ensureZealSpellcastingModel(dnd5eConfig, dnd5eApi) {
  if (!dnd5eConfig?.spellcasting
      || !dnd5eConfig?.spellProgression
      || !dnd5eConfig?.restTypes?.short?.recoverSpellSlotTypes
      || !dnd5eConfig?.restTypes?.long?.recoverSpellSlotTypes) {
    console.error("Declan's Homebrew Classes | Unable to verify Zeal spellcasting.");
    return false;
  }

  let model = dnd5eConfig.spellcasting.zeal;
  if (model && !isZealConfiguration(model)) {
    console.error(
      "Declan's Homebrew Classes | A different 'zeal' spellcasting model is already registered."
    );
    return false;
  }
  if (!(model?.key === 'zeal' && model?.slots && isZealConfiguration(model))) {
    const Model = dnd5eApi?.dataModels?.spellcasting?.SingleLevelSpellcasting;
    if (typeof Model !== 'function') {
      console.error("Declan's Homebrew Classes | Zeal spellcasting model is unavailable.");
      return false;
    }
    try {
      model = new Model(zealSpellcastingConfiguration(), { key: 'zeal' });
      dnd5eConfig.spellcasting.zeal = model;
    } catch (error) {
      console.error(
        "Declan's Homebrew Classes | Unable to construct Zeal spellcasting model.",
        error
      );
      return false;
    }
  }

  dnd5eConfig.spellProgression.zeal = {
    label: 'Zeal Spellcasting',
    divisor: 1,
    type: 'zeal'
  };
  addZealRecovery(dnd5eConfig);
  return true;
}

Hooks.once('init', () => registerZealSpellcasting(CONFIG.DND5E));
Hooks.once('i18nInit', () => ensureZealSpellcastingModel(CONFIG.DND5E, globalThis.dnd5e));
