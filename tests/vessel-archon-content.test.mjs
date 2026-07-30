import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(
  new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url)
);
const yaml = require('js-yaml');

const MODULE_ID = 'declan-homebrew-classes';
const PACK_PREFIX =
  'Compendium.declan-homebrew-classes.vessel-archon-forms.Actor.';
const ITEM_PREFIX =
  'Compendium.declan-homebrew-classes.homebrew-classes.Item.';

const CONTROLS = Object.freeze({
  'the-ascended': {
    file: 'the-ascended',
    id: 'hbrAscCtrlForm01',
    profileIds: ['hbrAscArchon0001']
  },
  'the-cataclysm': {
    file: 'the-cataclysm',
    id: 'hbrCatCtrlForm01',
    profileIds: [
      'hbrAirArchon0001',
      'hbrErtArchon0001',
      'hbrFirArchon0001',
      'hbrWatArchon0001'
    ]
  },
  'the-cursed': {
    file: 'the-cursed',
    id: 'hbrCurCtrlForm01',
    profileIds: ['hbrCurArchon0001']
  },
  'the-fallen': {
    file: 'the-fallen',
    id: 'hbrFalCtrlForm01',
    profileIds: ['hbrFalArchon0001']
  },
  'the-formless': {
    file: 'the-formless',
    id: 'hbrForCtrlForm01',
    profileIds: ['hbrForArchon0001']
  },
  'the-trickster': {
    file: 'the-trickster',
    id: 'hbrTriCtrlForm01',
    profileIds: ['hbrTriArchon0001']
  }
});

function load(relativePath) {
  return yaml.load(readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8'));
}

function role(activity) {
  return activity.flags?.[MODULE_ID]?.vessel?.role;
}

function activityByRole(control, expectedRole) {
  return Object.values(control.system.activities)
    .find(activity => role(activity) === expectedRole);
}

test('each Vessel subclass grants its dedicated Archon Form control at level 3', () => {
  for (const [subclass, expected] of Object.entries(CONTROLS)) {
    const control = load(
      `src/vessel/subclass-features/${expected.file}/archon-form-control.yml`
    );
    const subclassItem = load(`src/vessel/${expected.file}.yml`);
    const advancement = subclassItem.system.advancement
      .find(entry => entry.type === 'ItemGrant' && entry.level === 3);

    assert.equal(control._id, expected.id, subclass);
    assert.match(control._id, /^[A-Za-z0-9]{16}$/, subclass);
    assert.equal(control.system.identifier, `${subclass}-archon-form-control`);
    assert.deepEqual(
      Object.keys(control.system.description).sort(),
      ['chat', 'value'],
      `${subclass} description schema`
    );
    assert.ok(
      advancement.configuration.items.some(entry =>
        entry.uuid === `${ITEM_PREFIX}${expected.id}` && entry.optional === false
      ),
      `${subclass} level-3 ItemGrant`
    );
  }
});

test('Archon controls expose five role-tagged native activities', () => {
  const expectedRoles = new Set([
    'archon-transform-free',
    'archon-transform-slot',
    'archon-extend',
    'archon-revert',
    'archon-equipment-preference'
  ]);

  for (const [subclass, expected] of Object.entries(CONTROLS)) {
    const control = load(
      `src/vessel/subclass-features/${expected.file}/archon-form-control.yml`
    );
    const activities = Object.values(control.system.activities);

    assert.deepEqual(new Set(activities.map(role)), expectedRoles, subclass);
    for (const activity of activities) {
      assert.match(activity._id, /^[A-Za-z0-9]{16}$/, `${subclass}: ${role(activity)}`);
    }
  }
});

test('transform activities reference only their subclass profiles and share safe settings', () => {
  const expectedSettings = {
    effects: ['origin', 'otherOrigin', 'background', 'class', 'feat', 'spell'],
    keep: ['physical', 'mental', 'gearProf', 'class', 'feats', 'spells', 'bio', 'hp'],
    merge: ['saves', 'skills'],
    minimumAC: '',
    other: [],
    preset: null,
    spellLists: [],
    tempFormula: '2 * @classes.vessel.levels',
    transformTokens: true
  };

  for (const [subclass, expected] of Object.entries(CONTROLS)) {
    const control = load(
      `src/vessel/subclass-features/${expected.file}/archon-form-control.yml`
    );

    for (const expectedRole of ['archon-transform-free', 'archon-transform-slot']) {
      const activity = activityByRole(control, expectedRole);
      assert.equal(activity.type, 'transform', `${subclass}: ${expectedRole}`);
      assert.deepEqual(
        activity.profiles.map(profile => profile.uuid),
        expected.profileIds.map(id => `${PACK_PREFIX}${id}`),
        `${subclass}: ${expectedRole}`
      );
      assert.ok(activity.profiles.every(profile =>
        /^[A-Za-z0-9]{16}$/.test(profile._id)
      ));
      assert.deepEqual(activity.settings, expectedSettings);
      assert.deepEqual(activity.transform, {
        customize: true,
        mode: '',
        preset: ''
      });
    }
  }
});

test('free, slot, extend, revert, and equipment activities consume only intended resources', () => {
  for (const expected of Object.values(CONTROLS)) {
    const control = load(
      `src/vessel/subclass-features/${expected.file}/archon-form-control.yml`
    );
    const free = activityByRole(control, 'archon-transform-free');
    const slot = activityByRole(control, 'archon-transform-slot');
    const extend = activityByRole(control, 'archon-extend');
    const revert = activityByRole(control, 'archon-revert');
    const equipment = activityByRole(control, 'archon-equipment-preference');

    assert.deepEqual(free.consumption.targets, [{
      type: 'itemUses',
      target: '',
      value: '1',
      scaling: {}
    }]);
    for (const activity of [slot, extend]) {
      assert.deepEqual(activity.consumption.targets, [{
        type: 'attribute',
        target: 'spells.vessel.value',
        value: '1',
        scaling: {}
      }]);
    }
    assert.deepEqual(revert.consumption.targets, []);
    assert.deepEqual(equipment.consumption.targets, []);
    assert.equal(extend.type, 'utility');
    assert.equal(revert.type, 'utility');
    assert.equal(equipment.type, 'utility');
  }
});

test('the generic Archon Form remains the one-use resource and declares resource metadata', () => {
  const archonForm = load('src/vessel/class-features/archon-form.yml');
  const metadata = archonForm.flags?.[MODULE_ID]?.vessel;

  assert.equal(archonForm._id, 'hbrvesnmpXyN7pCZ');
  assert.equal(archonForm.system.uses.max, '1');
  assert.deepEqual(archonForm.system.uses.recovery, [{
    period: 'sr',
    type: 'recoverAll'
  }]);
  assert.deepEqual(archonForm.system.activities, {});
  assert.deepEqual(metadata, {
    role: 'archon-resource',
    archon: {
      controls: Object.values(CONTROLS).map(control => control.id)
    }
  });
});
