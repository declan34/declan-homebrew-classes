import {
  LEADERSHIP_ABILITIES,
  LEADERSHIP_FLAG,
  MODULE_ID,
  WARLORD_ROLES
} from './constants.mjs';
import {
  getLeadershipAbility,
  getWarlordRole,
  leadershipFormula
} from './rules.mjs';

const pendingLeadershipPrompts = new WeakMap();
const pendingLeadershipConfigurations = new WeakMap();
const leadershipAbilityValues = new Set(Object.values(LEADERSHIP_ABILITIES));
const leadershipRollRoles = new Set([WARLORD_ROLES.RALLYING_CRY]);
const leadershipAbilityToken = /@abilities\.(?:cha|wis|int)\.mod/g;

function documents(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (typeof collection.values === 'function') return Array.from(collection.values());
  return Object.values(collection);
}

function requireOwner(actor) {
  if (!actor?.isOwner) {
    throw new Error('You do not have permission to update this Warlord.');
  }
}

function propertyAtPath(value, path) {
  return path.split('.').reduce((current, segment) => current?.[segment], value);
}

export function getLeadershipFormulaPaths(activity) {
  const paths = activity?.flags?.[MODULE_ID]?.warlord?.leadershipFormulaPaths;
  if (!Array.isArray(paths)) return [];
  return paths.filter(path => typeof path === 'string' && path.length);
}

export function matchesLeadershipFormulas(activity, ability) {
  const paths = getLeadershipFormulaPaths(activity);
  if (!paths.length || !leadershipAbilityValues.has(ability)) return false;
  return paths.every(path => {
    const formula = propertyAtPath(activity, path);
    if (typeof formula !== 'string') return false;
    const tokens = [...formula.matchAll(
      /@abilities\.(cha|wis|int)\.mod/g
    )].map(match => match[1]);
    return tokens.length > 0 && tokens.every(token => token === ability);
  });
}

function leadershipDialogOptions() {
  return {
    window: { title: 'Choose Leadership Style' },
    content: '<p>Choose the ability that powers your Warlord Leadership features.</p>',
    buttons: [
      { action: 'captain', label: 'Captain', callback: () => 'captain' },
      { action: 'mentor', label: 'Mentor', callback: () => 'mentor' },
      { action: 'strategist', label: 'Strategist', callback: () => 'strategist' }
    ]
  };
}

async function promptForLeadershipAbility() {
  const dialog = globalThis.foundry?.applications?.api?.DialogV2;
  if (typeof dialog?.wait !== 'function') return undefined;
  return dialog.wait(leadershipDialogOptions());
}

async function configureLeadershipItemsNow(actor, ability) {
  const updates = documents(actor.items).map(async item => {
    const changes = {};
    for (const activity of documents(item?.system?.activities)) {
      const role = getWarlordRole(activity);
      if (!role) continue;

      if (activity?.save && typeof activity.save === 'object') {
        changes[`system.activities.${activity.id}.save.dc.calculation`] = ability;
      }
      if (leadershipRollRoles.has(role)) {
        changes[`system.activities.${activity.id}.roll.formula`] = leadershipFormula(ability);
      }
      for (const path of getLeadershipFormulaPaths(activity)) {
        const formula = propertyAtPath(activity, path);
        if (typeof formula !== 'string') continue;
        const configured = formula.replace(
          leadershipAbilityToken,
          leadershipFormula(ability)
        );
        if (configured !== formula) {
          changes[`system.activities.${activity.id}.${path}`] = configured;
        }
      }
    }
    if (!Object.keys(changes).length || typeof item?.update !== 'function') return false;

    await item.update(changes);
    return true;
  });

  const results = await Promise.allSettled(updates);
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
  return results.some(result => result.value);
}

export async function configureLeadershipItems(actor, ability) {
  requireOwner(actor);
  if (!leadershipAbilityValues.has(ability)) return false;

  const previous = pendingLeadershipConfigurations.get(actor);
  const tracked = (async () => {
    if (previous) {
      try {
        await previous;
      } catch {
        // A failed configuration must not prevent a later retry.
      }
    }
    return configureLeadershipItemsNow(actor, ability);
  })();
  pendingLeadershipConfigurations.set(actor, tracked);

  try {
    return await tracked;
  } finally {
    if (pendingLeadershipConfigurations.get(actor) === tracked) {
      pendingLeadershipConfigurations.delete(actor);
    }
  }
}

export function isLeadershipConfigurationPending(actor) {
  return pendingLeadershipPrompts.has(actor)
    || pendingLeadershipConfigurations.has(actor);
}

export async function chooseLeadershipAbility(actor, {
  prompt = promptForLeadershipAbility
} = {}) {
  requireOwner(actor);
  const pending = pendingLeadershipPrompts.get(actor);
  if (pending) return pending;

  const tracked = (async () => {
    const choice = await prompt(leadershipDialogOptions());
    const ability = LEADERSHIP_ABILITIES[choice];
    if (!ability) return undefined;

    if (getLeadershipAbility(actor)) {
      if (typeof actor?.unsetFlag !== 'function') {
        throw new Error('The Warlord Leadership flag cannot be cleared safely.');
      }
      await actor.unsetFlag(MODULE_ID, LEADERSHIP_FLAG);
    }
    await configureLeadershipItems(actor, ability);
    await actor.setFlag(MODULE_ID, LEADERSHIP_FLAG, ability);
    return ability;
  })();
  pendingLeadershipPrompts.set(actor, tracked);

  try {
    return await tracked;
  } finally {
    if (pendingLeadershipPrompts.get(actor) === tracked) {
      pendingLeadershipPrompts.delete(actor);
    }
  }
}

export async function ensureLeadershipAbility(actor, options) {
  const pendingChoice = pendingLeadershipPrompts.get(actor);
  if (pendingChoice) return pendingChoice;

  const pendingConfiguration = pendingLeadershipConfigurations.get(actor);
  if (pendingConfiguration) {
    await pendingConfiguration;
    return getLeadershipAbility(actor);
  }

  return getLeadershipAbility(actor) ?? chooseLeadershipAbility(actor, options);
}
