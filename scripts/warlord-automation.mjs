import { registerWarlordHooks } from './warlord/hooks.mjs';

Hooks.once('init', () => registerWarlordHooks(Hooks));
