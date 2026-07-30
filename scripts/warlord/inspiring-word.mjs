import { MODULE_ID, WARLORD_ROLES } from './constants.mjs';
import { ensureLeadershipAbility as ensureStoredLeadershipAbility } from './leadership.mjs';
import { getWarlordRole } from './rules.mjs';

const pendingInspiringWordUses = new WeakMap();

function documents(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (typeof collection.values === 'function') return Array.from(collection.values());
  return Object.values(collection);
}

function hitDieDialogOptions() {
  return {
    window: { title: 'Choose Hit Die' },
    content: '<p>Choose the Hit Die of the creature you are inspiring.</p>',
    buttons: [
      { action: 'd6', label: 'd6', callback: () => 6 },
      { action: 'd8', label: 'd8', callback: () => 8 },
      { action: 'd10', label: 'd10', callback: () => 10 },
      { action: 'd12', label: 'd12', callback: () => 12 }
    ]
  };
}

async function promptForHitDie(options) {
  const dialog = globalThis.foundry?.applications?.api?.DialogV2;
  if (typeof dialog?.wait !== 'function') return undefined;
  return dialog.wait(options);
}

function sourceItem(activity) {
  return activity?.item ?? activity?.parent;
}

function sourceActor(activity, item) {
  return activity?.actor ?? item?.actor ?? item?.parent;
}

function isOwnedBy(actor, item) {
  return item?.actor === actor
    || item?.parent === actor
    || documents(actor?.items).some(entry => entry === item || entry?.id === item?.id);
}

export async function chooseHitDie({ prompt = promptForHitDie } = {}) {
  return prompt(hitDieDialogOptions());
}

export function findInspiringWordHelper(item, hitDie, ability) {
  return documents(item?.system?.activities).find(activity => (
    getWarlordRole(activity) === WARLORD_ROLES.INSPIRING_WORD_HELPER
    && activity?.flags?.[MODULE_ID]?.warlord?.hitDie === hitDie
    && activity?.flags?.[MODULE_ID]?.warlord?.leadershipAbility === ability
  ));
}

export async function useInspiringWord(activity, {
  ensureLeadershipAbility = ensureStoredLeadershipAbility,
  chooseHitDie: selectHitDie = chooseHitDie,
  leadershipOptions,
  hitDieOptions
} = {}) {
  const item = sourceItem(activity);
  const actor = sourceActor(activity, item);
  if (!actor || !item || !isOwnedBy(actor, item)) {
    throw new Error('Inspiring Word requires an actor-owned source item.');
  }

  const pending = pendingInspiringWordUses.get(actor);
  if (pending) return pending;

  const tracked = (async () => {
    if (!(Number(item.system?.uses?.value) > 0)) return;

    const ability = await ensureLeadershipAbility(actor, leadershipOptions);
    if (!ability) return;

    const hitDie = await selectHitDie(hitDieOptions);
    if (!hitDie) return;

    const helper = findInspiringWordHelper(item, hitDie, ability);
    if (!helper) {
      throw new Error('No matching Inspiring Word helper is available.');
    }
    await helper.use();
  })();
  pendingInspiringWordUses.set(actor, tracked);

  try {
    return await tracked;
  } finally {
    if (pendingInspiringWordUses.get(actor) === tracked) {
      pendingInspiringWordUses.delete(actor);
    }
  }
}
