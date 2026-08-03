import {
  MODULE_ID,
  PRIVATE_SPELL_COMPENDIUM_SETTING
} from './constants.mjs';

const registeredSettings = new WeakMap();

export function buildItemPackChoices(packs) {
  const itemPacks = Array.from(packs?.values?.() ?? packs ?? [])
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

  const configuration = {
    name: 'Private Spell Compendium',
    hint: 'Optional Item compendium used to resolve Vessel Sealed Magic spells.',
    scope: 'world',
    config: true,
    restricted: true,
    type: String,
    choices: buildItemPackChoices(packs),
    default: '',
    onChange
  };
  settings.register(MODULE_ID, PRIVATE_SPELL_COMPENDIUM_SETTING, configuration);
  registeredSettings.set(settings, configuration);
  return true;
}

export function refreshPrivateSpellCompendiumChoices({ settings, packs }) {
  const key = `${MODULE_ID}.${PRIVATE_SPELL_COMPENDIUM_SETTING}`;
  const configuration = settings?.settings?.get?.(key)
    ?? registeredSettings.get(settings);
  if (!configuration) return false;

  const refreshed = buildItemPackChoices(packs);
  const choices = configuration.choices ??= {};
  for (const collection of Object.keys(choices)) delete choices[collection];
  Object.assign(choices, refreshed);
  return true;
}
