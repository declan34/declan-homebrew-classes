import { registerVesselArmorClass } from './vessel/armor-class.mjs';
import { registerVesselAutomationHooks } from './vessel/hooks.mjs';

Hooks.once('init', () => {
  registerVesselArmorClass(CONFIG.DND5E);
  registerVesselAutomationHooks(Hooks);
});
