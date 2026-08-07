import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(
  new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url)
);
const yaml = require('js-yaml');
const MODULE_ID = 'declan-homebrew-classes';

const {prepareUncannyAthleticsRoll} = await import(
  '../scripts/vessel/uncanny-strength.mjs'
);
const {registerVesselAutomationHooks} = await import(
  '../scripts/vessel/hooks.mjs'
);

function uncannyActor({
  mantle = false,
  isOwner = true,
  hasAspect = true,
  aspectIsOwner = true
} = {}) {
  const actor = {
    isOwner,
    flags: {
      [MODULE_ID]: {vessel: {mantle: {active: mantle}}}
    },
    items: new Map()
  };
  if (hasAspect) {
    actor.items.set('uncanny-strength', {
      id: 'uncanny-strength',
      identifier: 'uncanny-strength',
      isOwner: aspectIsOwner,
      actor
    });
  }
  return actor;
}

function hookRegistry() {
  const on = new Map();
  return {
    on,
    hooks: {
      on(name, handler) { on.set(name, handler); },
      once() {}
    }
  };
}

test('Uncanny Strength grants permanent Athletics proficiency through a transfer effect', () => {
  const item = yaml.load(readFileSync(
    new URL('../aspects-src/uncanny-strength.yml', import.meta.url),
    'utf8'
  ));
  const effect = item.effects.find(candidate => candidate.transfer === true);

  assert.ok(effect, 'expected a permanent transfer effect');
  assert.deepEqual(effect.changes, [{
    key: 'system.skills.ath.value', mode: 4, value: '1', priority: 20
  }]);
  assert.equal(effect.disabled, false);
});

test('Uncanny Strength leaves an uncloaked Athletics roll configuration unchanged', () => {
  assert.equal(typeof prepareUncannyAthleticsRoll, 'function');
  const config = {ability: 'str', skill: 'ath'};

  assert.equal(
    prepareUncannyAthleticsRoll(config, uncannyActor(), 'ath'),
    true
  );
  assert.equal(config.ability, 'str');
});

test('Uncanny Strength changes a cloaked owned Athletics roll configuration to Charisma', () => {
  assert.equal(typeof prepareUncannyAthleticsRoll, 'function');
  const config = {ability: 'str', skill: 'ath'};

  assert.equal(
    prepareUncannyAthleticsRoll(config, uncannyActor({mantle: true}), 'ath'),
    true
  );
  assert.equal(config.ability, 'cha');
});

test('Uncanny Strength leaves other skills and actors without its owned Aspect unchanged', () => {
  assert.equal(typeof prepareUncannyAthleticsRoll, 'function');
  const otherSkill = {ability: 'dex', skill: 'acr'};
  const absentAspect = {ability: 'str', skill: 'ath'};
  const unownedAspect = {ability: 'str', skill: 'ath'};

  assert.equal(
    prepareUncannyAthleticsRoll(otherSkill, uncannyActor({mantle: true}), 'acr'),
    true
  );
  assert.equal(otherSkill.ability, 'dex');
  assert.equal(
    prepareUncannyAthleticsRoll(
      absentAspect,
      uncannyActor({mantle: true, hasAspect: false}),
      'ath'
    ),
    true
  );
  assert.equal(absentAspect.ability, 'str');
  assert.equal(
    prepareUncannyAthleticsRoll(
      unownedAspect,
      uncannyActor({mantle: true, aspectIsOwner: false}),
      'ath'
    ),
    true
  );
  assert.equal(unownedAspect.ability, 'str');
});

test('the dnd5e pre-skill-roll hook delegates to the native workflow', () => {
  const registry = hookRegistry();
  const actor = uncannyActor({mantle: true});
  const config = {ability: 'str', skill: 'ath', subject: actor};

  registerVesselAutomationHooks(registry.hooks);

  const result = registry.on.get('dnd5e.preRollSkill')(config, {}, {});
  assert.equal(result, true);
  assert.equal(config.ability, 'cha');
});
