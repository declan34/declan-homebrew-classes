import { registerVesselAutomationHooks } from './vessel/hooks.mjs';

Hooks.once('init', () => {
  registerVesselAutomationHooks(Hooks);
});
