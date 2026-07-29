import { VESSEL_ARMOR_CLASS } from './constants.mjs';

const VESSEL_AC = Object.freeze({
  label: 'Spirit Mantle',
  formula: '10 + @abilities.con.mod + @abilities.cha.mod'
});

export function registerVesselArmorClass(dnd5eConfig) {
  if (!dnd5eConfig?.armorClasses) {
    console.error(
      "Declan's Homebrew Classes | Unable to register Spirit Mantle armor."
    );
    return false;
  }

  const existing = dnd5eConfig.armorClasses[VESSEL_ARMOR_CLASS];
  if (existing?.label === VESSEL_AC.label && existing?.formula === VESSEL_AC.formula) {
    return true;
  }
  if (existing) {
    console.error(
      "Declan's Homebrew Classes | The 'vesselMantle' AC calculation is already registered."
    );
    return false;
  }

  dnd5eConfig.armorClasses[VESSEL_ARMOR_CLASS] = { ...VESSEL_AC };
  return true;
}
