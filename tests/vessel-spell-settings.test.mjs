import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildItemPackChoices,
  registerPrivateSpellCompendiumSetting
} from '../scripts/vessel/spell-settings.mjs';

function pack(collection, label, type) {
  return { collection, metadata: { label, type } };
}

function settingRegistry() {
  const registrations = [];
  return {
    registrations,
    settings: {
      register(module, key, configuration) {
        registrations.push({ module, key, ...configuration });
      }
    }
  };
}

test('builds a None-first choice list from installed Item packs', () => {
  const choices = buildItemPackChoices([
    pack('private.spells', 'Private Spells', 'Item'),
    pack('private.actors', 'Private Actors', 'Actor'),
    pack('dnd5e.spells', 'SRD Spells', 'Item')
  ]);

  assert.deepEqual(choices, {
    '': 'None',
    'dnd5e.spells': 'SRD Spells',
    'private.spells': 'Private Spells'
  });
});

test('sorts Item pack choices deterministically by label', () => {
  const choices = buildItemPackChoices([
    pack('private.zebra', 'Zebra Spells', 'Item'),
    pack('private.alpha', 'Alpha Spells', 'Item')
  ]);

  assert.deepEqual(Object.keys(choices), [
    '',
    'private.alpha',
    'private.zebra'
  ]);
});

test('disambiguates duplicate Item pack labels with collection IDs', () => {
  const choices = buildItemPackChoices([
    pack('private.arcane', 'Shared Spells', 'Item'),
    pack('private.divine', 'Shared Spells', 'Item')
  ]);

  assert.deepEqual(choices, {
    '': 'None',
    'private.arcane': 'Shared Spells (private.arcane)',
    'private.divine': 'Shared Spells (private.divine)'
  });
});

test('registers a restricted world setting with an empty default', () => {
  const { settings, registrations } = settingRegistry();
  const packs = [pack('private.spells', 'Private Spells', 'Item')];
  const onChange = () => {};

  assert.equal(
    registerPrivateSpellCompendiumSetting({ settings, packs, onChange }),
    true
  );

  const { choices, name, hint, onChange: registeredOnChange, ...registration } = registrations[0];
  assert.deepEqual(registration, {
    module: 'declan-homebrew-classes',
    key: 'privateSpellCompendium',
    scope: 'world',
    config: true,
    restricted: true,
    type: String,
    default: ''
  });
  assert.deepEqual(choices, { '': 'None', 'private.spells': 'Private Spells' });
  assert.equal(name, 'Private Spell Compendium');
  assert.equal(
    hint,
    'Optional Item compendium used to resolve Vessel Sealed Magic spells.'
  );
  assert.equal(registeredOnChange, onChange);
});

test('registers each settings collection only once', () => {
  const { settings, registrations } = settingRegistry();
  const options = { settings, packs: [] };

  assert.equal(registerPrivateSpellCompendiumSetting(options), true);
  assert.equal(registerPrivateSpellCompendiumSetting(options), true);
  assert.equal(registrations.length, 1);
});

test('forwards changes to the supplied onChange callback', () => {
  const { settings, registrations } = settingRegistry();
  const changed = [];

  registerPrivateSpellCompendiumSetting({
    settings,
    packs: [],
    onChange: value => changed.push(value)
  });
  registrations[0].onChange('private.spells');

  assert.deepEqual(changed, ['private.spells']);
});
