import { registerVesselAutomationHooks } from './vessel/hooks.mjs';
import {
  refreshPrivateSpellCompendiumChoices,
  registerPrivateSpellCompendiumSetting
} from './vessel/spell-settings.mjs';
import { invalidateSpellProviderCache } from './vessel/spell-provider.mjs';

Hooks.once('init', () => {
  const vesselHooks = registerVesselAutomationHooks(Hooks);
  registerPrivateSpellCompendiumSetting({
    settings: game.settings,
    packs: game.packs,
    onChange: () => {
      invalidateSpellProviderCache();
      vesselHooks.reconcileSealedMagic();
    }
  });
});

Hooks.once('ready', () => {
  refreshPrivateSpellCompendiumChoices({
    settings: game.settings,
    packs: game.packs
  });
});
