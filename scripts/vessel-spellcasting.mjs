export const VESSEL_SLOT_TABLE = Object.freeze({
  2: Object.freeze({ slots: 2, level: 1 }),
  5: Object.freeze({ slots: 2, level: 2 }),
  9: Object.freeze({ slots: 2, level: 3 }),
  11: Object.freeze({ slots: 3, level: 3 }),
  13: Object.freeze({ slots: 3, level: 4 }),
  17: Object.freeze({ slots: 4, level: 5 })
});

export function registerVesselSpellcasting(dnd5eConfig) {
  if (!dnd5eConfig?.spellcasting
      || !dnd5eConfig?.restTypes?.short?.recoverSpellSlotTypes
      || !dnd5eConfig?.restTypes?.long?.recoverSpellSlotTypes) {
    console.error("Declan's Homebrew Classes | Unable to register Vessel spellcasting.");
    return false;
  }

  const existing = dnd5eConfig.spellcasting.vessel;
  if (existing?.table === VESSEL_SLOT_TABLE
      && existing?.progression?.vessel?.divisor === 1) {
    dnd5eConfig.restTypes.short.recoverSpellSlotTypes.add('vessel');
    dnd5eConfig.restTypes.long.recoverSpellSlotTypes.add('vessel');
    return true;
  }
  if (existing) {
    console.error(
      "Declan's Homebrew Classes | A 'vessel' spellcasting method is already registered."
    );
    return false;
  }

  dnd5eConfig.spellcasting.vessel = {
    label: 'Vessel Magic',
    type: 'single',
    cantrips: true,
    prepares: true,
    order: 15,
    img: 'icons/magic/unholy/silhouette-robe-evil-power.webp',
    table: VESSEL_SLOT_TABLE,
    progression: {
      vessel: {
        label: 'Vessel Magic',
        divisor: 1
      }
    }
  };
  dnd5eConfig.restTypes.short.recoverSpellSlotTypes.add('vessel');
  dnd5eConfig.restTypes.long.recoverSpellSlotTypes.add('vessel');
  return true;
}

Hooks.once('init', () => registerVesselSpellcasting(CONFIG.DND5E));
