import { registerVesselArmorClass } from './vessel/armor-class.mjs';

Hooks.once('init', () => {
  registerVesselArmorClass(CONFIG.DND5E);
});
