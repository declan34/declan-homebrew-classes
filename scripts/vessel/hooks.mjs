import { AUTOMATION_ROLES } from './constants.mjs';
import {
  activateSpiritMantle,
  deactivateSpiritMantle,
  isSpiritMantleActive,
  reconcileSpiritMantle,
  toggleSpiritMantle
} from './mantle.mjs';
import {
  getAutomationRole,
  getUnlockedIridescentDamageTypes,
  getVesselLevel
} from './rules.mjs';

function sourceItem(activity) {
  return activity?.item?.actor?.items?.get(activity.item.id) ?? activity?.item;
}

function reportError(error) {
  console.error("Declan's Homebrew Classes | Vessel automation failed.", error);
  globalThis.ui?.notifications?.error(error.message);
}

function isVesselActor(actor) {
  return getVesselLevel(actor) > 0;
}

function affectsEquipment(changes) {
  return Object.hasOwn(changes?.system ?? {}, 'equipped')
    || Object.hasOwn(changes?.system?.type ?? {}, 'value');
}

export function prepareIridescentStrike(activity, actor) {
  const parts = activity.damage.parts.map(part => part.toObject());
  if (!parts.length) return;
  parts[0].types = getUnlockedIridescentDamageTypes(actor);
  activity.updateSource({ damage: { parts } });
}

export async function promptToActivateAndRetry(activity, {
  confirm = globalThis.foundry?.applications?.api?.DialogV2?.confirm,
  activate = activateSpiritMantle
} = {}) {
  const actor = activity?.item?.actor;
  if (!actor?.isOwner || typeof confirm !== 'function') {
    globalThis.ui?.notifications?.warn(
      'Activate Spirit Mantle before using an Iridescent Strike.'
    );
    return;
  }

  const accepted = await confirm({
    window: { title: 'Activate Spirit Mantle?' },
    content: '<p>Iridescent Strikes require your Spirit Mantle. Activate it now?</p>',
    yes: { label: 'Activate Mantle' },
    no: { label: 'Cancel' }
  });
  if (!accepted) return;

  const item = sourceItem(activity);
  await activate(actor, { sourceItem: item });
  await item.system.activities.get(activity.id).use();
}

export function handlePreUseActivity(activity, {
  promptToActivateAndRetry: prompt = promptToActivateAndRetry
} = {}) {
  if (getAutomationRole(activity) !== AUTOMATION_ROLES.IRIDESCENT_STRIKE) return;
  const actor = activity?.item?.actor;
  if (!isSpiritMantleActive(actor)) {
    void prompt(activity).catch(reportError);
    return false;
  }
  prepareIridescentStrike(activity, actor);
}

export function handlePostUseActivity(activity, {
  toggleSpiritMantle: toggle = toggleSpiritMantle,
  reportError: onError = reportError
} = {}) {
  if (getAutomationRole(activity) !== AUTOMATION_ROLES.MANTLE_TOGGLE) return;
  const actor = activity?.item?.actor;
  void toggle(actor, { sourceItem: sourceItem(activity) }).catch(onError);
}

async function reconcileActor(actor) {
  if (!actor?.isOwner || !isVesselActor(actor) || !isSpiritMantleActive(actor)) return;
  const mantle = Array.from(actor.items ?? []).find(
    item => item.identifier === 'spirit-mantle'
      || item.system?.identifier === 'spirit-mantle'
  );
  if (mantle) await reconcileSpiritMantle(actor, { sourceItem: mantle });
  else await deactivateSpiritMantle(actor);
}

export function registerVesselAutomationHooks(hooks, {
  actors = () => globalThis.game?.actors ?? []
} = {}) {
  hooks.on('dnd5e.preUseActivity', handlePreUseActivity);
  hooks.on('dnd5e.postUseActivity', handlePostUseActivity);

  hooks.on('updateItem', (item, changes) => {
    if (item.type === 'equipment' && affectsEquipment(changes)) {
      void reconcileActor(item.actor).catch(reportError);
    }
  });
  hooks.on('createItem', item => {
    if (item.type === 'equipment') void reconcileActor(item.actor).catch(reportError);
  });
  hooks.on('deleteItem', item => {
    if (item.type === 'equipment') void reconcileActor(item.actor).catch(reportError);
    if (item.identifier === 'spirit-mantle' || item.system?.identifier === 'spirit-mantle') {
      void deactivateSpiritMantle(item.actor).catch(reportError);
    }
  });
  hooks.on('deleteActiveEffect', effect => {
    if (getAutomationRole(effect) === AUTOMATION_ROLES.MANTLE_AC) {
      queueMicrotask(() => void reconcileActor(effect.parent).catch(reportError));
    }
  });
  hooks.once('ready', () => {
    for (const actor of actors()) void reconcileActor(actor).catch(reportError);
  });
}
