# Warlord Core Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Warlord an explicit Leadership ability, one shared Exploit Die pool, a one-prompt Inspiring Word workflow, native Rallying Cry mechanics, and level-aware Tactical Superiority recovery and ranges.

**Architecture:** YAML compendium items remain authoritative for native activities and effects. A small Warlord runtime stores the selected Leadership ability, routes Inspiring Word into one of twelve immutable native Heal helpers, configures actor-owned Save activities, and selectively migrates legacy Warlord items. Foundry and dnd5e continue to resolve targeting, consumption, healing, saves, effects, rests, and initiative recovery.

**Tech Stack:** Foundry VTT 13, dnd5e 5.3.3, ECMAScript modules, YAML compendium sources, Node.js built-in test runner, `js-yaml`, `@foundryvtt/foundryvtt-cli`

## Global Constraints

- Target Foundry VTT 13 and dnd5e 5.3.3 or newer.
- Use native dnd5e documents and workflows whenever they can express the rule.
- Custom code may configure or route a native activity but may not resolve damage, healing, attacks, saves, effects, rests, or initiative.
- Do not monkey-patch private Foundry or dnd5e methods.
- Do not require Midi-QOL or another automation module.
- Store Leadership ability per actor as exactly `cha`, `wis`, or `int`; never infer the highest ability.
- Preserve user descriptions, names, chat flavor, spent uses, unrelated activities/effects, and foreign flags during migration.
- Keep every Foundry document ID exactly 16 alphanumeric characters.
- YAML source is authoritative; committed LevelDB packs must match it.
- Run `verifyPack`; it must report `{"ok":true,"errors":0}` before completion.
- Do not bump `module.json`, rebuild `module.zip`, push, tag, or publish without explicit user approval.
- Never add a `Co-Authored-By` trailer to a commit.

## File Structure

- Create `scripts/warlord/constants.mjs`: module flags, stable roles, identifiers, migration version, and supported Leadership abilities.
- Create `scripts/warlord/rules.mjs`: pure Warlord level, Leadership, range, and role helpers.
- Create `scripts/warlord/leadership.mjs`: Leadership dialog and selective actor-item configuration.
- Create `scripts/warlord/inspiring-word.mjs`: Hit Die prompt, helper lookup, deduplication, and native helper dispatch.
- Create `scripts/warlord/migration.mjs`: versioned migration of core actor-owned Warlord items.
- Create `scripts/warlord/hooks.mjs`: supported activity/item/ready hook coordination.
- Create `scripts/warlord-automation.mjs`: entry point.
- Modify `src/warlord/class-features/leadership-style.yml`: add the configuration launcher role.
- Modify `src/warlord/class-features/tactical-exploits.yml`: add the shared pool and Tactical Skill activity.
- Modify `src/warlord/class-features/inspiring-word.yml`: fix recovery and add one launcher plus twelve hidden Heal helpers.
- Modify `src/warlord/class-features/rallying-cry.yml`: fix recovery and add the native reaction activity.
- Modify `src/warlord/class-features/tactical-superiority.yml`: add automation metadata, not a duplicate visible activity.
- Modify `module.json`: load the Warlord entry point after existing Vessel modules.
- Create `tests/warlord-rules.test.mjs`.
- Create `tests/warlord-core-content.test.mjs`.
- Create `tests/warlord-leadership.test.mjs`.
- Create `tests/warlord-inspiring-word.test.mjs`.
- Create `tests/warlord-migration.test.mjs`.
- Create `tests/warlord-hooks.test.mjs`.
- Create `tests/warlord-core-compiled-pack.test.mjs`.

---

### Task 1: Stable Warlord roles and pure rules

**Files:**
- Create: `scripts/warlord/constants.mjs`
- Create: `scripts/warlord/rules.mjs`
- Create: `tests/warlord-rules.test.mjs`

**Interfaces:**
- Produces:
  - `MODULE_ID: "declan-homebrew-classes"`
  - `WARLORD_CLASS_IDENTIFIER: "warlord"`
  - `LEADERSHIP_FLAG: "warlord.leadershipAbility"`
  - `WARLORD_MIGRATION_FLAG: "warlord.migrationVersion"`
  - `WARLORD_MIGRATION_VERSION: 1`
  - `WARLORD_ROLES`
  - `LEADERSHIP_ABILITIES`
  - `getIdentifier(document): string | undefined`
  - `getWarlordRole(document): string | undefined`
  - `getWarlordLevel(actor): number`
  - `getLeadershipAbility(actor): "cha" | "wis" | "int" | undefined`
  - `leadershipFormula(ability): string`
  - `hasTacticalSuperiority(actor): boolean`
  - `warlordRange(actor, base): number`

- [ ] **Step 1: Write failing pure-rule tests**

Create tests that use plain objects and assert:

```js
assert.equal(getWarlordLevel(actorWithClassLevel(11)), 11);
assert.equal(getLeadershipAbility(actorWithFlag('wis')), 'wis');
assert.equal(getLeadershipAbility(actorWithFlag('dex')), undefined);
assert.equal(leadershipFormula('int'), '@abilities.int.mod');
assert.equal(hasTacticalSuperiority(actorWithClassLevel(10)), false);
assert.equal(hasTacticalSuperiority(actorWithClassLevel(11)), true);
assert.equal(warlordRange(actorWithClassLevel(10), 30), 30);
assert.equal(warlordRange(actorWithClassLevel(11), 30), 60);
assert.equal(
  getWarlordRole({ flags: { 'declan-homebrew-classes': {
    warlord: { role: 'inspiring-word-launcher' }
  } } }),
  'inspiring-word-launcher'
);
```

- [ ] **Step 2: Run the tests to verify RED**

Run:

```bash
node --test tests/warlord-rules.test.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` for `scripts/warlord/rules.mjs`.

- [ ] **Step 3: Implement the constants and pure helpers**

Define these exact role values:

```js
export const WARLORD_ROLES = Object.freeze({
  LEADERSHIP_CONFIG: 'leadership-config',
  TACTICAL_SKILL: 'tactical-skill',
  INSPIRING_WORD_LAUNCHER: 'inspiring-word-launcher',
  INSPIRING_WORD_HELPER: 'inspiring-word-helper',
  RALLYING_CRY: 'rallying-cry',
  EXPLOIT_ACTIVITY: 'exploit-activity',
  FIGHTING_STYLE_ACTIVITY: 'fighting-style-activity',
  FIGHTING_STYLE_EFFECT: 'fighting-style-effect'
});

export const LEADERSHIP_ABILITIES = Object.freeze({
  captain: 'cha',
  mentor: 'wis',
  strategist: 'int'
});
```

`getWarlordLevel` must inspect embedded class items whose system identifier is
`warlord` and return the greatest finite non-negative `system.levels`.
`getLeadershipAbility` must validate the stored actor flag against
`new Set(['cha', 'wis', 'int'])`.

- [ ] **Step 4: Run focused and complete tests**

Run:

```bash
node --test tests/warlord-rules.test.mjs
node --test tests/*.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/warlord/constants.mjs scripts/warlord/rules.mjs tests/warlord-rules.test.mjs
git -c commit.gpgSign=false commit -m "feat: add Warlord automation rules"
```

---

### Task 2: Native core Warlord activity content

**Files:**
- Modify: `src/warlord/class-features/leadership-style.yml`
- Modify: `src/warlord/class-features/tactical-exploits.yml`
- Modify: `src/warlord/class-features/inspiring-word.yml`
- Modify: `src/warlord/class-features/rallying-cry.yml`
- Modify: `src/warlord/class-features/tactical-superiority.yml`
- Create: `tests/warlord-core-content.test.mjs`

**Interfaces:**
- Consumes: roles from Task 1 and existing class scales.
- Produces: canonical core Warlord activities and stable role flags.

- [ ] **Step 1: Write failing YAML source tests**

Load the five YAML items with `js-yaml`. Assert this exact contract:

```js
assert.equal(tactical.system.uses.max, '@scale.warlord.exploit-dice');
assert.deepEqual(tactical.system.uses.recovery, [
  { period: 'sr', type: 'recoverAll' }
]);

const skill = byRole(tactical, 'tactical-skill');
assert.equal(skill.type, 'utility');
assert.equal(skill.roll.formula, '@scale.warlord.exploit-die');
assert.deepEqual(skill.consumption.targets, [{
  type: 'itemUses',
  target: 'tactical-exploits',
  value: '1',
  scaling: {}
}]);

assert.deepEqual(inspiring.system.uses.recovery, [
  { period: 'sr', type: 'recoverAll' },
  { period: 'initiative', type: 'recover', formula: '1' }
]);
assert.equal(byRole(inspiring, 'inspiring-word-launcher').type, 'utility');
assert.equal(byRole(inspiring, 'inspiring-word-launcher').consumption.targets.length, 0);
assert.equal(byRole(inspiring, 'inspiring-word-launcher').flags[
  'declan-homebrew-classes'
].warlord.routerOnly, true);

assert.equal(helpers(inspiring).length, 12);
for (const helper of helpers(inspiring)) {
  assert.equal(helper.type, 'heal');
  assert.equal(helper.activation.type, 'bonus');
  assert.equal(helper.range.value, '30');
  assert.equal(helper.target.affects.count, '1');
  assert.deepEqual(helper.consumption.targets, [{
    type: 'itemUses', target: '', value: '1', scaling: {}
  }]);
  assert.equal(helper.flags['declan-homebrew-classes'].warlord.hidden, true);
}
assert.deepEqual(
  new Set(inspiring.flags.dnd5e.riders.activity),
  new Set(helpers(inspiring).map(helper => helper._id))
);

assert.deepEqual(rally.system.uses.recovery, [
  { period: 'sr', type: 'recoverAll' },
  { period: 'initiative', type: 'recover', formula: '1' }
]);
assert.equal(byRole(rally, 'rallying-cry').activation.type, 'reaction');
assert.equal(byRole(rally, 'rallying-cry').range.value, '30');
assert.equal(byRole(rally, 'rallying-cry').roll.formula, '@abilities.cha.mod');
```

Also assert the twelve helper keys are the Cartesian product of:

```js
const dice = [6, 8, 10, 12];
const abilities = ['cha', 'wis', 'int'];
const formulas = new Set(dice.flatMap(faces => abilities.map(
  ability => `1d${faces} + @abilities.${ability}.mod`
)));
```

Every helper must carry `warlord.hitDie` and `warlord.leadershipAbility` flags
matching its immutable healing formula.

- [ ] **Step 2: Run the content tests to verify RED**

```bash
node --test tests/warlord-core-content.test.mjs
```

Expected: failures for missing activities and incorrect `lr` recovery.

- [ ] **Step 3: Add the canonical YAML mechanics**

Use these native responsibilities:

| Item | Visible activity | Native fields |
| --- | --- | --- |
| Leadership Style | Set Leadership Style | utility, no activation, no consumption, `leadership-config` |
| Tactical Exploits | Tactical Skill | utility, shared-use consumption, visible scaling die roll |
| Inspiring Word | Inspiring Word | router-only utility, no consumption |
| Inspiring Word | twelve helpers | hidden Heal, bonus action, 30 ft, one other creature, one item use |
| Rallying Cry | Rallying Cry | reaction Utility, 30 ft, one other creature, one item use, Leadership-modifier roll |
| Tactical Superiority | none | description plus module metadata only |

For each Inspiring Word helper, set:

```yaml
healing:
  number: null
  denomination: null
  bonus: ''
  types:
    - healing
  custom:
    enabled: true
    formula: 1d8 + @abilities.wis.mod
```

The shown d8/Wisdom formula is the exact shape; generate all twelve immutable
die/ability combinations. Keep one visible launcher by adding
`flags.declan-homebrew-classes.warlord.hidden: true` to helpers and add all
twelve helper IDs to `flags.dnd5e.riders.activity` on Inspiring Word. dnd5e then
treats them as rider activities rather than ordinary visible feature actions.
Do not rely on helper display names for lookup.

Set both initiative recovery entries in source. Runtime Task 5 removes or
disables the initiative entry below level 11 on actor-owned copies while
retaining it canonically for migration.

- [ ] **Step 4: Run focused and complete tests**

```bash
node --test tests/warlord-core-content.test.mjs
node --test tests/*.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/warlord/class-features tests/warlord-core-content.test.mjs
git -c commit.gpgSign=false commit -m "feat: add native Warlord core activities"
```

---

### Task 3: Leadership selection and native activity configuration

**Files:**
- Create: `scripts/warlord/leadership.mjs`
- Create: `tests/warlord-leadership.test.mjs`

**Interfaces:**
- Consumes: Task 1 constants/rules and actor-owned module roles.
- Produces:
  - `chooseLeadershipAbility(actor, options): Promise<"cha" | "wis" | "int" | undefined>`
  - `ensureLeadershipAbility(actor, options): Promise<"cha" | "wis" | "int" | undefined>`
  - `configureLeadershipItems(actor, ability): Promise<boolean>`

- [ ] **Step 1: Write failing behavior tests**

Use plain actor/item mocks. Cover:

```js
assert.equal(await chooseLeadershipAbility(actor, {
  prompt: async () => 'mentor'
}), 'wis');
assert.equal(actor.setFlagCalls[0].value, 'wis');

assert.equal(await chooseLeadershipAbility(actor, {
  prompt: async () => undefined
}), undefined);
assert.equal(actor.setFlagCalls.length, 0);

await configureLeadershipItems(actor, 'int');
assert.equal(saveActivity.update.save.dc.calculation, 'int');
assert.equal(rallyActivity.update.roll.formula, '@abilities.int.mod');
assert.equal(userActivity.update, undefined);
```

Add tests proving invalid prompt results are rejected, non-owners cannot change
the flag, repeated concurrent calls share one prompt, and helper source formulas
are never mutated.

- [ ] **Step 2: Run to verify RED**

```bash
node --test tests/warlord-leadership.test.mjs
```

Expected: `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the service**

`chooseLeadershipAbility` must use `DialogV2.wait` with three buttons whose
callback values are `captain`, `mentor`, and `strategist`. Preserve the class
receiver when invoking the default dialog. Convert through
`LEADERSHIP_ABILITIES`, set the actor flag, and call
`configureLeadershipItems`.

`configureLeadershipItems` must update only activities with a Warlord module
role. Build flattened updates:

```js
{
  [`system.activities.${activity.id}.save.dc.calculation`]: ability,
  [`system.activities.${activity.id}.roll.formula`]:
    `@abilities.${ability}.mod`
}
```

Only include `save.dc.calculation` when the activity already contains a Save
configuration, and only include `roll.formula` for Leadership-roll roles such
as Rallying Cry. Return `false` when no update is needed.

- [ ] **Step 4: Run focused and complete tests**

```bash
node --test tests/warlord-leadership.test.mjs
node --test tests/*.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/warlord/leadership.mjs tests/warlord-leadership.test.mjs
git -c commit.gpgSign=false commit -m "feat: configure Warlord Leadership Style"
```

---

### Task 4: Inspiring Word prompt router

**Files:**
- Create: `scripts/warlord/inspiring-word.mjs`
- Create: `tests/warlord-inspiring-word.test.mjs`

**Interfaces:**
- Consumes: `ensureLeadershipAbility` and canonical helper flags.
- Produces:
  - `chooseHitDie(options): Promise<6 | 8 | 10 | 12 | undefined>`
  - `findInspiringWordHelper(item, hitDie, ability): Activity | undefined`
  - `useInspiringWord(activity, options): Promise<void>`

- [ ] **Step 1: Write failing router tests**

Cover all twelve dispatch pairs:

```js
for (const ability of ['cha', 'wis', 'int']) {
  for (const hitDie of [6, 8, 10, 12]) {
    await useInspiringWord(launcher, {
      ensureLeadershipAbility: async () => ability,
      chooseHitDie: async () => hitDie
    });
    assert.equal(helperFor(hitDie, ability).useCalls, 1);
  }
}
```

Also assert:

- canceling Leadership or Hit Die calls no helper;
- the launcher itself never consumes a use;
- two concurrent calls for one actor create one dialog/helper use;
- a missing helper reports an error and spends nothing;
- zero available uses stops before either dialog;
- native helper errors are surfaced and never retried automatically.

- [ ] **Step 2: Run to verify RED**

```bash
node --test tests/warlord-inspiring-word.test.mjs
```

Expected: `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement prompt and dispatch**

Use a module-level `WeakMap<Actor, Promise>` to deduplicate. `chooseHitDie`
invokes `DialogV2.wait` with exact return values `6`, `8`, `10`, and `12`.
`findInspiringWordHelper` matches:

```js
role(activity) === WARLORD_ROLES.INSPIRING_WORD_HELPER
  && activity.flags[MODULE_ID].warlord.hitDie === hitDie
  && activity.flags[MODULE_ID].warlord.leadershipAbility === ability
```

Before prompting, resolve the actor-owned source item and require:

```js
Number(item.system.uses.value) > 0
```

Then call exactly `await helper.use()`. Do not call `actor.applyHealing`, create a
ChatMessage, update hit points, or update item uses directly.

- [ ] **Step 4: Run focused and complete tests**

```bash
node --test tests/warlord-inspiring-word.test.mjs
node --test tests/*.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/warlord/inspiring-word.mjs tests/warlord-inspiring-word.test.mjs
git -c commit.gpgSign=false commit -m "feat: route Inspiring Word by Hit Die"
```

---

### Task 5: Core migration and public hook integration

**Files:**
- Create: `scripts/warlord/migration.mjs`
- Create: `scripts/warlord/hooks.mjs`
- Create: `scripts/warlord-automation.mjs`
- Create: `tests/warlord-migration.test.mjs`
- Create: `tests/warlord-hooks.test.mjs`
- Modify: `module.json`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `migrateWarlordActor(actor, options): Promise<boolean>`
  - `reconcileWarlordActor(actor, options): Promise<void>`
  - `getResponsibleUser(actor, users): User | undefined`
  - `handleWarlordPreUse(activity, options): boolean | undefined`
  - `registerWarlordHooks(hooks, options): void`

- [ ] **Step 1: Write failing migration and hook tests**

Migration fixtures must include custom names/descriptions, current spent uses,
a foreign flag, a user activity, and a partial update failure. Assert:

```js
assert.equal(await migrateWarlordActor(actor), true);
assert.equal(actor.flags[MODULE_ID].warlord.migrationVersion, 1);
assert.equal(actor.inspiring.system.uses.spent, 2);
assert.equal(actor.inspiring.name, 'My Rallying Words');
assert.ok(actor.inspiring.system.activities.userActivityId);
assert.deepEqual(actor.inspiring.flags.otherModule, { keep: true });
assert.equal(await migrateWarlordActor(actor), false);
```

After a forced failure, assert the migration flag is absent and the second run
repairs the remaining structures. Hook tests must assert registration of only:

```js
[
  'createItem',
  'updateItem',
  'dnd5e.preUseActivity'
]
```

plus one `ready` hook. Assert the deterministic responsible user is the first
active GM by code-unit ID, otherwise the first active OWNER.

- [ ] **Step 2: Run to verify RED**

```bash
node --test tests/warlord-migration.test.mjs tests/warlord-hooks.test.mjs
```

Expected: both missing-module failures.

- [ ] **Step 3: Implement selective migration**

Load canonical items by their existing 16-character IDs from
`declan-homebrew-classes.homebrew-classes`. Repair activities by stable module
role and ID. For module-owned activities, overwrite only:

```js
[
  'type', 'activation', 'consumption', 'duration', 'range', 'target',
  'uses', 'roll', 'healing', 'save',
  `flags.${MODULE_ID}.warlord`
]
```

Preserve item `name`, `system.description`, `system.uses.spent`, unknown
activities, effects, and foreign flags. Clamp spent uses only when the resolved
numeric maximum is lower. Configure Leadership and level-aware fields after the
canonical merge. Set the migration flag only after every update succeeds.

- [ ] **Step 4: Implement hooks and entry point**

`handleWarlordPreUse` returns `false` for both router-only launchers. It schedules
`useInspiringWord` for Inspiring Word and `chooseLeadershipAbility` for Set
Leadership Style, so neither launcher creates a redundant native chat card.

For a module-owned Save activity with no stored Leadership choice, it returns
`false`, schedules `ensureLeadershipAbility`, configures the actor-owned source
activity, resolves that source activity again, and calls native `use()` exactly
once. Cancellation performs no retry. A per-actor/activity in-flight key prevents
the retry from recursively opening another prompt. When a valid choice is already
stored, the pre-use handler returns `undefined` and dnd5e proceeds normally.

On `createItem`, only the initiating client (`userId === game.user.id`) configures
a newly owned Warlord item. On `updateItem`, that same initiating-client rule
applies; when the updated item is the `warlord` class and `system.levels`
changed, call `reconcileWarlordActor`.

`reconcileWarlordActor` reloads canonical base ranges/recovery and applies the
actor's current Leadership ability and Warlord level. It must:

```js
const superior = getWarlordLevel(actor) >= 11;
const range = superior ? baseRange * 2 : baseRange;
const recovery = superior
  ? [...shortRestRecovery, initiativeRecovery]
  : shortRestRecovery;
```

It updates only module-owned activities and the Inspiring Word/Rallying Cry item
recovery fields. On `ready`, the responsible user calls migration and then
reconciliation even when migration returns `false`, so level reductions and
legacy stale values are repaired on every load.

Add this exact entry to `module.json.esmodules`:

```json
"scripts/warlord-automation.mjs"
```

The entry point contains only:

```js
import { registerWarlordHooks } from './warlord/hooks.mjs';

Hooks.once('init', () => registerWarlordHooks(Hooks));
```

- [ ] **Step 5: Run focused and complete tests**

```bash
node --test tests/warlord-migration.test.mjs tests/warlord-hooks.test.mjs
node --test tests/*.test.mjs
```

Expected: all tests pass, including existing Vessel tests.

- [ ] **Step 6: Commit**

```bash
git add scripts/warlord scripts/warlord-automation.mjs tests/warlord-migration.test.mjs tests/warlord-hooks.test.mjs module.json
git -c commit.gpgSign=false commit -m "feat: migrate and connect Warlord core automation"
```

---

### Task 6: Compile and verify the core foundation

**Files:**
- Rebuild: `packs/homebrew-classes/`
- Create: `tests/warlord-core-compiled-pack.test.mjs`

**Interfaces:**
- Consumes: all prior core tasks.
- Produces: committed source-to-LevelDB parity for core Warlord documents.

- [ ] **Step 1: Write the failing compiled-pack parity test**

Copy `packs/homebrew-classes` to a temporary directory, extract it with
`@foundryvtt/foundryvtt-cli`, and compare the five canonical Warlord source
documents to compiled documents. Compare:

```js
[
  'system.uses',
  'system.activities',
  'flags'
]
```

for the feature items, and assert all existing Warlord class scales are present.
Never open or mutate the committed LevelDB directly in the test.

- [ ] **Step 2: Run the parity test to verify RED**

```bash
node --test tests/warlord-core-compiled-pack.test.mjs
```

Expected: failure because the committed pack is stale.

- [ ] **Step 3: Compile the homebrew class pack**

From `/Users/c7g6g8/Development/dnd5e-pdf-importer/emit`, run:

```bash
node -e 'import("@foundryvtt/foundryvtt-cli").then(m=>m.compilePack("/Users/c7g6g8/Development/declan-homebrew-classes/src","/Users/c7g6g8/Development/declan-homebrew-classes/packs/homebrew-classes",{yaml:true,recursive:true}))'
```

If compilation leaves a lock, remove only
`packs/homebrew-classes/LOCK`.

- [ ] **Step 4: Run full verification**

From the importer `emit` directory:

```bash
node -e 'import("./verify.mjs").then(async m=>{const r=await m.verifyPack("/Users/c7g6g8/Development/declan-homebrew-classes/src",{packName:"homebrew-classes"});console.log(JSON.stringify({ok:r.ok,errors:r.errors.length}));r.errors.forEach(e=>console.log(e))})'
```

Expected: `{"ok":true,"errors":0}`.

Then:

```bash
cd /Users/c7g6g8/Development/declan-homebrew-classes
node --test tests/*.test.mjs
git diff --check
```

Expected: all tests pass and the diff check is silent.

- [ ] **Step 5: Commit**

```bash
git add packs/homebrew-classes tests/warlord-core-compiled-pack.test.mjs
git -c commit.gpgSign=false commit -m "build: compile Warlord core automation"
```

---

## Core Foundry Checkpoint

Before starting the Exploit plan, verify in Foundry VTT 13 with dnd5e 5.3.3:

1. Add a new Warlord and set Captain, Mentor, then Strategist; confirm the stored
   choice changes representative DCs and Rallying Cry's displayed modifier.
2. Cancel the first-use Leadership prompt and confirm no activity or resource is
   consumed.
3. Use Inspiring Word with d6, d8, d10, and d12; confirm one native Heal card,
   one use spent, and the chosen Leadership modifier each time.
4. Double-click Inspiring Word and confirm one prompt and one use.
5. Short rest and confirm Inspiring Word, Rallying Cry, and Exploit Dice recover.
6. At level 10, confirm 30-foot range and no initiative recovery.
7. At level 11, confirm 60-foot range and one Inspiring Word/Rallying Cry use
   returns on initiative.
8. Upgrade an existing actor with custom notes and spent uses; confirm both are
   preserved.

Record every Foundry-only discrepancy as a failing regression test before
changing implementation.
