# Vessel Stage 1 Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-click Spirit Mantle lifecycle, conditional Ethereal Armor, and native Charisma-based scaling Iridescent Strike activities.

**Architecture:** The Spirit Mantle compendium item owns one utility activity, two attack activities, and an inactive AC-effect template. Focused module services calculate Vessel rules, migrate legacy actor-owned Items, apply or reconcile the Mantle effect, and connect those operations to public Foundry and dnd5e hooks. Ethereal Armor uses dnd5e's competing minimum-AC field rather than replacing the actor's AC calculation. Attacks, critical hits, damage rolls, and damage-type choice remain native dnd5e activity workflows.

**Tech Stack:** Foundry VTT 13, dnd5e 5.3.3, ECMAScript modules, dnd5e YAML compendium sources, Node.js built-in test runner, `js-yaml`, `@foundryvtt/foundryvtt-cli`

## Global Constraints

- Target Foundry VTT 13 and dnd5e 5.3.3 or newer.
- Use native dnd5e documents and workflows whenever they can express the rule.
- Prompt the player before activating Spirit Mantle from an attempted Strike.
- Do not rewrite, replace, monkey-patch, or intercept dnd5e attack, damage, save, healing, rest, actor-preparation, or transformation engines.
- Do not require Midi-QOL or another automation module.
- Unsupported or ambiguous third-party workflows must degrade to the manually usable native activities.
- Preserve every non-Vessel actor's behavior when Vessel automation is unused.
- Keep every document ID at exactly 16 characters matching `[A-Za-z0-9]{16}`.
- Run `verifyPack`; it must report `{"ok":true,"errors":0}` before completion.
- Do not bump `module.json`, build a release archive, push, publish, or create a release without explicit user approval.
- Never add a `Co-Authored-By: Codex` trailer to a commit.

## File Structure

- Create `scripts/vessel/constants.mjs`: module flag paths, activity/effect roles, and AC calculation identifier.
- Create `scripts/vessel/rules.mjs`: pure Vessel-level, damage-die, damage-type, and armor-eligibility calculations.
- Create `scripts/vessel/migration.mjs`: versioned selective migration for legacy actor-owned Vessel Items.
- Create `scripts/vessel/mantle.mjs`: Mantle state transitions and Active Effect reconciliation.
- Create `scripts/vessel/hooks.mjs`: public Foundry/dnd5e hook handlers, confirmation prompt, and Strike preparation.
- Create `scripts/vessel-automation.mjs`: small module entry point that registers the AC mode and hooks.
- Modify `src/vessel/the-vessel.yml`: add the Iridescent Strike ScaleValue advancement.
- Modify `src/vessel/class-features/spirit-mantle.yml`: add native activities, roles, and the AC effect template.
- Modify `module.json`: load `scripts/vessel-automation.mjs` after the existing spellcasting module.
- Create `tests/vessel-rules.test.mjs`: pure rule-calculation tests.
- Create `tests/vessel-migration.test.mjs`: legacy actor and idempotency tests.
- Create `tests/vessel-compiled-pack.test.mjs`: read-only compiled LevelDB parity test.
- Create `tests/vessel-mantle.test.mjs`: state/effect lifecycle tests with document mocks.
- Create `tests/vessel-automation-hooks.test.mjs`: activity role, prompt, retry, and hook-registration tests.
- Modify `tests/vessel-spellcasting.test.mjs`: expect both module entry points.
- Modify `README.md`: describe the Stage 1 automation and its native-workflow boundary.

## Final review amendment for v1.5.0

This amendment supersedes the original custom AC-registration work in Task 3
and the original ready-time details in Task 5:

- No `vesselMantle` entry is registered in `CONFIG.DND5E.armorClasses`, and
  `scripts/vessel/armor-class.mjs` is removed.
- The module-owned effect applies
  `system.attributes.ac.min = 10 + @abilities.con.mod + @abilities.cha.mod`
  in Active Effect UPGRADE mode. dnd5e 5.3.3's actor preparation selects the
  higher of this minimum and the normal calculated AC.
- Ready processing elects one client with locale-independent code-unit ID
  ordering. That client runs the versioned actor-owned Item migration and then
  reconciles every Vessel actor, including actors whose Mantle flag is false or
  missing so stale module effects are removed safely.
- Migration version 1 merges the fixed ScaleValue, three activities, and effect
  template from the module compendium. It preserves user presentation, state,
  dynamic damage types, unrelated structures, and foreign flags; the version
  flag is stored only after successful updates. Migration errors are reported
  without suppressing the independent reconciliation pass.
- The compiled-pack regression copies the committed LevelDB into a temporary
  directory before extraction and compares the Vessel scale plus Spirit Mantle
  activities/effect with YAML source. The committed pack is never opened by the
  test.

---

### Task 1: Native Iridescent Strike content

**Files:**
- Modify: `src/vessel/the-vessel.yml`
- Modify: `src/vessel/class-features/spirit-mantle.yml`
- Create: `tests/vessel-spirit-mantle-content.test.mjs`

**Interfaces:**
- Consumes: dnd5e ScaleValue formulas in the form `@scale.<class identifier>.<scale identifier>`.
- Produces: `@scale.vessel.iridescent-strike`, activity roles `mantle-toggle` and `iridescent-strike`, and effect role `mantle-ac`.

- [ ] **Step 1: Write the failing compendium-source tests**

Create `tests/vessel-spirit-mantle-content.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(
  new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url)
);
const yaml = require('js-yaml');

const vessel = yaml.load(
  readFileSync(new URL('../src/vessel/the-vessel.yml', import.meta.url), 'utf8')
);
const mantle = yaml.load(
  readFileSync(
    new URL('../src/vessel/class-features/spirit-mantle.yml', import.meta.url),
    'utf8'
  )
);

function role(document) {
  return document.flags?.['declan-homebrew-classes']?.vessel?.role;
}

test('Vessel defines the Iridescent Strike damage scale', () => {
  const scale = vessel.system.advancement.find(
    advancement => advancement.type === 'ScaleValue'
      && advancement.configuration.identifier === 'iridescent-strike'
  );
  assert.ok(scale);
  assert.equal(scale._id, 'ZReRcAXx7wv1xOTO');
  assert.equal(scale.configuration.type, 'dice');
  assert.deepEqual(scale.configuration.scale, {
    1: { number: null, faces: 6, modifiers: [] },
    5: { number: null, faces: 8, modifiers: [] },
    11: { number: null, faces: 10, modifiers: [] },
    17: { number: null, faces: 12, modifiers: [] }
  });
});

test('Spirit Mantle exposes one toggle and two native Strikes', () => {
  const activities = Object.values(mantle.system.activities);
  assert.deepEqual(
    activities.map(activity => role(activity)).sort(),
    ['iridescent-strike', 'iridescent-strike', 'mantle-toggle']
  );

  const toggle = activities.find(activity => role(activity) === 'mantle-toggle');
  assert.equal(toggle.type, 'utility');
  assert.equal(toggle.activation.type, 'bonus');
  assert.deepEqual(toggle.consumption.targets, []);

  const strikes = activities.filter(
    activity => role(activity) === 'iridescent-strike'
  );
  assert.deepEqual(
    strikes.map(activity => activity.activation.type).sort(),
    ['action', 'bonus']
  );
  for (const strike of strikes) {
    assert.equal(strike.type, 'attack');
    assert.equal(strike.attack.ability, 'cha');
    assert.equal(strike.attack.type.value, 'melee');
    assert.equal(strike.attack.type.classification, 'unarmed');
    assert.equal(
      strike.damage.parts[0].custom.formula,
      '@scale.vessel.iridescent-strike + @mod'
    );
    assert.deepEqual(strike.damage.parts[0].types, ['radiant']);
  }
});

test('Spirit Mantle includes an inactive native AC effect template', () => {
  const effect = mantle.effects.find(candidate => role(candidate) === 'mantle-ac');
  assert.ok(effect);
  assert.equal(effect._id, '9VejV6Hl6RdY5Gzt');
  assert.equal(effect.disabled, true);
  assert.equal(effect.transfer, false);
  assert.deepEqual(effect.changes, [{
    key: 'system.attributes.ac.calc',
    mode: 5,
    value: 'vesselMantle',
    priority: 20
  }]);
});
```

- [ ] **Step 2: Run the source tests and confirm that they fail**

Run:

```bash
node --test tests/vessel-spirit-mantle-content.test.mjs
```

Expected: three failing tests because the scale, activities, and effect do not exist.

- [ ] **Step 3: Add the ScaleValue and native Spirit Mantle documents**

Add this advancement to `system.advancement` in `src/vessel/the-vessel.yml`, next
to the existing `aspects-known` ScaleValue:

```yaml
  - _id: ZReRcAXx7wv1xOTO
    type: ScaleValue
    configuration:
      identifier: iridescent-strike
      type: dice
      distance:
        units: ''
      scale:
        '1':
          number: null
          faces: 6
          modifiers: []
        '5':
          number: null
          faces: 8
          modifiers: []
        '11':
          number: null
          faces: 10
          modifiers: []
        '17':
          number: null
          faces: 12
          modifiers: []
    value: {}
    level: 1
    title: Iridescent Strike
    hint: ''
```

Replace `system.activities: {}` in
`src/vessel/class-features/spirit-mantle.yml` with:

```yaml
  activities:
    0I7T8AlyrNTKpU0h:
      _id: 0I7T8AlyrNTKpU0h
      type: utility
      name: Cloak or Dismiss
      sort: 0
      activation:
        type: bonus
        value: null
        override: false
        condition: ''
      consumption:
        scaling:
          allowed: false
          max: ''
        spellSlot: true
        targets: []
      description:
        chatFlavor: Toggle your Spirit Mantle.
      duration:
        units: inst
        concentration: false
        override: false
      effects: []
      flags:
        declan-homebrew-classes:
          vessel:
            role: mantle-toggle
      range:
        override: false
        units: self
        special: ''
      target:
        template:
          contiguous: false
          units: ft
          type: ''
        affects:
          choice: false
          count: ''
          type: self
          special: ''
        override: false
        prompt: false
      uses:
        spent: 0
        recovery: []
        max: ''
      roll:
        formula: ''
        name: ''
        prompt: false
        visible: false
    gDrrUixnPXPLBDHB:
      _id: gDrrUixnPXPLBDHB
      type: attack
      name: Iridescent Strike
      sort: 100000
      activation:
        type: action
        value: null
        override: false
        condition: ''
      consumption:
        scaling:
          allowed: false
          max: ''
        spellSlot: true
        targets: []
      description:
        chatFlavor: ''
      duration:
        units: inst
        concentration: false
        override: false
      effects: []
      flags:
        declan-homebrew-classes:
          vessel:
            role: iridescent-strike
      range:
        override: false
        units: self
        special: ''
      target:
        template:
          contiguous: false
          units: ft
          type: ''
        affects:
          choice: false
          count: '1'
          type: creature
          special: ''
        override: false
        prompt: true
      uses:
        spent: 0
        recovery: []
        max: ''
      attack:
        critical:
          threshold: null
        flat: false
        type:
          value: melee
          classification: unarmed
        ability: cha
        bonus: ''
      damage:
        critical:
          bonus: ''
        includeBase: true
        parts:
          - custom:
              enabled: true
              formula: '@scale.vessel.iridescent-strike + @mod'
            number: null
            denomination: 0
            bonus: ''
            types:
              - radiant
            scaling:
              number: 1
    dWCAZNHBAwxBjUw7:
      _id: dWCAZNHBAwxBjUw7
      type: attack
      name: Bonus Iridescent Strike
      sort: 200000
      activation:
        type: bonus
        value: null
        override: false
        condition: ''
      consumption:
        scaling:
          allowed: false
          max: ''
        spellSlot: true
        targets: []
      description:
        chatFlavor: ''
      duration:
        units: inst
        concentration: false
        override: false
      effects: []
      flags:
        declan-homebrew-classes:
          vessel:
            role: iridescent-strike
      range:
        override: false
        units: self
        special: ''
      target:
        template:
          contiguous: false
          units: ft
          type: ''
        affects:
          choice: false
          count: '1'
          type: creature
          special: ''
        override: false
        prompt: true
      uses:
        spent: 0
        recovery: []
        max: ''
      attack:
        critical:
          threshold: null
        flat: false
        type:
          value: melee
          classification: unarmed
        ability: cha
        bonus: ''
      damage:
        critical:
          bonus: ''
        includeBase: true
        parts:
          - custom:
              enabled: true
              formula: '@scale.vessel.iridescent-strike + @mod'
            number: null
            denomination: 0
            bonus: ''
            types:
              - radiant
            scaling:
              number: 1
```

Replace `effects: []` with this inactive template. Keep `_key` rooted at the
Spirit Mantle item ID:

```yaml
effects:
  - _id: 9VejV6Hl6RdY5Gzt
    name: Spirit Mantle — Ethereal Armor
    img: icons/magic/defensive/shield-barrier-glowing-triangle-blue.webp
    origin: Compendium.declan-homebrew-classes.homebrew-classes.Item.hbrvespnPw2Da1c3
    transfer: false
    disabled: true
    type: base
    system: {}
    changes:
      - key: system.attributes.ac.calc
        mode: 5
        value: vesselMantle
        priority: 20
    duration:
      startTime: null
      seconds: null
      combat: null
      rounds: null
      turns: null
      startRound: null
      startTurn: null
    description: '<p>While unarmored and not wielding a Shield, your base Armor Class is 10 + your Constitution modifier + your Charisma modifier.</p>'
    tint: '#ffffff'
    statuses: []
    sort: 0
    flags:
      declan-homebrew-classes:
        vessel:
          role: mantle-ac
      dnd5e:
        riders:
          statuses: []
    _stats:
      compendiumSource: null
      duplicateSource: null
      coreVersion: '13.344'
      systemId: dnd5e
      systemVersion: 5.3.3
      createdTime: null
      modifiedTime: null
      lastModifiedBy: hbrbuilder000000
      exportSource: null
    _key: '!items.effects!hbrvespnPw2Da1c3.9VejV6Hl6RdY5Gzt'
```

- [ ] **Step 4: Run the source test and all existing module tests**

Run:

```bash
node --test tests/vessel-spirit-mantle-content.test.mjs
node --test tests/*.test.mjs
```

Expected: the new file reports 3 passing tests and the full suite reports no failures.

- [ ] **Step 5: Commit the native content**

```bash
git add src/vessel/the-vessel.yml src/vessel/class-features/spirit-mantle.yml tests/vessel-spirit-mantle-content.test.mjs
git -c commit.gpgSign=false commit -m "feat: add native Spirit Mantle activities"
```

---

### Task 2: Pure Vessel rule helpers

**Files:**
- Create: `scripts/vessel/constants.mjs`
- Create: `scripts/vessel/rules.mjs`
- Create: `tests/vessel-rules.test.mjs`

**Interfaces:**
- Consumes: actor-like objects exposing `classes`, `items`, `itemTypes.equipment`, raw module flags, or `getFlag(scope, key)`.
- Produces:
  - `getVesselLevel(actor): number`
  - `getIridescentStrikeDie(level): string`
  - `getUnlockedIridescentDamageTypes(actor): string[]`
  - `isEtherealArmorEligible(actor): boolean`
  - `getAutomationRole(document): string | undefined`

- [ ] **Step 1: Write failing tests for every pure rule**

Create `tests/vessel-rules.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  getAutomationRole,
  getIridescentStrikeDie,
  getUnlockedIridescentDamageTypes,
  getVesselLevel,
  isEtherealArmorEligible
} = await import('../scripts/vessel/rules.mjs');

function item(identifier, type = 'feat', system = {}) {
  return { type, identifier, system: { identifier, ...system } };
}

function actor({
  level = 1,
  items = [],
  equipment = [],
  affinity
} = {}) {
  return {
    classes: { vessel: { system: { levels: level } } },
    items,
    itemTypes: { equipment },
    flags: {
      'declan-homebrew-classes': {
        vessel: { elementalAffinity: affinity }
      }
    }
  };
}

test('gets Vessel levels without counting other classes', () => {
  assert.equal(getVesselLevel(actor({ level: 11 })), 11);
  assert.equal(getVesselLevel({ classes: {} }), 0);
  assert.equal(getVesselLevel({
    items: [item('vessel', 'class', { levels: 7 })]
  }), 7);
});

test('maps Vessel levels to the Iridescent Strike die', () => {
  assert.equal(getIridescentStrikeDie(1), 'd6');
  assert.equal(getIridescentStrikeDie(4), 'd6');
  assert.equal(getIridescentStrikeDie(5), 'd8');
  assert.equal(getIridescentStrikeDie(11), 'd10');
  assert.equal(getIridescentStrikeDie(17), 'd12');
  assert.equal(getIridescentStrikeDie(20), 'd12');
});

test('adds only unlocked subclass damage types', () => {
  assert.deepEqual(getUnlockedIridescentDamageTypes(actor()), ['radiant']);
  assert.deepEqual(getUnlockedIridescentDamageTypes(actor({
    items: [item('ancient-knowledge')]
  })), ['radiant']);
  assert.deepEqual(getUnlockedIridescentDamageTypes(actor({
    items: [item('cursed-magic'), item('formless-magic'), item('trickster-magic')]
  })), ['radiant', 'fire', 'acid', 'psychic']);
  assert.deepEqual(getUnlockedIridescentDamageTypes(actor({
    items: [item('cataclysm-magic')],
    affinity: 'air'
  })), ['radiant', 'thunder']);
  assert.deepEqual(getUnlockedIridescentDamageTypes(actor({
    items: [item('cataclysm-magic')],
    affinity: 'earth'
  })), ['radiant', 'bludgeoning']);
  assert.deepEqual(getUnlockedIridescentDamageTypes(actor({
    items: [item('cataclysm-magic')],
    affinity: 'fire'
  })), ['radiant', 'fire']);
  assert.deepEqual(getUnlockedIridescentDamageTypes(actor({
    items: [item('cataclysm-magic')],
    affinity: 'water'
  })), ['radiant', 'cold']);
  assert.deepEqual(getUnlockedIridescentDamageTypes(actor({
    items: [item('cataclysm-magic')]
  })), ['radiant']);
});

test('allows Ethereal Armor only without equipped armor or Shield', () => {
  const equipped = type => ({
    system: { equipped: true, type: { value: type } }
  });
  const stowed = type => ({
    system: { equipped: false, type: { value: type } }
  });

  assert.equal(isEtherealArmorEligible(actor()), true);
  assert.equal(isEtherealArmorEligible(actor({
    equipment: [stowed('light')]
  })), true);
  assert.equal(isEtherealArmorEligible(actor({
    equipment: [equipped('clothing')]
  })), true);
  assert.equal(isEtherealArmorEligible(actor({
    equipment: [equipped('light')]
  })), false);
  assert.equal(isEtherealArmorEligible(actor({
    equipment: [equipped('medium')]
  })), false);
  assert.equal(isEtherealArmorEligible(actor({
    equipment: [equipped('heavy')]
  })), false);
  assert.equal(isEtherealArmorEligible(actor({
    equipment: [equipped('shield')]
  })), false);
});

test('reads automation roles without Foundry globals', () => {
  assert.equal(getAutomationRole({
    flags: {
      'declan-homebrew-classes': {
        vessel: { role: 'mantle-toggle' }
      }
    }
  }), 'mantle-toggle');
  assert.equal(getAutomationRole({ flags: {} }), undefined);
});
```

- [ ] **Step 2: Run the tests and verify the missing-module failure**

Run:

```bash
node --test tests/vessel-rules.test.mjs
```

Expected: failure with `ERR_MODULE_NOT_FOUND` for `scripts/vessel/rules.mjs`.

- [ ] **Step 3: Implement the constants and pure helpers**

Create `scripts/vessel/constants.mjs`:

```js
export const MODULE_ID = 'declan-homebrew-classes';
export const VESSEL_CLASS_IDENTIFIER = 'vessel';
export const VESSEL_ARMOR_CLASS = 'vesselMantle';
export const MANTLE_ACTIVE_FLAG = 'vessel.mantle.active';
export const ELEMENTAL_AFFINITY_FLAG = 'vessel.elementalAffinity';

export const AUTOMATION_ROLES = Object.freeze({
  MANTLE_TOGGLE: 'mantle-toggle',
  IRIDESCENT_STRIKE: 'iridescent-strike',
  MANTLE_AC: 'mantle-ac'
});
```

Create `scripts/vessel/rules.mjs`:

```js
import {
  AUTOMATION_ROLES,
  ELEMENTAL_AFFINITY_FLAG,
  MODULE_ID,
  VESSEL_CLASS_IDENTIFIER
} from './constants.mjs';

const STRIKE_DICE = Object.freeze([
  [17, 'd12'],
  [11, 'd10'],
  [5, 'd8'],
  [1, 'd6']
]);

const FEATURE_DAMAGE_TYPES = Object.freeze({
  'cursed-magic': 'fire',
  'formless-magic': 'acid',
  'trickster-magic': 'psychic'
});

const AFFINITY_DAMAGE_TYPES = Object.freeze({
  air: 'thunder',
  earth: 'bludgeoning',
  fire: 'fire',
  water: 'cold'
});

const WORN_ARMOR_TYPES = new Set(['light', 'medium', 'heavy', 'shield']);

function documents(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  return Array.from(collection.values?.() ?? collection);
}

function identifier(item) {
  return item?.identifier ?? item?.system?.identifier;
}

function rawFlag(actor, key) {
  const segments = key.split('.');
  let value = actor?.flags?.[MODULE_ID];
  for (const segment of segments) value = value?.[segment];
  return value;
}

export function getAutomationRole(document) {
  return document?.flags?.[MODULE_ID]?.vessel?.role;
}

export function getVesselLevel(actor) {
  const classItem = actor?.classes?.[VESSEL_CLASS_IDENTIFIER]
    ?? documents(actor?.items).find(candidate =>
      candidate?.type === 'class'
      && identifier(candidate) === VESSEL_CLASS_IDENTIFIER
    );
  return Math.max(0, Number(classItem?.system?.levels) || 0);
}

export function getIridescentStrikeDie(level) {
  const vesselLevel = Math.max(1, Number(level) || 1);
  return STRIKE_DICE.find(([minimum]) => vesselLevel >= minimum)[1];
}

export function getUnlockedIridescentDamageTypes(actor) {
  const identifiers = new Set(documents(actor?.items).map(identifier));
  const types = ['radiant'];

  for (const [feature, damageType] of Object.entries(FEATURE_DAMAGE_TYPES)) {
    if (identifiers.has(feature) && !types.includes(damageType)) types.push(damageType);
  }

  if (identifiers.has('cataclysm-magic')) {
    const affinity = actor?.getFlag?.(MODULE_ID, ELEMENTAL_AFFINITY_FLAG)
      ?? rawFlag(actor, ELEMENTAL_AFFINITY_FLAG);
    const damageType = AFFINITY_DAMAGE_TYPES[affinity];
    if (damageType && !types.includes(damageType)) types.push(damageType);
  }

  return types;
}

export function isEtherealArmorEligible(actor) {
  return !documents(actor?.itemTypes?.equipment).some(item =>
    item?.system?.equipped && WORN_ARMOR_TYPES.has(item?.system?.type?.value)
  );
}

export { AUTOMATION_ROLES };
```

The Ascended test intentionally remains radiant-only. Its extra type depends on
the damage types of currently prepared Vessel or Wizard spells, and the approved
design requires a radiant-plus-situational fallback when that relationship cannot
be derived confidently. Cataclysm similarly adds no type until the saved affinity
flag exists; Stage 4 supplies the affinity-selection advancement.

- [ ] **Step 4: Run the focused and complete test suites**

Run:

```bash
node --test tests/vessel-rules.test.mjs
node --test tests/*.test.mjs
```

Expected: all rule tests and all existing tests pass.

- [ ] **Step 5: Commit the pure rule layer**

```bash
git add scripts/vessel/constants.mjs scripts/vessel/rules.mjs tests/vessel-rules.test.mjs
git -c commit.gpgSign=false commit -m "feat: add Vessel automation rules"
```

---

### Task 3: Native Vessel AC registration

**Files:**
- Create: `scripts/vessel/armor-class.mjs`
- Create: `scripts/vessel-automation.mjs`
- Create: `tests/vessel-armor-class.test.mjs`
- Modify: `module.json`
- Modify: `tests/vessel-spellcasting.test.mjs`

**Interfaces:**
- Consumes: `CONFIG.DND5E.armorClasses`.
- Produces: `registerVesselArmorClass(dnd5eConfig): boolean` and the native AC key `vesselMantle`.

- [ ] **Step 1: Write failing AC-registration and manifest tests**

Create `tests/vessel-armor-class.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  registerVesselArmorClass
} = await import('../scripts/vessel/armor-class.mjs');

test('registers the Spirit Mantle AC calculation', () => {
  const config = { armorClasses: {} };
  assert.equal(registerVesselArmorClass(config), true);
  assert.deepEqual(config.armorClasses.vesselMantle, {
    label: 'Spirit Mantle',
    formula: '10 + @abilities.con.mod + @abilities.cha.mod'
  });
});

test('registering the same AC calculation is idempotent', () => {
  const config = { armorClasses: {} };
  assert.equal(registerVesselArmorClass(config), true);
  const registered = config.armorClasses.vesselMantle;
  assert.equal(registerVesselArmorClass(config), true);
  assert.equal(config.armorClasses.vesselMantle, registered);
});

test('does not overwrite another module AC calculation', () => {
  const existing = { label: 'Another Module', formula: '99' };
  const config = { armorClasses: { vesselMantle: existing } };
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(registerVesselArmorClass(config), false);
    assert.equal(config.armorClasses.vesselMantle, existing);
  } finally {
    console.error = originalError;
  }
});

test('returns false when armor configuration is unavailable', () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(registerVesselArmorClass(undefined), false);
  } finally {
    console.error = originalError;
  }
});
```

Change the existing manifest assertion in
`tests/vessel-spellcasting.test.mjs` to:

```js
test('module manifest loads Vessel spellcasting and automation', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../module.json', import.meta.url), 'utf8')
  );
  assert.deepEqual(manifest.esmodules, [
    'scripts/vessel-spellcasting.mjs',
    'scripts/vessel-automation.mjs'
  ]);
});
```

- [ ] **Step 2: Run the tests and verify both failures**

Run:

```bash
node --test tests/vessel-armor-class.test.mjs tests/vessel-spellcasting.test.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` for `armor-class.mjs` and a manifest assertion
failure until the implementation exists.

- [ ] **Step 3: Register the AC calculation and load the entry point**

Create `scripts/vessel/armor-class.mjs`:

```js
import { VESSEL_ARMOR_CLASS } from './constants.mjs';

const VESSEL_AC = Object.freeze({
  label: 'Spirit Mantle',
  formula: '10 + @abilities.con.mod + @abilities.cha.mod'
});

export function registerVesselArmorClass(dnd5eConfig) {
  if (!dnd5eConfig?.armorClasses) {
    console.error(
      "Declan's Homebrew Classes | Unable to register Spirit Mantle armor."
    );
    return false;
  }

  const existing = dnd5eConfig.armorClasses[VESSEL_ARMOR_CLASS];
  if (existing?.label === VESSEL_AC.label && existing?.formula === VESSEL_AC.formula) {
    return true;
  }
  if (existing) {
    console.error(
      "Declan's Homebrew Classes | The 'vesselMantle' AC calculation is already registered."
    );
    return false;
  }

  dnd5eConfig.armorClasses[VESSEL_ARMOR_CLASS] = { ...VESSEL_AC };
  return true;
}
```

Create `scripts/vessel-automation.mjs`:

```js
import { registerVesselArmorClass } from './vessel/armor-class.mjs';

Hooks.once('init', () => {
  registerVesselArmorClass(CONFIG.DND5E);
});
```

Append the new entry point to `module.json` without changing the module version:

```json
  "esmodules": [
    "scripts/vessel-spellcasting.mjs",
    "scripts/vessel-automation.mjs"
  ],
```

- [ ] **Step 4: Run registration tests and the complete suite**

Run:

```bash
node --test tests/vessel-armor-class.test.mjs tests/vessel-spellcasting.test.mjs
node --test tests/*.test.mjs
```

Expected: all tests pass and the existing Vessel spellcasting tests remain green.

- [ ] **Step 5: Commit AC registration**

```bash
git add scripts/vessel/armor-class.mjs scripts/vessel-automation.mjs module.json tests/vessel-armor-class.test.mjs tests/vessel-spellcasting.test.mjs
git -c commit.gpgSign=false commit -m "feat: register Spirit Mantle armor"
```

---

### Task 4: Spirit Mantle state service

**Files:**
- Create: `scripts/vessel/mantle.mjs`
- Create: `tests/vessel-mantle.test.mjs`

**Interfaces:**
- Consumes:
  - `isEtherealArmorEligible(actor): boolean`
  - role `mantle-ac` on the Spirit Mantle item's effect template
  - Foundry Actor embedded-document methods and module flags
- Produces:
  - `isSpiritMantleActive(actor): boolean`
  - `activateSpiritMantle(actor, { sourceItem }): Promise<void>`
  - `deactivateSpiritMantle(actor): Promise<void>`
  - `toggleSpiritMantle(actor, { sourceItem }): Promise<boolean>`
  - `reconcileSpiritMantle(actor, { sourceItem }): Promise<void>`

- [ ] **Step 1: Write failing state-transition tests with an Actor mock**

Create `tests/vessel-mantle.test.mjs` with a small mock that records only the
public document operations used by the service:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  activateSpiritMantle,
  deactivateSpiritMantle,
  isSpiritMantleActive,
  reconcileSpiritMantle,
  toggleSpiritMantle
} = await import('../scripts/vessel/mantle.mjs');

const MODULE_ID = 'declan-homebrew-classes';

function effect(data) {
  return {
    ...structuredClone(data),
    getFlag(scope, key) {
      if (scope !== MODULE_ID || key !== 'vessel.role') return undefined;
      return this.flags?.[scope]?.vessel?.role;
    },
    toObject() {
      const { getFlag, toObject, ...data } = this;
      return structuredClone(data);
    }
  };
}

function sourceItem() {
  return {
    uuid: 'Actor.actor0000000001.Item.hbrvespnPw2Da1c3',
    effects: [effect({
      _id: '9VejV6Hl6RdY5Gzt',
      disabled: true,
      flags: {
        [MODULE_ID]: { vessel: { role: 'mantle-ac' } }
      }
    })]
  };
}

function actor({ armor = [] } = {}) {
  let next = 0;
  return {
    isOwner: true,
    flags: {},
    effects: [],
    itemTypes: { equipment: armor },
    getFlag(scope, key) {
      if (scope !== MODULE_ID || key !== 'vessel.mantle.active') return undefined;
      return this.flags?.[scope]?.vessel?.mantle?.active;
    },
    async setFlag(scope, key, value) {
      this.flags[scope] ??= {};
      this.flags[scope].vessel ??= {};
      this.flags[scope].vessel.mantle ??= {};
      this.flags[scope].vessel.mantle.active = value;
    },
    async unsetFlag(scope, key) {
      if (scope === MODULE_ID && key === 'vessel.mantle.active') {
        delete this.flags?.[scope]?.vessel?.mantle?.active;
      }
    },
    async createEmbeddedDocuments(type, rows) {
      assert.equal(type, 'ActiveEffect');
      const created = rows.map(row => effect({
        ...structuredClone(row),
        _id: `createdEffect00${++next}`
      }));
      this.effects.push(...created);
      return created;
    },
    async updateEmbeddedDocuments(type, rows) {
      assert.equal(type, 'ActiveEffect');
      for (const row of rows) {
        const current = this.effects.find(candidate => candidate._id === row._id);
        Object.assign(current, row);
      }
    },
    async deleteEmbeddedDocuments(type, ids) {
      assert.equal(type, 'ActiveEffect');
      this.effects = this.effects.filter(candidate => !ids.includes(candidate._id));
    }
  };
}

function mantleEffects(target) {
  return target.effects.filter(candidate =>
    candidate.flags?.[MODULE_ID]?.vessel?.role === 'mantle-ac'
  );
}

test('activation stores state and enables exactly one eligible AC effect', async () => {
  const target = actor();
  await activateSpiritMantle(target, { sourceItem: sourceItem() });
  assert.equal(isSpiritMantleActive(target), true);
  assert.equal(mantleEffects(target).length, 1);
  assert.equal(mantleEffects(target)[0].disabled, false);

  await activateSpiritMantle(target, { sourceItem: sourceItem() });
  assert.equal(mantleEffects(target).length, 1);
});

test('activation keeps the effect disabled while armor is equipped', async () => {
  const target = actor({
    armor: [{
      system: { equipped: true, type: { value: 'light' } }
    }]
  });
  await activateSpiritMantle(target, { sourceItem: sourceItem() });
  assert.equal(isSpiritMantleActive(target), true);
  assert.equal(mantleEffects(target)[0].disabled, true);
});

test('reconciliation follows equipment without changing Mantle state', async () => {
  const target = actor();
  const item = sourceItem();
  await activateSpiritMantle(target, { sourceItem: item });
  target.itemTypes.equipment.push({
    system: { equipped: true, type: { value: 'shield' } }
  });
  await reconcileSpiritMantle(target, { sourceItem: item });
  assert.equal(isSpiritMantleActive(target), true);
  assert.equal(mantleEffects(target)[0].disabled, true);

  target.itemTypes.equipment = [];
  await reconcileSpiritMantle(target, { sourceItem: item });
  assert.equal(mantleEffects(target)[0].disabled, false);
});

test('deactivation clears state and removes only module Mantle effects', async () => {
  const target = actor();
  target.effects.push(effect({
    _id: 'unrelated00000001',
    disabled: false,
    flags: {}
  }));
  await activateSpiritMantle(target, { sourceItem: sourceItem() });
  await deactivateSpiritMantle(target);
  assert.equal(isSpiritMantleActive(target), false);
  assert.equal(mantleEffects(target).length, 0);
  assert.equal(target.effects.length, 1);
  assert.equal(target.effects[0]._id, 'unrelated00000001');
});

test('toggle reports the new active state', async () => {
  const target = actor();
  const item = sourceItem();
  assert.equal(await toggleSpiritMantle(target, { sourceItem: item }), true);
  assert.equal(await toggleSpiritMantle(target, { sourceItem: item }), false);
});

test('non-owners cannot mutate Mantle state', async () => {
  const target = actor();
  target.isOwner = false;
  await assert.rejects(
    activateSpiritMantle(target, { sourceItem: sourceItem() }),
    /permission/i
  );
});
```

- [ ] **Step 2: Run the state tests and verify the missing-module failure**

Run:

```bash
node --test tests/vessel-mantle.test.mjs
```

Expected: failure with `ERR_MODULE_NOT_FOUND` for `scripts/vessel/mantle.mjs`.

- [ ] **Step 3: Implement idempotent state and effect reconciliation**

Create `scripts/vessel/mantle.mjs`. Use `getAutomationRole` rather than effect
IDs so copied actors and generated effect IDs remain safe:

```js
import {
  AUTOMATION_ROLES,
  MANTLE_ACTIVE_FLAG,
  MODULE_ID
} from './constants.mjs';
import {
  getAutomationRole,
  isEtherealArmorEligible
} from './rules.mjs';

function mantleEffects(actor) {
  return Array.from(actor?.effects ?? []).filter(
    effect => getAutomationRole(effect) === AUTOMATION_ROLES.MANTLE_AC
  );
}

function requireOwner(actor) {
  if (!actor?.isOwner) {
    throw new Error('You do not have permission to update this Vessel.');
  }
}

function effectTemplate(sourceItem) {
  const template = Array.from(sourceItem?.effects ?? []).find(
    effect => getAutomationRole(effect) === AUTOMATION_ROLES.MANTLE_AC
  );
  if (!template) throw new Error('Spirit Mantle is missing its Ethereal Armor effect.');
  const data = template.toObject();
  delete data._id;
  delete data._key;
  data.origin = sourceItem.uuid;
  return data;
}

export function isSpiritMantleActive(actor) {
  return actor?.getFlag?.(MODULE_ID, MANTLE_ACTIVE_FLAG) === true
    || actor?.flags?.[MODULE_ID]?.vessel?.mantle?.active === true;
}

export async function reconcileSpiritMantle(actor, { sourceItem } = {}) {
  requireOwner(actor);
  const active = isSpiritMantleActive(actor);
  const existing = mantleEffects(actor);

  if (!active) {
    if (existing.length) {
      await actor.updateEmbeddedDocuments(
        'ActiveEffect',
        existing.filter(effect => !effect.disabled).map(effect => ({
          _id: effect._id,
          disabled: true
        }))
      );
      await actor.deleteEmbeddedDocuments(
        'ActiveEffect',
        existing.map(effect => effect._id)
      );
    }
    return;
  }

  let [current, ...duplicates] = existing;
  if (!current) {
    const data = effectTemplate(sourceItem);
    data.disabled = !isEtherealArmorEligible(actor);
    [current] = await actor.createEmbeddedDocuments('ActiveEffect', [data]);
  }
  if (duplicates.length) {
    await actor.deleteEmbeddedDocuments(
      'ActiveEffect',
      duplicates.map(effect => effect._id)
    );
  }

  const disabled = !isEtherealArmorEligible(actor);
  if (current.disabled !== disabled) {
    await actor.updateEmbeddedDocuments('ActiveEffect', [{
      _id: current._id,
      disabled
    }]);
  }
}

export async function activateSpiritMantle(actor, { sourceItem } = {}) {
  requireOwner(actor);
  if (!isSpiritMantleActive(actor)) {
    await actor.setFlag(MODULE_ID, MANTLE_ACTIVE_FLAG, true);
  }
  try {
    await reconcileSpiritMantle(actor, { sourceItem });
  } catch (error) {
    await actor.unsetFlag(MODULE_ID, MANTLE_ACTIVE_FLAG);
    throw error;
  }
}

export async function deactivateSpiritMantle(actor) {
  requireOwner(actor);
  const existing = mantleEffects(actor);
  if (existing.some(effect => !effect.disabled)) {
    await actor.updateEmbeddedDocuments(
      'ActiveEffect',
      existing.filter(effect => !effect.disabled).map(effect => ({
        _id: effect._id,
        disabled: true
      }))
    );
  }
  await actor.unsetFlag(MODULE_ID, MANTLE_ACTIVE_FLAG);
  if (existing.length) {
    await actor.deleteEmbeddedDocuments(
      'ActiveEffect',
      existing.map(effect => effect._id)
    );
  }
}

export async function toggleSpiritMantle(actor, { sourceItem } = {}) {
  if (isSpiritMantleActive(actor)) {
    await deactivateSpiritMantle(actor);
    return false;
  }
  await activateSpiritMantle(actor, { sourceItem });
  return true;
}
```

- [ ] **Step 4: Run state tests and all module tests**

Run:

```bash
node --test tests/vessel-mantle.test.mjs
node --test tests/*.test.mjs
```

Expected: all tests pass. The idempotence test must leave exactly one Mantle effect.

- [ ] **Step 5: Commit the state service**

```bash
git add scripts/vessel/mantle.mjs tests/vessel-mantle.test.mjs
git -c commit.gpgSign=false commit -m "feat: manage Spirit Mantle state"
```

---

### Task 5: Activity prompts and public hook integration

**Files:**
- Create: `scripts/vessel/hooks.mjs`
- Create: `tests/vessel-automation-hooks.test.mjs`
- Modify: `scripts/vessel-automation.mjs`

**Interfaces:**
- Consumes:
  - `dnd5e.preUseActivity`
  - `dnd5e.postUseActivity`
  - Foundry `createItem`, `updateItem`, `deleteItem`, and `deleteActiveEffect`
  - Foundry's normal `Item.update` API for actor-owned activity persistence
  - `DialogV2.confirm`
  - `game.user`, active `game.users`, and actor OWNER permissions
  - the Task 4 Mantle service
- Produces:
  - `prepareIridescentStrike(activity, actor): void`
  - `persistIridescentStrikeAndRetry(activity): Promise<void>`
  - `getResponsibleUser(actor, users): User | undefined`
  - `handlePreUseActivity(activity, dependencies): boolean | undefined`
  - `handlePostUseActivity(activity, dependencies): void`
  - `registerVesselAutomationHooks(hooks, dependencies): void`

#### Approved Fix Round 1 amendment

This amendment supersedes the clone-only damage preparation and all-client
reconciliation details in the original first-pass Steps 1–3 below. The original
listing is retained as the RED/first-pass implementation record; this section is
the governing Task 5 design.

- The actor-owned Spirit Mantle activity is the durable source for the chat
  card's native Damage action. `handlePreUseActivity` compares its first damage
  part's types with `getUnlockedIridescentDamageTypes(actor)`.
- If those source types are stale, the current use returns `false`.
  `persistIridescentStrikeAndRetry` serializes the source activity's damage
  parts with `toObject()`, writes the allowed types through
  `sourceItem.update({["system.activities.<activityId>.damage.parts"]: parts})`,
  resolves the actor-owned activity again, and calls its native `use()`.
- When the actor-owned types are current, the temporary use clone is prepared
  with the same types and dnd5e proceeds normally. The retry therefore reaches
  a current-source path rather than recursively persisting.
- No attack, hit, critical, damage-roll, Damage-button, or damage-application
  hook is intercepted.
- `promptToActivateAndRetry` invokes the default confirmation through the
  `DialogV2` class object so receiver-sensitive static behavior is preserved.
- Pending activation prompts are deduplicated per actor. Concurrent inactive
  Strike attempts return `false`, share one pending dialog, and can activate
  and retry at most once for that pending prompt.
- Foundry create/update/delete callbacks accept the documented `userId`
  argument and reconcile only on the client where `userId === game.user.id`.
  This applies to Item and ActiveEffect document hooks.
- Ready reconciliation has one deterministic responsible active user per
  actor: the lexicographically first active GM, or when no GM is active, the
  lexicographically first active user with OWNER permission on that actor.
  User enumeration, current-user identity, and reconciliation remain
  injectable for multi-client tests. Task 4's per-client actor serialization
  is unchanged.
- Every document-shaped ID in `tests/vessel-automation-hooks.test.mjs` is
  exactly 16 alphanumeric characters.
- Required regressions are:
  - `persists stale source Strike types before retrying once through native use`
  - `the default DialogV2 confirmation keeps its class receiver`
  - `concurrent inactive Strikes share one prompt and retry only once`
  - `only the document-hook initiating client reconciles create update and delete events`
  - `responsible ready user prefers the first active GM by id`
  - `exactly the first active owner reconciles an actor on ready without a GM`

- [ ] **Step 1: Write failing tests for dynamic damage types, prompt behavior, and hook registration**

Create `tests/vessel-automation-hooks.test.mjs`. Build activity, item, and hook
registry mocks; do not provide Roll, damage, or attack-resolution mocks. The
following is the original first-pass test listing and is superseded where it
conflicts with the approved amendment:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  handlePostUseActivity,
  handlePreUseActivity,
  prepareIridescentStrike,
  registerVesselAutomationHooks
} = await import('../scripts/vessel/hooks.mjs');

const MODULE_ID = 'declan-homebrew-classes';

function role(name) {
  return { [MODULE_ID]: { vessel: { role: name } } };
}

function activity(name, actor) {
  const sourceActivity = {
    id: 'gDrrUixnPXPLBDHB',
    useCalls: 0,
    async use() { this.useCalls += 1; }
  };
  const sourceItem = {
    id: 'spiritMantle001',
    identifier: 'spirit-mantle',
    actor,
    effects: [],
    system: { activities: new Map([[sourceActivity.id, sourceActivity]]) }
  };
  const existing = Array.from(actor.items?.values?.() ?? actor.items ?? []);
  actor.items = new Map(
    existing.map((item, index) => [item.id ?? `feature${index}`, item])
  );
  actor.items.set(sourceItem.id, sourceItem);
  return {
    id: sourceActivity.id,
    flags: role(name),
    item: { id: sourceItem.id, actor },
    damage: {
      parts: [{
        toObject() {
          return {
            custom: { enabled: true, formula: '@scale.vessel.iridescent-strike + @mod' },
            types: ['radiant']
          };
        }
      }]
    },
    updateSource(update) {
      this.updated = update;
    },
    sourceItem,
    sourceActivity
  };
}

function actor({ active = false, features = [] } = {}) {
  return {
    isOwner: true,
    flags: {
      [MODULE_ID]: { vessel: { mantle: { active } } }
    },
    items: features,
    itemTypes: { equipment: [] },
    getFlag(scope, key) {
      if (scope === MODULE_ID && key === 'vessel.mantle.active') return active;
      return undefined;
    }
  };
}

test('prepares only the damage types unlocked by the actor', () => {
  const target = actor({
    active: true,
    features: [{ system: { identifier: 'cursed-magic' } }]
  });
  const strike = activity('iridescent-strike', target);
  prepareIridescentStrike(strike, target);
  assert.deepEqual(
    strike.updated.damage.parts[0].types,
    ['radiant', 'fire']
  );
});

test('an inactive Strike is cancelled and prompts instead of rolling', async () => {
  const target = actor({ active: false });
  const strike = activity('iridescent-strike', target);
  let prompted = 0;
  const result = handlePreUseActivity(strike, {
    promptToActivateAndRetry: async () => { prompted += 1; }
  });
  assert.equal(result, false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(prompted, 1);
});

test('an active Strike proceeds through dnd5e', () => {
  const target = actor({ active: true });
  const strike = activity('iridescent-strike', target);
  assert.equal(handlePreUseActivity(strike), undefined);
  assert.ok(strike.updated);
});

test('using the toggle delegates to the state service', async () => {
  const target = actor();
  const toggle = activity('mantle-toggle', target);
  let calledWith;
  handlePostUseActivity(toggle, {
    toggleSpiritMantle: async (usedActor, options) => {
      calledWith = { usedActor, options };
    },
    reportError: error => { throw error; }
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calledWith.usedActor, target);
  assert.equal(calledWith.options.sourceItem, toggle.sourceItem);
});

test('registers only public Foundry and dnd5e hooks', () => {
  const on = [];
  const once = [];
  registerVesselAutomationHooks({
    on(name, handler) { on.push([name, handler]); },
    once(name, handler) { once.push([name, handler]); }
  });
  assert.deepEqual(on.map(([name]) => name).sort(), [
    'createItem',
    'deleteActiveEffect',
    'deleteItem',
    'dnd5e.postUseActivity',
    'dnd5e.preUseActivity',
    'updateItem'
  ]);
  assert.deepEqual(once.map(([name]) => name), ['ready']);
});
```

- [ ] **Step 2: Run the hook tests and verify the missing-module failure**

Run:

```bash
node --test tests/vessel-automation-hooks.test.mjs
```

Expected: failure with `ERR_MODULE_NOT_FOUND` for `scripts/vessel/hooks.mjs`.

- [ ] **Step 3: Implement prompt-first activity and reconciliation hooks**

The following is the original first-pass implementation listing and is
superseded where it conflicts with the approved amendment above:

```js
import { AUTOMATION_ROLES } from './constants.mjs';
import {
  activateSpiritMantle,
  deactivateSpiritMantle,
  isSpiritMantleActive,
  reconcileSpiritMantle,
  toggleSpiritMantle
} from './mantle.mjs';
import {
  getAutomationRole,
  getUnlockedIridescentDamageTypes,
  getVesselLevel
} from './rules.mjs';

function sourceItem(activity) {
  return activity?.item?.actor?.items?.get(activity.item.id) ?? activity?.item;
}

function reportError(error) {
  console.error("Declan's Homebrew Classes | Vessel automation failed.", error);
  globalThis.ui?.notifications?.error(error.message);
}

function isVesselActor(actor) {
  return getVesselLevel(actor) > 0;
}

function affectsEquipment(changes) {
  return Object.hasOwn(changes?.system ?? {}, 'equipped')
    || Object.hasOwn(changes?.system?.type ?? {}, 'value');
}

export function prepareIridescentStrike(activity, actor) {
  const parts = activity.damage.parts.map(part => part.toObject());
  if (!parts.length) return;
  parts[0].types = getUnlockedIridescentDamageTypes(actor);
  activity.updateSource({ damage: { parts } });
}

export async function promptToActivateAndRetry(activity, {
  confirm = globalThis.foundry?.applications?.api?.DialogV2?.confirm,
  activate = activateSpiritMantle
} = {}) {
  const actor = activity?.item?.actor;
  if (!actor?.isOwner || typeof confirm !== 'function') {
    globalThis.ui?.notifications?.warn(
      'Activate Spirit Mantle before using an Iridescent Strike.'
    );
    return;
  }

  const accepted = await confirm({
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
  promptToActivateAndRetry: prompt = promptToActivateAndRetry
} = {}) {
  if (getAutomationRole(activity) !== AUTOMATION_ROLES.IRIDESCENT_STRIKE) return;
  const actor = activity?.item?.actor;
  if (!isSpiritMantleActive(actor)) {
    void prompt(activity).catch(reportError);
    return false;
  }
  prepareIridescentStrike(activity, actor);
}

export function handlePostUseActivity(activity, {
  toggleSpiritMantle: toggle = toggleSpiritMantle,
  reportError: onError = reportError
} = {}) {
  if (getAutomationRole(activity) !== AUTOMATION_ROLES.MANTLE_TOGGLE) return;
  const actor = activity?.item?.actor;
  void toggle(actor, { sourceItem: sourceItem(activity) }).catch(onError);
}

async function reconcileActor(actor) {
  if (!actor?.isOwner || !isVesselActor(actor) || !isSpiritMantleActive(actor)) return;
  const mantle = Array.from(actor.items ?? []).find(
    item => item.identifier === 'spirit-mantle'
      || item.system?.identifier === 'spirit-mantle'
  );
  if (mantle) await reconcileSpiritMantle(actor, { sourceItem: mantle });
  else await deactivateSpiritMantle(actor);
}

export function registerVesselAutomationHooks(hooks, {
  actors = () => globalThis.game?.actors ?? []
} = {}) {
  hooks.on('dnd5e.preUseActivity', handlePreUseActivity);
  hooks.on('dnd5e.postUseActivity', handlePostUseActivity);

  hooks.on('updateItem', (item, changes) => {
    if (item.type === 'equipment' && affectsEquipment(changes)) {
      void reconcileActor(item.actor).catch(reportError);
    }
  });
  hooks.on('createItem', item => {
    if (item.type === 'equipment') void reconcileActor(item.actor).catch(reportError);
  });
  hooks.on('deleteItem', item => {
    if (item.type === 'equipment') void reconcileActor(item.actor).catch(reportError);
    if (item.identifier === 'spirit-mantle' || item.system?.identifier === 'spirit-mantle') {
      void deactivateSpiritMantle(item.actor).catch(reportError);
    }
  });
  hooks.on('deleteActiveEffect', effect => {
    if (getAutomationRole(effect) === AUTOMATION_ROLES.MANTLE_AC) {
      queueMicrotask(() => void reconcileActor(effect.parent).catch(reportError));
    }
  });
  hooks.once('ready', () => {
    for (const actor of actors()) void reconcileActor(actor).catch(reportError);
  });
}
```

Update `scripts/vessel-automation.mjs`:

```js
import { registerVesselArmorClass } from './vessel/armor-class.mjs';
import { registerVesselAutomationHooks } from './vessel/hooks.mjs';

Hooks.once('init', () => {
  registerVesselArmorClass(CONFIG.DND5E);
  registerVesselAutomationHooks(Hooks);
});
```

Preserve the public signatures above, including the amendment's persistence and
responsible-user helpers. dnd5e 5.3.3's embedded damage parts expose
`toObject()`, which is the supported serialization call used before both the
durable Item update and temporary clone `activity.updateSource`.

- [ ] **Step 4: Run hook tests and the full module suite**

Run:

```bash
node --test tests/vessel-automation-hooks.test.mjs
node --test tests/*.test.mjs
```

Expected: all tests pass, including every regression named in the approved
amendment. No test stubs or invokes a damage-resolution method.

- [ ] **Step 5: Commit activity integration**

```bash
git add scripts/vessel/hooks.mjs scripts/vessel-automation.mjs tests/vessel-automation-hooks.test.mjs
git -c commit.gpgSign=false commit -m "feat: connect Spirit Mantle activity prompts"
```

---

### Task 6: Compile, validate, document, and run regression checks

**Files:**
- Modify: `README.md`
- Rebuild: `packs/homebrew-classes/`

**Interfaces:**
- Consumes: all Stage 1 source documents and module scripts.
- Produces: a validated `homebrew-classes` LevelDB pack and user-facing automation documentation.

- [ ] **Step 1: Add a Stage 1 README section**

After the introductory list in `README.md`, add:

```markdown
## Vessel automation

The Vessel includes native dnd5e activities for Spirit Mantle and Iridescent
Strikes. Spirit Mantle toggles Ethereal Armor only while the character is
unarmored and not wielding a Shield. Iridescent Strikes use Charisma, scale with
Vessel level, and use Foundry's ordinary attack, critical-hit, and damage
workflows.

The module's custom code coordinates the Mantle state and prompts before an
inactive Vessel attempts a Strike. It does not replace Foundry's attack or damage
resolution and does not require another automation module.
```

- [ ] **Step 2: Run source tests before compilation**

Run from the module repository:

```bash
node --test tests/*.test.mjs
```

Expected: every test passes with zero failures.

- [ ] **Step 3: Compile the homebrew class pack**

Run from `/Users/c7g6g8/Development/dnd5e-pdf-importer/emit`:

```bash
node -e 'import("@foundryvtt/foundryvtt-cli").then(m=>m.compilePack("/Users/c7g6g8/Development/declan-homebrew-classes/src","/Users/c7g6g8/Development/declan-homebrew-classes/packs/homebrew-classes",{yaml:true,recursive:true}))'
```

Expected: compilation completes successfully. If a
`packs/homebrew-classes/LOCK` file remains after the compiler exits, remove only
that exact lock file.

- [ ] **Step 4: Run sacred pack validation and compiled-document checks**

Run from `/Users/c7g6g8/Development/dnd5e-pdf-importer/emit`:

```bash
node -e 'import("./verify.mjs").then(async m=>{const r=await m.verifyPack("/Users/c7g6g8/Development/declan-homebrew-classes/src",{packName:"homebrew-classes"});console.log(JSON.stringify({ok:r.ok,errors:r.errors.length}));r.errors.forEach(e=>console.log(e))})'
```

Expected:

```text
{"ok":true,"errors":0}
```

Then rerun the complete module suite:

```bash
cd /Users/c7g6g8/Development/declan-homebrew-classes
node --test tests/*.test.mjs
git diff --check
```

Expected: all tests pass and `git diff --check` produces no output.

- [ ] **Step 5: Commit compiled content and documentation**

Review `git status --short` first. Stage only the README and
`homebrew-classes` pack changes created by this plan:

```bash
git add README.md packs/homebrew-classes
git -c commit.gpgSign=false commit -m "build: compile Vessel Stage 1 automation"
```

Do not alter `module.json` version, `module.zip`, tags, remotes, or releases.

---

## Manual Foundry Verification Gate

After all automated tasks pass, verify the compiled module in a Foundry VTT 13
world running dnd5e 5.3.3:

1. Add or level a single-class Vessel at levels 1, 5, 11, and 17; confirm the
   displayed Strike die is d6, d8, d10, and d12 respectively.
2. Use **Cloak or Dismiss**; confirm one Mantle effect is created and repeated
   activation never duplicates it.
3. With no armor or Shield equipped, confirm AC is
   `10 + Constitution modifier + Charisma modifier`.
4. Equip light armor while the Mantle remains active; confirm the Mantle effect
   becomes disabled and normal dnd5e armor AC resumes.
5. Unequip the armor; confirm Ethereal Armor resumes without toggling the Mantle.
6. Equip and unequip a Shield and repeat the same check.
7. Use both Strike activities; confirm Charisma, proficiency, ordinary target
   selection, critical hits, and native damage rolls behave normally.
8. Attempt a Strike with the Mantle inactive; cancel once, then retry and accept.
   Confirm cancellation rolls nothing and acceptance activates the Mantle before
   retrying the native activity.
9. Add Cursed Magic, Formless Magic, and Trickster Magic separately; confirm the
   damage dialog adds only fire, acid, or psychic respectively.
10. Delete the Mantle effect manually while the flag is active; confirm the
    service restores one effect.
11. Reload the world with the Mantle active; confirm state and effect reconcile.
12. Repeat with an unrelated non-Vessel actor and confirm no item, effect, AC,
    attack, or damage behavior changes.

Record any Foundry-only discrepancy as a failing regression test before changing
the implementation. Do not proceed to Archon Form until this gate passes.

---

### Task 7: Prepare the user-approved v1.5.0 release

**Files:**
- Modify: `module.json`
- Rebuild: `packs/homebrew-classes/`
- Rebuild: `module.zip`

**Interfaces:**
- Consumes: the reviewed Stage 1 source, scripts, and compiled packs.
- Produces: a locally reviewed `v1.5.0` manifest and release archive. Publishing
  remains a separate post-review operation.

The user explicitly deferred the live Foundry gate to testing in the DM's world
and authorized a push and new release. The user selected version `1.5.0`.

- [ ] **Step 1: Recompile and validate the release pack**

Recompile `src/` to `packs/homebrew-classes/` with the standard
`@foundryvtt/foundryvtt-cli` command. Remove only an exact
`packs/homebrew-classes/LOCK` left after compilation.

Run all module tests and sacred validation. Required results:

```text
46 tests passed, 0 failed
{"ok":true,"errors":0}
```

Also validate the four unchanged pack sources before packaging:

| Source | Pack |
| --- | --- |
| `spells-src` | `homebrew-spells` |
| `aspects-src` | `vessel-aspects` |
| `exploits-src` | `warlord-exploits` |
| `fighting-styles-src` | `warlord-fighting-styles` |

Every validator invocation must return `{"ok":true,"errors":0}`.

- [ ] **Step 2: Bump the module manifest**

Change only `module.json` version:

```json
"version": "1.5.0"
```

Do not change compatibility, URLs, pack definitions, or entry points.

- [ ] **Step 3: Build a fresh release archive**

Create a new temporary archive and atomically replace `module.zip`; do not
update the existing ZIP in place. Include exactly these module paths:

```text
module.json
packs/
src/
aspects-src/
spells-src/
exploits-src/
fighting-styles-src/
scripts/
README.md
```

The archive must include:

```text
scripts/vessel-spellcasting.mjs
scripts/vessel-automation.mjs
scripts/vessel/constants.mjs
scripts/vessel/rules.mjs
scripts/vessel/migration.mjs
scripts/vessel/mantle.mjs
scripts/vessel/hooks.mjs
```

It must contain no `LOCK`, `.git`, `.superpowers`, test, or temporary files.

- [ ] **Step 4: Verify the archive**

Parse `module.json` from inside `module.zip` and assert:

```text
version = 1.5.0
esmodules = scripts/vessel-spellcasting.mjs,scripts/vessel-automation.mjs
```

List all archive entries and verify every required file above exists and every
forbidden path is absent. Run `unzip -t module.zip`; it must report no errors.
Run the full Node suite and `git diff --check` once more.

- [ ] **Step 5: Commit the local release candidate**

Stage only `module.json`, `module.zip`, and the expected
`packs/homebrew-classes/` compiler changes:

```bash
git add module.json module.zip packs/homebrew-classes
git -c commit.gpgSign=false commit -m "chore: prepare v1.5.0"
```

Do not push, tag, or create the GitHub release in this task. Those actions occur
only after the final whole-branch review.
