import {
  ARCHON_KEEP_EQUIPMENT_FLAG,
  AUTOMATION_ROLES,
  MODULE_ID
} from './constants.mjs';
import {
  clearArchonPending,
  extendArchonForm,
  finalizeArchonTransformation,
  getArchonPending,
  getArchonState,
  isArchonFormActive,
  prepareArchonTransformData,
  preparePendingArchonTransformData,
  revertArchonForm,
  stageArchonTransformation
} from './archon-lifecycle.mjs';
import { requestArchonActivityPreparation } from './archon-profiles.mjs';
import {
  activateSpiritMantle,
  deactivateSpiritMantle,
  isSpiritMantleActive,
  reconcileSpiritMantle,
  toggleSpiritMantle
} from './mantle.mjs';
import { migrateVesselActor } from './migration.mjs';
import {
  ARCHON_PROFILES,
  getAutomationRole,
  getUnlockedIridescentDamageTypes,
  getVesselLevel,
  shouldEndArchonFormAtZeroHP,
  shouldEndArchonFormForUnconscious
} from './rules.mjs';

const pendingActivationPrompts = new WeakMap();
const pendingArchonOrigins = new Map();
const finalizingArchons = new WeakSet();
const remindedElderArchons = new WeakSet();
const pendingRulePrompts = new WeakMap();

const ARCHON_TRANSFORM_ROLES = new Set([
  AUTOMATION_ROLES.ARCHON_TRANSFORM_FREE,
  AUTOMATION_ROLES.ARCHON_TRANSFORM_SLOT
]);

const ARCHON_ACTIVITY_ROLES = new Set([
  ...ARCHON_TRANSFORM_ROLES,
  AUTOMATION_ROLES.ARCHON_EXTEND,
  AUTOMATION_ROLES.ARCHON_REVERT
]);

function sourceItem(activity) {
  return activity?.item?.actor?.items?.get(activity.item.id) ?? activity?.item;
}

function reportError(error) {
  console.error("Declan's Homebrew Classes | Vessel automation failed.", error);
  globalThis.ui?.notifications?.error(error.message);
}

function warn(message) {
  globalThis.ui?.notifications?.warn(message);
}

function isVesselActor(actor) {
  return getVesselLevel(actor) > 0;
}

function documents(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  return Array.from(collection.values?.() ?? collection);
}

function defaultActors() {
  const actors = documents(globalThis.game?.actors);
  for (const token of documents(globalThis.canvas?.scene?.tokens)) {
    if (token?.actor) actors.push(token.actor);
  }
  return [...new Map(
    actors.filter(Boolean).map(actor => [actor.uuid ?? actor.id, actor])
  ).values()];
}

function findOwnedActivity(actor, activityRole) {
  for (const item of documents(actor?.items)) {
    for (const candidate of documents(item?.system?.activities)) {
      if (getAutomationRole(candidate) === activityRole) return candidate;
    }
  }
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

function readFlag(document, scope, key) {
  if (typeof document?.getFlag === 'function') return document.getFlag(scope, key);
  return key.split('.').reduce(
    (value, segment) => value?.[segment],
    document?.flags?.[scope]
  );
}

function archonProfileFromUuid(uuid) {
  return Object.values(ARCHON_PROFILES).find(profile => profile.uuid === uuid);
}

function messageTransformUuid(results) {
  const message = results?.message;
  return readFlag(message, 'dnd5e', 'transform.uuid')
    ?? message?.flags?.dnd5e?.transform?.uuid
    ?? results?.message?.flags?.dnd5e?.transform?.uuid;
}

function retryOwnedActivity(activity) {
  const item = sourceItem(activity);
  const sourceActivity = item?.system?.activities?.get?.(activity.id);
  if (!sourceActivity || typeof sourceActivity.use !== 'function') {
    throw new Error('The owned Archon Form activity could not be found for retry.');
  }
  return sourceActivity.use();
}

function equipmentPreference(actor) {
  return readFlag(actor, MODULE_ID, ARCHON_KEEP_EQUIPMENT_FLAG) === true;
}

function applyEquipmentPreference(activity, actor) {
  if (!ARCHON_TRANSFORM_ROLES.has(getAutomationRole(activity))) return;
  const settings = activity?.settings?.toObject?.()
    ?? structuredClone(activity?.settings ?? {});
  const keep = new Set(settings.keep ?? []);
  if (equipmentPreference(actor)) keep.add('items');
  else keep.delete('items');
  settings.keep = [...keep];
  activity.updateSource?.({ settings });
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
  requestArchonActivityPreparation: prepareArchon =
    requestArchonActivityPreparation,
  reportError: onError = reportError
} = {}, usageConfig = {}) {
  const activityRole = getAutomationRole(activity);
  if (ARCHON_ACTIVITY_ROLES.has(activityRole)) {
    const actor = activity?.item?.actor;
    if (
      [AUTOMATION_ROLES.ARCHON_EXTEND, AUTOMATION_ROLES.ARCHON_REVERT]
        .includes(activityRole)
      && !isArchonFormActive(actor)
    ) {
      warn('Archon Form is not active.');
      return false;
    }
    const result = prepareArchon(activity, usageConfig, {
      retry: retryOwnedActivity,
      onError
    });
    if (result !== false) applyEquipmentPreference(activity, actor);
    return result;
  }
  if (activityRole !== AUTOMATION_ROLES.IRIDESCENT_STRIKE) return;
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
  stageArchonTransformation: stageArchon = stageArchonTransformation,
  extendArchonForm: extendArchon = extendArchonForm,
  revertArchonForm: revertArchon = revertArchonForm,
  reportError: onError = reportError
} = {}, _usageConfig = {}, results = {}) {
  const activityRole = getAutomationRole(activity);
  const actor = activity?.item?.actor;
  if (ARCHON_TRANSFORM_ROLES.has(activityRole)) {
    const profileUuid = messageTransformUuid(results);
    const profile = archonProfileFromUuid(profileUuid)
      ?? { profile: String(profileUuid ?? '').split('.').at(-1), uuid: profileUuid };
    const pending = {
      activityId: activity.id,
      itemId: activity.item?.id,
      payment: activityRole === AUTOMATION_ROLES.ARCHON_TRANSFORM_FREE
        ? 'free'
        : 'slot',
      profile: profile.profile,
      profileUuid,
      stagedAt: Number(globalThis.game?.time?.worldTime) || 0,
      ...(profile.acBonus == null ? {} : { acBonus: profile.acBonus })
    };
    void stageArchon(actor, pending).catch(onError);
    return;
  }
  if (activityRole === AUTOMATION_ROLES.ARCHON_EXTEND) {
    void extendArchon(actor).catch(onError);
    return;
  }
  if (activityRole === AUTOMATION_ROLES.ARCHON_REVERT) {
    void revertArchon(actor, { sourceItem: sourceItem(activity) }).catch(onError);
    return;
  }
  if (activityRole !== AUTOMATION_ROLES.MANTLE_TOGGLE) return;
  void toggle(actor, { sourceItem: sourceItem(activity) }).catch(onError);
}

function matchesPendingProfile(actor, profile) {
  const pending = getArchonPending(actor);
  return pending?.profileUuid && pending.profileUuid === profile?.uuid
    ? pending
    : undefined;
}

export function handleLinkedArchonTransform(
  original,
  profile,
  changes,
  {
    prepareTransform = prepareArchonTransformData,
    now = () => globalThis.game?.time?.worldTime ?? 0
  } = {}
) {
  const pending = matchesPendingProfile(original, profile);
  if (!pending) return;
  const state = prepareTransform(original, profile, changes, {
    now: now(),
    payment: pending.payment
  });
  pendingArchonOrigins.set(state.sourceActorUuid, original);
  return state;
}

function pendingFromChanges(actor, changes) {
  return changes?.flags?.[MODULE_ID]?.vessel?.archon?.pending
    ?? getArchonPending(actor);
}

export function handlePreUpdateArchonActor(
  actor,
  changes,
  {
    preparePendingTransform = preparePendingArchonTransformData,
    now = () => globalThis.game?.time?.worldTime ?? 0
  } = {}
) {
  if (!actor?.isToken || changes?.flags?.dnd5e?.isPolymorphed !== true) return;
  const pending = pendingFromChanges(actor, changes);
  if (!pending?.profileUuid) return;
  const state = preparePendingTransform(actor, changes, pending, { now: now() });
  pendingArchonOrigins.set(state.sourceActorUuid, actor);
  return state;
}

async function resolveOriginalActor(state, resolveUuid = globalThis.fromUuid) {
  const local = pendingArchonOrigins.get(state?.sourceActorUuid);
  if (local) return local;
  if (!state?.sourceActorUuid || typeof resolveUuid !== 'function') return;
  return resolveUuid(state.sourceActorUuid);
}

export async function finalizeCreatedArchon(
  actor,
  {
    finalizeArchon = finalizeArchonTransformation,
    resolveUuid = globalThis.fromUuid,
    clearPending = clearArchonPending
  } = {}
) {
  const state = getArchonState(actor);
  if (!state?.active || finalizingArchons.has(actor)) return { handled: false };
  finalizingArchons.add(actor);
  try {
    const result = await finalizeArchon(actor);
    const original = await resolveOriginalActor(state, resolveUuid);
    if (original) await clearPending(original, state.profileUuid);
    pendingArchonOrigins.delete(state.sourceActorUuid);
    return result;
  } finally {
    finalizingArchons.delete(actor);
  }
}

function defaultChoice(options) {
  const dialog = globalThis.foundry?.applications?.api?.DialogV2;
  if (typeof dialog?.wait !== 'function') return Promise.resolve('later');
  return dialog.wait({
    window: { title: options.title },
    content: options.content,
    buttons: [
      {
        action: 'extend',
        label: 'Extend 10 Minutes',
        icon: '<i class="fa-solid fa-hourglass-half"></i>',
        callback: () => 'extend'
      },
      {
        action: 'revert',
        label: 'Revert',
        icon: '<i class="fa-solid fa-rotate-left"></i>',
        callback: () => 'revert'
      },
      {
        action: 'later',
        label: 'Later',
        callback: () => 'later'
      }
    ],
    close: () => 'later'
  });
}

export async function promptForArchonExpiry(actor, {
  choose = defaultChoice,
  now = globalThis.game?.time?.worldTime ?? 0,
  revertArchonForm: revertArchon = revertArchonForm
} = {}) {
  const state = getArchonState(actor);
  if (!state?.active) return;
  const remaining = Math.max(0, Math.ceil((Number(state.expiresAt) - Number(now)) / 60));
  const action = await choose({
    title: 'Archon Form Duration',
    content: `<p><strong>${state.profile}</strong> Archon Form has ${remaining} minute(s) remaining.</p>`
  });
  if (action === 'extend') {
    const activity = findOwnedActivity(actor, AUTOMATION_ROLES.ARCHON_EXTEND);
    if (!activity || typeof activity.use !== 'function') {
      throw new Error('The owned Extend Archon Form activity could not be found.');
    }
    await activity.use();
  } else if (action === 'revert') {
    await revertArchon(actor);
  }
}

function defaultConfirmation(options) {
  const dialog = globalThis.foundry?.applications?.api?.DialogV2;
  if (typeof dialog?.confirm !== 'function') return Promise.resolve(false);
  return dialog.confirm({
    window: { title: options.title },
    content: options.content,
    yes: { label: 'Revert' },
    no: { label: 'Later' }
  });
}

export async function promptForArchonReversion(actor, reason, {
  confirm = defaultConfirmation,
  revertArchonForm: revertArchon = revertArchonForm
} = {}) {
  const state = getArchonState(actor);
  if (!state?.active) return;
  const reasonText = reason === 'zero-hp'
    ? 'The transformed Vessel is at 0 hit points.'
    : 'The transformed Vessel is Unconscious before Controlled Transformation.';
  const accepted = await confirm({
    title: 'Revert Archon Form?',
    content: `<p>${reasonText} Revert using Foundry’s native transformation workflow?</p>`
  });
  if (accepted) await revertArchon(actor);
}

export async function remindElderArchon(actor, {
  dialog = globalThis.foundry?.applications?.api?.DialogV2
} = {}) {
  const content = '<p>Elder Archon: you may use an eligible Sealed Magic spell without expending a spell slot as part of this transformation.</p>';
  if (typeof dialog?.prompt === 'function') {
    await dialog.prompt({
      window: { title: 'Elder Archon' },
      content,
      ok: { label: 'Got It' }
    });
  } else {
    globalThis.ui?.notifications?.info(
      'Elder Archon: you may now use an eligible Sealed Magic spell for free.'
    );
  }
}

function responsibleHere(actor, users, currentUserId) {
  return getResponsibleUser(actor, users)?.id === currentUserId;
}

function queueActorPrompt(actor, key, request, onError = reportError) {
  let keys = pendingRulePrompts.get(actor);
  if (!keys) {
    keys = new Set();
    pendingRulePrompts.set(actor, keys);
  }
  if (keys.has(key)) return;
  keys.add(key);
  queueMicrotask(() => {
    void Promise.resolve()
      .then(request)
      .catch(onError)
      .finally(() => {
        keys.delete(key);
        if (!keys.size) pendingRulePrompts.delete(actor);
      });
  });
}

function isUnconscious(actor) {
  if (actor?.statuses?.has?.('unconscious')) return true;
  return documents(actor?.effects).some(effect =>
    effect?.statuses?.has?.('unconscious')
      || documents(effect?.statuses).includes('unconscious')
  );
}

function queueReversionRulePrompt(actor, {
  users,
  currentUserId,
  promptArchonReversion: prompt,
  reportError: onError
}) {
  if (!isArchonFormActive(actor)) return;
  if (!responsibleHere(actor, users, currentUserId)) return;
  const hp = actor?.system?.attributes?.hp?.value;
  if (shouldEndArchonFormAtZeroHP(hp)) {
    queueActorPrompt(
      actor,
      'zero-hp',
      () => prompt(actor, 'zero-hp'),
      onError
    );
    return;
  }
  if (
    isUnconscious(actor)
    && shouldEndArchonFormForUnconscious(actor)
  ) {
    queueActorPrompt(
      actor,
      'unconscious',
      () => prompt(actor, 'unconscious'),
      onError
    );
  }
}

export async function reconcileVesselActor(actor) {
  if (!actor?.isOwner || !isVesselActor(actor)) return;
  const mantle = documents(actor.items).find(
    item => item.identifier === 'spirit-mantle'
      || item.system?.identifier === 'spirit-mantle'
  );
  if (mantle) await reconcileSpiritMantle(actor, { sourceItem: mantle });
  else if (isSpiritMantleActive(actor)) await deactivateSpiritMantle(actor);
  else await reconcileSpiritMantle(actor);
}

export function getResponsibleUser(actor, users) {
  const activeUsers = documents(users)
    .filter(user => user?.active && user.id)
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  return activeUsers.find(user => user.isGM)
    ?? activeUsers.find(user => actor?.testUserPermission?.(user, 'OWNER'));
}

export function registerVesselAutomationHooks(hooks, {
  actors = defaultActors,
  users = () => globalThis.game?.users ?? [],
  currentUserId = () => globalThis.game?.user?.id,
  migrateActor: migrate = migrateVesselActor,
  reconcileActor: reconcile = reconcileVesselActor,
  deactivateSpiritMantle: deactivate = deactivateSpiritMantle,
  finalizeArchon = finalizeArchonTransformation,
  promptArchonExpiry = promptForArchonExpiry,
  promptArchonReversion = promptForArchonReversion,
  remindElderArchon: elderReminder = remindElderArchon
} = {}) {
  hooks.on('dnd5e.preUseActivity', (activity, usageConfig) =>
    handlePreUseActivity(activity, {}, usageConfig)
  );
  hooks.on('dnd5e.postUseActivity', (activity, usageConfig, results) =>
    handlePostUseActivity(activity, {}, usageConfig, results)
  );
  hooks.on('dnd5e.transformActorV2', handleLinkedArchonTransform);
  hooks.on('preUpdateActor', handlePreUpdateArchonActor);
  hooks.on('createActor', (actor, _options, userId) => {
    if (userId !== currentUserId()) return;
    if (finalizingArchons.has(actor)) return;
    void (async () => {
      const result = await finalizeCreatedArchon(actor, { finalizeArchon });
      if (
        result?.handled !== false
        && getVesselLevel(actor) >= 11
        && !remindedElderArchons.has(actor)
      ) {
        remindedElderArchons.add(actor);
        queueMicrotask(() => void elderReminder(actor).catch(reportError));
      }
    })().catch(reportError);
  });
  hooks.on('updateActor', (actor, changes, _options, userId) => {
    if (userId === currentUserId()
      && changes?.flags?.[MODULE_ID]?.vessel?.archon?.state?.active) {
      void (async () => {
        const result = await finalizeCreatedArchon(actor, { finalizeArchon });
        if (
          result?.handled !== false
          && getVesselLevel(actor) >= 11
          && !remindedElderArchons.has(actor)
        ) {
          remindedElderArchons.add(actor);
          queueMicrotask(() => void elderReminder(actor).catch(reportError));
        }
      })().catch(reportError);
    }
    queueReversionRulePrompt(actor, {
      users: users(),
      currentUserId: currentUserId(),
      promptArchonReversion,
      reportError
    });
  });
  hooks.on('createActiveEffect', effect => {
    queueReversionRulePrompt(effect?.parent, {
      users: users(),
      currentUserId: currentUserId(),
      promptArchonReversion,
      reportError
    });
  });
  hooks.on('updateActiveEffect', effect => {
    queueReversionRulePrompt(effect?.parent, {
      users: users(),
      currentUserId: currentUserId(),
      promptArchonReversion,
      reportError
    });
  });
  hooks.on('updateWorldTime', worldTime => {
    const availableUsers = users();
    const userId = currentUserId();
    for (const actor of actors()) {
      const state = getArchonState(actor);
      if (!state?.active || Number(state.expiresAt) > Number(worldTime)) continue;
      if (!responsibleHere(actor, availableUsers, userId)) continue;
      queueActorPrompt(
        actor,
        'expiry',
        () => promptArchonExpiry(actor, { now: worldTime }),
        reportError
      );
    }
  });

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
        void (async () => {
          try {
            await migrate(actor);
          } catch (error) {
            reportError(error);
          }
          await reconcile(actor);
        })().catch(reportError);
      }
    }
  });
}
