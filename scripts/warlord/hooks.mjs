import { WARLORD_CLASS_IDENTIFIER, WARLORD_ROLES } from './constants.mjs';
import {
  chooseLeadershipAbility,
  configureLeadershipItems,
  ensureLeadershipAbility
} from './leadership.mjs';
import { useInspiringWord } from './inspiring-word.mjs';
import { migrateWarlordActor, reconcileWarlordActor } from './migration.mjs';
import {
  getIdentifier,
  getLeadershipAbility,
  getWarlordRole
} from './rules.mjs';

const pendingActivities = new WeakMap();

function documents(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (typeof collection.values === 'function') return Array.from(collection.values());
  return Object.values(collection);
}

function reportError(error) {
  console.error("Declan's Homebrew Classes | Warlord automation failed.", error);
  globalThis.ui?.notifications?.error(error.message);
}

function actorFor(activity) {
  return activity?.actor ?? activity?.item?.actor ?? activity?.parent?.actor;
}

function itemFor(activity) {
  return activity?.item ?? activity?.parent;
}

function activityKey(activity) {
  return `${itemFor(activity)?.id ?? 'item'}:${activity?.id ?? activity?._id}`;
}

function pendingSet(actor) {
  let pending = pendingActivities.get(actor);
  if (!pending) {
    pending = new Map();
    pendingActivities.set(actor, pending);
  }
  return pending;
}

function scheduleActivity(activity, operation, onError) {
  const actor = actorFor(activity);
  if (!actor) return false;
  const key = activityKey(activity);
  const pending = pendingSet(actor);
  if (pending.has(key)) return false;
  const state = { phase: 'pending' };
  pending.set(key, state);

  queueMicrotask(() => {
    void (async () => {
      try {
        await operation(state);
      } catch (error) {
        onError(error);
      } finally {
        pending.delete(key);
        if (!pending.size) pendingActivities.delete(actor);
      }
    })();
  });
  return true;
}

function sourceActivity(activity) {
  const actor = actorFor(activity);
  const item = itemFor(activity);
  const sourceItem = actor?.items?.get?.(item?.id)
    ?? documents(actor?.items).find(candidate => candidate?.id === item?.id)
    ?? item;
  return sourceItem?.system?.activities?.get?.(activity.id)
    ?? sourceItem?.system?.activities?.[activity.id];
}

function hasWarlordActivity(item) {
  return documents(item?.system?.activities).some(activity => getWarlordRole(activity));
}

function isWarlordClass(item) {
  return item?.type === 'class'
    && getIdentifier(item) === WARLORD_CLASS_IDENTIFIER;
}

export function handleWarlordPreUse(activity, {
  useInspiringWord: useInspiring = useInspiringWord,
  chooseLeadershipAbility: chooseLeadership = chooseLeadershipAbility,
  ensureLeadershipAbility: ensureLeadership = ensureLeadershipAbility,
  configureLeadershipItems: configureLeadership = configureLeadershipItems,
  reportError: onError = reportError
} = {}) {
  const role = getWarlordRole(activity);
  if (!role) return;

  const actor = actorFor(activity);
  const pending = actor ? pendingActivities.get(actor) : undefined;
  const key = activityKey(activity);
  const pendingState = pending?.get(key);

  if (role === WARLORD_ROLES.INSPIRING_WORD_LAUNCHER) {
    if (!pendingState) {
      scheduleActivity(activity, () => useInspiring(activity), onError);
    }
    return false;
  }

  if (role === WARLORD_ROLES.LEADERSHIP_CONFIG) {
    if (!pendingState) {
      scheduleActivity(activity, () => chooseLeadership(actor), onError);
    }
    return false;
  }

  if (!activity?.save || getLeadershipAbility(actor)) return;
  if (pendingState) {
    return pendingState.phase === 'retrying' ? undefined : false;
  }

  scheduleActivity(activity, async state => {
    const ability = await ensureLeadership(actor);
    if (!ability) return;
    await configureLeadership(actor, ability);
    state.phase = 'retrying';
    const retry = sourceActivity(activity);
    if (typeof retry?.use !== 'function') {
      throw new Error('The actor-owned Warlord activity is unavailable for retry.');
    }
    await retry.use();
  }, onError);
  return false;
}

export function getResponsibleUser(actor, users) {
  const active = documents(users)
    .filter(user => user?.active && user.id)
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  return active.find(user => user.isGM)
    ?? active.find(user => actor?.testUserPermission?.(user, 'OWNER'));
}

export function registerWarlordHooks(hooks, {
  actors = () => globalThis.game?.actors ?? [],
  users = () => globalThis.game?.users ?? [],
  currentUserId = () => globalThis.game?.user?.id,
  migrateActor: migrate = migrateWarlordActor,
  reconcileActor: reconcile = reconcileWarlordActor,
  preUseOptions = {}
} = {}) {
  hooks.on(
    'dnd5e.preUseActivity',
    activity => handleWarlordPreUse(activity, preUseOptions)
  );

  hooks.on('createItem', (item, _options, userId) => {
    if (userId !== currentUserId() || !item?.actor) return;
    if (isWarlordClass(item) || hasWarlordActivity(item)) {
      void reconcile(item.actor).catch(reportError);
    }
  });

  hooks.on('updateItem', (item, changes, _options, userId) => {
    if (userId !== currentUserId() || !isWarlordClass(item)) return;
    if (Object.hasOwn(changes?.system ?? {}, 'levels')) {
      void reconcile(item.actor).catch(reportError);
    }
  });

  hooks.once('ready', () => {
    const availableUsers = users();
    const userId = currentUserId();
    for (const actor of actors()) {
      if (getResponsibleUser(actor, availableUsers)?.id !== userId) continue;
      void (async () => {
        try {
          await migrate(actor);
        } catch (error) {
          reportError(error);
        }
        await reconcile(actor);
      })().catch(reportError);
    }
  });
}
