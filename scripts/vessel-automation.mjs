import { registerVesselAutomationHooks } from './vessel/hooks.mjs';
import { registerPrivateSpellCompendiumSetting } from './vessel/spell-settings.mjs';

Hooks.once('init', () => {
  registerPrivateSpellCompendiumSetting({
    settings: game.settings,
    packs: game.packs
  });
  registerVesselAutomationHooks(Hooks);
});
