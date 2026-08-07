import { MODULE_ID, STRIKING_PRESENCE_SKILLS } from './constants.mjs';
import { isSpiritMantleActive } from './mantle.mjs';
import { serializeActorOperation } from './operations.mjs';

const STRIKING_PRESENCE_FLAG = 'vessel.strikingPresence.skill';
const STRIKING_PRESENCE_EFFECT_FLAG = 'strikingPresence';
const validSkills = new Set(STRIKING_PRESENCE_SKILLS);

function requireOwner(item) {
  if (!item?.isOwner) {
    throw new Error('You do not have permission to configure this Striking Presence.');
  }
}

function defaultChoice(options) {
  const dialog = globalThis.foundry?.applications?.api?.DialogV2;
  if (typeof dialog?.wait !== 'function') return Promise.resolve(undefined);
  return dialog.wait(options);
}

function dialogOptions() {
  return {
    window: { title: 'Configure Striking Presence' },
    content: '<p>Choose the skill empowered by your Striking Presence.</p>',
    buttons: [
      { action: 'dec', label: 'Deception', callback: () => 'dec' },
      { action: 'itm', label: 'Intimidation', callback: () => 'itm' },
      { action: 'per', label: 'Persuasion', callback: () => 'per' },
      { action: 'cancel', label: 'Cancel', callback: () => undefined }
    ],
    close: () => undefined
  };
}

function storedSkill(item) {
  if (typeof item?.getFlag === 'function') {
    return item.getFlag(MODULE_ID, STRIKING_PRESENCE_FLAG);
  }
  return STRIKING_PRESENCE_FLAG.split('.').reduce(
    (value, segment) => value?.[segment],
    item?.flags?.[MODULE_ID]
  );
}

export function getStrikingPresenceSkill(item) {
  const skill = storedSkill(item);
  return validSkills.has(skill) ? skill : undefined;
}

export async function configureStrikingPresence(item, {
  choose = defaultChoice
} = {}) {
  requireOwner(item);
  const skill = await choose(dialogOptions());
  if (!validSkills.has(skill)) return undefined;
  await item.setFlag(MODULE_ID, STRIKING_PRESENCE_FLAG, skill);
  return skill;
}

function documents(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  return Array.from(collection.values?.() ?? collection);
}

function isStrikingPresence(item) {
  return item?.identifier === 'striking-presence'
    || item?.system?.identifier === 'striking-presence';
}

function sourceIdentity(item) {
  const sourceItemId = item?.id ?? item?._id;
  const sourceItemUuid = item?.uuid;
  if (!sourceItemId || !sourceItemUuid) return;
  return {sourceItemId, sourceItemUuid};
}

function effectIdentity(type, {sourceItemId, sourceItemUuid}) {
  return `${type}:${sourceItemId}:${sourceItemUuid}`;
}

function desiredEffects(actor) {
  const desired = new Map();
  for (const item of documents(actor?.items)) {
    if (!isStrikingPresence(item)) continue;
    const skill = getStrikingPresenceSkill(item);
    const source = sourceIdentity(item);
    if (!skill || !source) continue;

    desired.set(effectIdentity('proficiency', source), {
      item,
      skill,
      source,
      type: 'proficiency'
    });
    if (isSpiritMantleActive(actor)) {
      desired.set(effectIdentity('advantage', source), {
        item,
        skill,
        source,
        type: 'advantage'
      });
    }
  }
  return desired;
}

function strikingPresenceEffect(effect) {
  const flag = effect?.flags?.[MODULE_ID]?.vessel?.[STRIKING_PRESENCE_EFFECT_FLAG];
  if (!['proficiency', 'advantage'].includes(flag?.type)) return;
  if (!flag.sourceItemId || !flag.sourceItemUuid) return;
  return flag;
}

function effectData({item, skill, source, type}) {
  const change = type === 'proficiency'
    ? {
      key: `system.skills.${skill}.value`,
      mode: 4,
      value: '1',
      priority: 20
    }
    : {
      key: `system.skills.${skill}.roll.mode`,
      mode: 2,
      value: '1',
      priority: 20
    };
  return {
    name: `Striking Presence (${skill})`,
    origin: item.uuid,
    disabled: false,
    transfer: false,
    changes: [change],
    flags: {
      [MODULE_ID]: {
        vessel: {
          [STRIKING_PRESENCE_EFFECT_FLAG]: {type, ...source}
        }
      }
    }
  };
}

export async function reconcileStrikingPresenceUnlocked(actor) {
  const desired = desiredEffects(actor);
  const retained = new Set();
  const remove = [];
  const updates = [];

  for (const effect of documents(actor?.effects)) {
    const flag = strikingPresenceEffect(effect);
    if (!flag) continue;
    const identity = effectIdentity(flag.type, flag);
    if (!desired.has(identity) || retained.has(identity)) remove.push(effect);
    else {
      retained.add(identity);
      const canonical = effectData(desired.get(identity));
      const repair = {_id: effect._id};
      for (const key of ['name', 'origin', 'disabled', 'transfer', 'changes']) {
        if (JSON.stringify(effect[key]) !== JSON.stringify(canonical[key])) {
          repair[key] = canonical[key];
        }
      }
      if (Object.keys(repair).length > 1) updates.push(repair);
    }
  }

  if (remove.length) {
    await actor.deleteEmbeddedDocuments(
      'ActiveEffect',
      remove.map(effect => effect._id)
    );
  }

  if (updates.length) {
    await actor.updateEmbeddedDocuments('ActiveEffect', updates);
  }

  const create = [...desired]
    .filter(([identity]) => !retained.has(identity))
    .map(([, data]) => effectData(data));
  if (create.length) await actor.createEmbeddedDocuments('ActiveEffect', create);
}

export async function reconcileStrikingPresence(actor) {
  return serializeActorOperation(actor, reconcileStrikingPresenceUnlocked);
}
