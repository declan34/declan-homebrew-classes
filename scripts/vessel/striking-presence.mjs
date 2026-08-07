import { MODULE_ID, STRIKING_PRESENCE_SKILLS } from './constants.mjs';

const STRIKING_PRESENCE_FLAG = 'vessel.strikingPresence.skill';
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
