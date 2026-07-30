import { WARLORD_CLASS_IDENTIFIER, WARLORD_ROLES } from './constants.mjs';
import {
  chooseLeadershipAbility,
  configureLeadershipItems,
  ensureLeadershipAbility,
  getLeadershipFormulaPaths,
  isLeadershipConfigurationPending,
  matchesLeadershipFormulas
} from './leadership.mjs';
import { useInspiringWord } from './inspiring-word.mjs';
import { migrateWarlordActor, reconcileWarlordActor } from './migration.mjs';
import {
  getIdentifier,
  getLeadershipAbility,
  getWarlordRole,
  leadershipFormula
} from './rules.mjs';

const pendingActivities = new WeakMap();
const leadershipRollRoles = new Set([WARLORD_ROLES.RALLYING_CRY]);

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

function requiresLeadership(activity) {
  return Boolean(activity?.save && typeof activity.save === 'object')
    || leadershipRollRoles.has(getWarlordRole(activity))
    || getLeadershipFormulaPaths(activity).length > 0;
}

function matchesLeadership(activity, ability) {
  if (activity?.save && typeof activity.save === 'object'
    && activity.save?.dc?.calculation !== ability) {
    return false;
  }
  if (leadershipRollRoles.has(getWarlordRole(activity))
    && activity?.roll?.formula !== leadershipFormula(ability)) {
    return false;
  }
  if (getLeadershipFormulaPaths(activity).length
    && !matchesLeadershipFormulas(activity, ability)) {
    return false;
  }
  return true;
}

function hasWarlordActivity(item) {
  return documents(item?.system?.activities).some(activity => getWarlordRole(activity));
}

function spendsTacticalExploitDie(activity) {
  return documents(activity?.consumption?.targets).some(
    target => target?.type === 'itemUses'
      && target?.target === 'tactical-exploits'
  );
}

function hasTacticalExploitPool(actor) {
  return documents(actor?.items).some(
    item => getIdentifier(item) === 'tactical-exploits'
  );
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
  leadershipConfigurationPending: configurationPending = isLeadershipConfigurationPending,
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

  const ownedActivity = sourceActivity(activity) ?? activity;
  if (spendsTacticalExploitDie(ownedActivity)
    && !hasTacticalExploitPool(actor)) {
    onError(new Error(
      'The Tactical Exploits resource is missing from this actor. '
      + 'Re-add or migrate the Warlord class features before using this Exploit.'
    ));
    return false;
  }
  if (!requiresLeadership(ownedActivity)) return;
  if (pendingState) {
    if (pendingState.phase === 'retry-armed') {
      pendingState.phase = 'native-use';
      return;
    }
    return false;
  }
  const storedAbility = getLeadershipAbility(actor);
  if (storedAbility
    && matchesLeadership(ownedActivity, storedAbility)
    && !configurationPending(actor)) {
    return;
  }

  scheduleActivity(activity, async state => {
    const ability = await ensureLeadership(actor);
    if (!ability) return;
    let configured = sourceActivity(activity) ?? activity;
    if (!matchesLeadership(configured, ability)) {
      await configureLeadership(actor, ability);
      configured = sourceActivity(activity) ?? activity;
    }
    if (!matchesLeadership(configured, ability)) {
      throw new Error('The actor-owned Warlord activity does not match its Leadership ability.');
    }
    state.phase = 'retry-armed';
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
