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

const pendingActivationPrompts = new WeakMap();

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

function documents(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  return Array.from(collection.values?.() ?? collection);
}

function affectsEquipment(changes) {
  return Object.hasOwn(changes?.system ?? {}, 'equipped')
    || Object.hasOwn(changes?.system?.type ?? {}, 'value');
}

function serializedDamageParts(activity) {
  return activity?.damage?.parts?.map(part => part.toObject()) ?? [];
}

function hasCurrentIridescentDamageTypes(activity, actor) {
  const current = serializedDamageParts(
    sourceItem(activity)?.system?.activities?.get(activity.id)
  )[0]?.types ?? [];
  const allowed = getUnlockedIridescentDamageTypes(actor);
  return current.length === allowed.length
    && current.every((type, index) => type === allowed[index]);
}

function requestActivationPrompt(activity, prompt, onError) {
  const actor = activity?.item?.actor;
  if (actor && pendingActivationPrompts.has(actor)) return;

  let request;
  try {
    request = Promise.resolve(prompt(activity));
  } catch (error) {
    onError(error);
    return;
  }

  const tracked = (async () => {
    try {
      await request;
    } catch (error) {
      onError(error);
    } finally {
      if (actor && pendingActivationPrompts.get(actor) === tracked) {
        pendingActivationPrompts.delete(actor);
      }
    }
  })();
  if (actor) pendingActivationPrompts.set(actor, tracked);
}

export function prepareIridescentStrike(activity, actor) {
  const parts = serializedDamageParts(activity);
  if (!parts.length) return;
  parts[0].types = getUnlockedIridescentDamageTypes(actor);
  activity.updateSource({ damage: { parts } });
}

export async function persistIridescentStrikeAndRetry(activity) {
  const actor = activity?.item?.actor;
  const item = sourceItem(activity);
  const sourceActivity = item?.system?.activities?.get(activity.id);
  const parts = serializedDamageParts(sourceActivity);
  if (!parts.length) return;

  parts[0].types = getUnlockedIridescentDamageTypes(actor);
  await item.update({
    [`system.activities.${activity.id}.damage.parts`]: parts
  });

  const updatedItem = sourceItem(activity);
  await updatedItem.system.activities.get(activity.id).use();
}

export async function promptToActivateAndRetry(activity, {
  dialog = globalThis.foundry?.applications?.api?.DialogV2,
  confirm,
  activate = activateSpiritMantle
} = {}) {
  const actor = activity?.item?.actor;
  const confirmDialog = confirm
    ?? (typeof dialog?.confirm === 'function'
      ? options => dialog.confirm(options)
      : undefined);
  if (!actor?.isOwner || typeof confirmDialog !== 'function') {
    globalThis.ui?.notifications?.warn(
      'Activate Spirit Mantle before using an Iridescent Strike.'
    );
    return;
  }

  const accepted = await confirmDialog({
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
  promptToActivateAndRetry: prompt = promptToActivateAndRetry,
  persistIridescentStrikeAndRetry: persist = persistIridescentStrikeAndRetry,
  reportError: onError = reportError
} = {}) {
  if (getAutomationRole(activity) !== AUTOMATION_ROLES.IRIDESCENT_STRIKE) return;
  const actor = activity?.item?.actor;
  if (!isSpiritMantleActive(actor)) {
    requestActivationPrompt(activity, prompt, onError);
    return false;
  }
  if (!hasCurrentIridescentDamageTypes(activity, actor)) {
    void persist(activity).catch(onError);
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
  const mantle = documents(actor.items).find(
    item => item.identifier === 'spirit-mantle'
      || item.system?.identifier === 'spirit-mantle'
  );
  if (mantle) await reconcileSpiritMantle(actor, { sourceItem: mantle });
  else await deactivateSpiritMantle(actor);
}

export function getResponsibleUser(actor, users) {
  const activeUsers = documents(users)
    .filter(user => user?.active && user.id)
    .sort((left, right) => left.id.localeCompare(right.id));
  return activeUsers.find(user => user.isGM)
    ?? activeUsers.find(user => actor?.testUserPermission?.(user, 'OWNER'));
}

export function registerVesselAutomationHooks(hooks, {
  actors = () => globalThis.game?.actors ?? [],
  users = () => globalThis.game?.users ?? [],
  currentUserId = () => globalThis.game?.user?.id,
  reconcileActor: reconcile = reconcileActor,
  deactivateSpiritMantle: deactivate = deactivateSpiritMantle
} = {}) {
  hooks.on('dnd5e.preUseActivity', handlePreUseActivity);
  hooks.on('dnd5e.postUseActivity', handlePostUseActivity);

  hooks.on('updateItem', (item, changes, _options, userId) => {
    if (userId !== currentUserId()) return;
    if (item.type === 'equipment' && affectsEquipment(changes)) {
      void reconcile(item.actor).catch(reportError);
    }
  });
  hooks.on('createItem', (item, _options, userId) => {
    if (userId !== currentUserId()) return;
    if (item.type === 'equipment') void reconcile(item.actor).catch(reportError);
  });
  hooks.on('deleteItem', (item, _options, userId) => {
    if (userId !== currentUserId()) return;
    if (item.type === 'equipment') void reconcile(item.actor).catch(reportError);
    if (item.identifier === 'spirit-mantle' || item.system?.identifier === 'spirit-mantle') {
      void deactivate(item.actor).catch(reportError);
    }
  });
  hooks.on('deleteActiveEffect', (effect, _options, userId) => {
    if (userId !== currentUserId()) return;
    if (getAutomationRole(effect) === AUTOMATION_ROLES.MANTLE_AC) {
      queueMicrotask(() => void reconcile(effect.parent).catch(reportError));
    }
  });
  hooks.once('ready', () => {
    const availableUsers = users();
    const userId = currentUserId();
    for (const actor of actors()) {
      if (getResponsibleUser(actor, availableUsers)?.id === userId) {
        void reconcile(actor).catch(reportError);
      }
    }
  });
}
