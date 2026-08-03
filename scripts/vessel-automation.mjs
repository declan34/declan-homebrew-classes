import { registerVesselAutomationHooks } from './vessel/hooks.mjs';
import {
  refreshPrivateSpellCompendiumChoices,
  registerPrivateSpellCompendiumSetting
} from './vessel/spell-settings.mjs';
import { invalidateSpellProviderCache } from './vessel/spell-provider.mjs';

Hooks.once('init', () => {
  registerPrivateSpellCompendiumSetting({
    settings: game.settings,
    packs: game.packs,
    onChange: invalidateSpellProviderCache
  });
  registerVesselAutomationHooks(Hooks);
});

Hooks.once('ready', () => {
  refreshPrivateSpellCompendiumChoices({
    settings: game.settings,
    packs: game.packs
  });
});
