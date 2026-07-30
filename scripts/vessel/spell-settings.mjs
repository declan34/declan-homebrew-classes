import {
  MODULE_ID,
  PRIVATE_SPELL_COMPENDIUM_SETTING
} from './constants.mjs';

const registeredSettings = new WeakSet();

export function buildItemPackChoices(packs) {
  const itemPacks = Array.from(packs ?? [])
    .filter(pack => (pack.documentName ?? pack.metadata?.type) === 'Item')
    .map(pack => ({
      collection: pack.collection,
      label: pack.metadata?.label ?? pack.title
    }))
    .filter(pack => pack.collection && pack.label)
    .sort((first, second) => {
      const labelOrder = first.label.localeCompare(second.label);
      return labelOrder || first.collection.localeCompare(second.collection);
    });
  const labelCounts = new Map();
  for (const { label } of itemPacks) {
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }

  const choices = { '': 'None' };
  for (const { collection, label } of itemPacks) {
    choices[collection] = labelCounts.get(label) > 1
      ? `${label} (${collection})`
      : label;
  }
  return choices;
}

export function registerPrivateSpellCompendiumSetting({ settings, packs, onChange }) {
  if (!settings?.register) return false;
  if (registeredSettings.has(settings)) return true;

  settings.register(MODULE_ID, PRIVATE_SPELL_COMPENDIUM_SETTING, {
    name: 'Private Spell Compendium',
    hint: 'Optional Item compendium used to resolve Vessel Sealed Magic spells.',
    scope: 'world',
    config: true,
    restricted: true,
    type: String,
    choices: buildItemPackChoices(packs),
    default: '',
    onChange
  });
  registeredSettings.add(settings);
  return true;
}
