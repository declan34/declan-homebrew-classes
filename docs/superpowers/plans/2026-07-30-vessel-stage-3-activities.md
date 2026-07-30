# Vessel Stage 3 Activities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add useful Foundry-native activities and effects for the complete
Stage 3 Vessel roadmap: sixteen Archon/subclass capabilities and ten Unsealed
Aspects.

**Architecture:** Extend the Stage 2 Archon Actor profiles and existing Aspect
Items with normal dnd5e activities and module-owned effects. Pure rule helpers
prepare scaling and eligibility; the hook layer only validates module-tagged
activities or reconciles state-bound effects. Foundry remains authoritative for
attacks, saves, damage, healing, conditions, consumption, and transformation.

**Tech Stack:** Foundry VTT 13, dnd5e 5.3.3, ECMAScript modules, YAML compendium
sources, Node.js built-in test runner, `js-yaml`,
`@foundryvtt/foundryvtt-cli`

## Global Constraints

- Work only on `feat/vessel-stage-3` in `.worktrees/vessel-stage-3`.
- Preserve all Stage 2 Archon lifecycle behavior and public interfaces.
- Use native dnd5e documents for attacks, saves, damage, healing, conditions,
  durations, templates, consumption, and chat cards.
- Do not monkey-patch Foundry/dnd5e or require Midi-QOL.
- Do not move tokens or enforce target-selection restrictions through module
  code.
- Manual follow-up activities are required when reliable native resolution is
  not available.
- Preserve stable existing IDs; every new `_id`, `_key`, and
  `_stats.lastModifiedBy` must be exactly 16 alphanumeric characters.
- Preserve player presentation, notes, unrelated activities/effects, use state,
  and foreign flags during migration.
- Run `verifyPack` for every changed pack and require `ok: true` with zero
  errors.
- Do not bump the module version, build a release archive, merge to `main`,
  push, or publish.
- Never add a `Co-Authored-By` trailer.

---

## Task 1: Add Stage 3 role inventory and pure rules

**Files:**

- Modify: `scripts/vessel/constants.mjs`
- Modify: `scripts/vessel/rules.mjs`
- Create: `tests/vessel-stage3-rules.test.mjs`

**Interfaces:**

- Consumes: `getVesselLevel(actor)`,
  `getUnlockedIridescentDamageTypes(actor)`, `getArchonState(actor)`.
- Produces:
  `STAGE3_ACTIVITY_ROLES: ReadonlySet<string>`,
  `getDazzlingLanceDice(actorOrLevel): number`,
  `getDrainVitalityDice(actorOrLevel): number`,
  `getVesselTempHPCap(actorOrLevel): number`,
  `getCataclysmAffinityDamageType(actor): string | undefined`,
  `isMantleBoundStage3Role(role): boolean`,
  `isArchonBoundStage3Role(role): boolean`.

- [x] **Step 1: Write failing boundary and inventory tests**

```js
test('Stage 3 scaling follows published Vessel boundaries', () => {
  assert.equal(getDazzlingLanceDice(10), 6);
  assert.equal(getDazzlingLanceDice(12), 6);
  assert.equal(getDazzlingLanceDice(13), 7);
  assert.equal(getDazzlingLanceDice(16), 7);
  assert.equal(getDazzlingLanceDice(17), 8);
  assert.equal(getDazzlingLanceDice(20), 8);

  assert.equal(getDrainVitalityDice(6), 2);
  assert.equal(getDrainVitalityDice(9), 3);
  assert.equal(getDrainVitalityDice(13), 4);
  assert.equal(getDrainVitalityDice(17), 5);
  assert.equal(getDrainVitalityDice(20), 6);
  assert.equal(getVesselTempHPCap(11), 22);
});
```

Also assert that the role set contains exactly:

```js
[
  'arcane-blast', 'astral-step', 'bluster',
  'cataclysmic-eruption', 'frenzy', 'infernal-drain',
  'divine-wrath', 'divine-ward', 'condemnation',
  'pseudopod-strike', 'sticky-slime', 'sticky-slime-escape',
  'drain-vitality', 'drain-vitality-recovery',
  'juxtapose', 'stolen-memory',
  'aether-wings', 'opalescent-armor', 'perilous-visage',
  'otherworldly-maw', 'otherworldly-maw-recovery',
  'primordial-bulwark', 'primordial-bulwark-harden',
  'twilight-steps', 'shimmering-lance',
  'dazzling-lance', 'dazzling-eruption',
  'sundering-strike', 'vexing-strike'
]
```

- [x] **Step 2: Run the focused test and verify failure**

Run:

```bash
node --test tests/vessel-stage3-rules.test.mjs
```

Expected: FAIL because the Stage 3 exports do not exist.

- [x] **Step 3: Add constants and minimal pure helpers**

Use table-driven functions:

```js
const DRAIN_VITALITY_DICE = Object.freeze([
  [20, 6], [17, 5], [13, 4], [9, 3], [1, 2]
]);
const DAZZLING_LANCE_DICE = Object.freeze([
  [17, 8], [13, 7], [1, 6]
]);

function scaledValue(levelOrActor, table) {
  const level = typeof levelOrActor === 'object'
    ? getVesselLevel(levelOrActor)
    : Math.max(0, Number(levelOrActor) || 0);
  return table.find(([minimum]) => level >= minimum)?.[1] ?? table.at(-1)[1];
}
```

Map Cataclysm affinity through the existing saved flag and existing affinity
normalizer; do not create a second affinity source.

- [x] **Step 4: Run focused and existing rule tests**

```bash
node --test tests/vessel-stage3-rules.test.mjs tests/vessel-rules.test.mjs
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add scripts/vessel/constants.mjs scripts/vessel/rules.mjs \
  tests/vessel-stage3-rules.test.mjs
git -c commit.gpgSign=false commit -m "feat: add Vessel Stage 3 rules"
```

## Task 2: Add Ascended and Cataclysm activities

**Files:**

- Modify: `archon-src/ascended-archon.yml`
- Modify: `archon-src/cataclysm-air-archon.yml`
- Modify: `archon-src/cataclysm-earth-archon.yml`
- Modify: `archon-src/cataclysm-fire-archon.yml`
- Modify: `archon-src/cataclysm-water-archon.yml`
- Modify:
  `src/vessel/subclass-features/the-cataclysm/cataclysmic-eruption.yml`
- Create: `tests/vessel-stage3-ascended-cataclysm.test.mjs`

**Interfaces:**

- Consumes: Stage 3 roles and `@scale.vessel.iridescent-strike`.
- Produces native activities tagged with roles `arcane-blast`, `astral-step`,
  `bluster`, and `cataclysmic-eruption`.

- [x] **Step 1: Write failing source-schema tests**

Load the six YAML documents and assert:

```js
assertActivity(ascended, 'arcane-blast', {
  type: 'save', ability: 'dex', range: 60, template: 'radius',
  templateSize: 5, damage: '@scale.vessel.iridescent-strike + @mod'
});
assertActivity(ascended, 'astral-step', {
  type: 'utility', activation: 'special'
});
assertActivity(air, 'bluster', {
  type: 'utility', activation: 'special'
});
assertActivity(eruption, 'cataclysmic-eruption', {
  type: 'save', ability: 'dex', range: 30, damage: '9d6'
});
```

For all activity flags assert:

```js
activity.flags['declan-homebrew-classes'].vessel.role === expectedRole
```

- [x] **Step 2: Verify the new tests fail**

```bash
node --test tests/vessel-stage3-ascended-cataclysm.test.mjs
```

- [x] **Step 3: Add the native activities**

Arcane Blast uses a 5-foot radius point within 60 feet, Dexterity save, normal
half-damage setting disabled because the published feature deals damage only on
a failure, and a custom damage part:

```yaml
custom:
  enabled: true
  formula: '@scale.vessel.iridescent-strike + @mod'
types: [radiant]
```

Astral Step and Bluster are Utility activities with exact chat guidance and no
resource consumption. Cataclysmic Eruption is a Dexterity save with its
published 15-foot-diameter, 60-foot-high area described on the card and `9d6`
damage; its source damage type is the neutral affinity placeholder prepared in
Task 7.

- [x] **Step 4: Run focused tests**

```bash
node --test tests/vessel-stage3-ascended-cataclysm.test.mjs \
  tests/vessel-archon-profiles.test.mjs
```

- [x] **Step 5: Commit**

```bash
git add archon-src src/vessel/subclass-features/the-cataclysm \
  tests/vessel-stage3-ascended-cataclysm.test.mjs
git -c commit.gpgSign=false commit -m \
  "feat: add Ascended and Cataclysm activities"
```

## Task 3: Add Cursed and Fallen activities

**Files:**

- Modify: `archon-src/cursed-archon.yml`
- Modify: `archon-src/fallen-archon.yml`
- Modify: `src/vessel/subclass-features/the-fallen/divine-wrath.yml`
- Create:
  `src/vessel/subclass-features/the-fallen/condemnation.yml`
- Modify: `src/vessel/the-fallen.yml`
- Create: `tests/vessel-stage3-cursed-fallen.test.mjs`

**Interfaces:**

- Consumes: Stage 2 form-effect cleanup role and Stage 3 temp-HP cap helper.
- Produces roles `frenzy`, `infernal-drain`, `divine-wrath`, `divine-ward`,
  and `condemnation`.

- [x] **Step 1: Write failing tests**

Assert:

```js
assertActivity(cursed, 'frenzy', {type: 'utility'});
assertActivity(cursed, 'infernal-drain', {
  type: 'healing', formula: '@abilities.cha.mod'
});
assertActivity(fallen, 'divine-ward', {
  type: 'healing', activation: 'bonus', range: 30,
  formula: '@abilities.cha.mod'
});
assertActivity(divineWrath, 'divine-wrath', {
  type: 'attack', ability: 'cha', damageType: 'radiant'
});
assertActivity(condemnation, 'condemnation', {
  type: 'utility', effectName: 'Condemned'
});
```

Assert the Fallen subclass grants Condemnation at level 6 and that the marker
effect carries both `archon-form-effect` cleanup metadata and the source Item
identifier.

- [x] **Step 2: Verify failure**

```bash
node --test tests/vessel-stage3-cursed-fallen.test.mjs
```

- [x] **Step 3: Implement the native and adjudicated activities**

Frenzy applies a one-round effect using public dnd5e advantage/grants-advantage
changes confirmed from the installed dnd5e schema. Infernal Drain and Divine
Ward use native temporary-healing activities. Divine Wrath uses a generic
Charisma melee attack with radiant damage and a situational weapon-die field;
do not mutate an arbitrary weapon Item. Condemnation applies one visible,
source-linked marker and explains movement and critical thresholds.

- [x] **Step 4: Run focused tests and validators**

```bash
node --test tests/vessel-stage3-cursed-fallen.test.mjs \
  tests/vessel-archon-content.test.mjs
```

- [x] **Step 5: Commit**

```bash
git add archon-src/cursed-archon.yml archon-src/fallen-archon.yml \
  src/vessel/subclass-features/the-fallen src/vessel/the-fallen.yml \
  tests/vessel-stage3-cursed-fallen.test.mjs
git -c commit.gpgSign=false commit -m \
  "feat: add Cursed and Fallen activities"
```

## Task 4: Add Formless and Trickster activities

**Files:**

- Modify: `archon-src/formless-archon.yml`
- Modify: `archon-src/trickster-archon.yml`
- Modify:
  `src/vessel/subclass-features/the-formless/drain-vitality.yml`
- Create: `tests/vessel-stage3-formless-trickster.test.mjs`

**Interfaces:**

- Consumes: Iridescent scaling, Drain Vitality scaling, and temp-HP cap helpers.
- Produces roles `pseudopod-strike`, `sticky-slime`,
  `sticky-slime-escape`, `drain-vitality`,
  `drain-vitality-recovery`, `juxtapose`, and `stolen-memory`.

- [x] **Step 1: Write failing tests**

```js
assertActivity(formless, 'pseudopod-strike', {
  type: 'attack', ability: 'cha', range: 10
});
assertActivity(formless, 'sticky-slime', {
  type: 'save', ability: 'dex', effectName: 'Grappled'
});
assertActivity(formless, 'sticky-slime-escape', {
  type: 'save', ability: 'str', activation: 'action'
});
assertActivity(drainVitality, 'drain-vitality', {
  type: 'save', ability: 'con', damageType: 'acid'
});
assertActivity(trickster, 'juxtapose', {
  type: 'save', ability: 'cha', activation: 'bonus', range: 60
});
assertActivity(trickster, 'stolen-memory', {
  type: 'save', ability: 'int'
});
```

- [x] **Step 2: Verify failure**

```bash
node --test tests/vessel-stage3-formless-trickster.test.mjs
```

- [x] **Step 3: Implement activities and markers**

Pseudopods uses the shared Iridescent formula and unlocked damage choices.
Sticky Slime applies a Grappled marker with a separate Strength escape activity.
Drain Vitality uses a custom damage formula:

```text
(@classes.vessel.levels >= 20 ? 6 :
 @classes.vessel.levels >= 17 ? 5 :
 @classes.vessel.levels >= 13 ? 4 :
 @classes.vessel.levels >= 9 ? 3 : 2)d8
```

and exposes a separate follow-up recovery activity. Juxtapose and Stolen Memory
use native saves; their token movement and targeting restriction remain
explicitly adjudicated.

- [x] **Step 4: Run focused tests**

```bash
node --test tests/vessel-stage3-formless-trickster.test.mjs \
  tests/vessel-archon-profiles.test.mjs
```

- [x] **Step 5: Commit**

```bash
git add archon-src/formless-archon.yml archon-src/trickster-archon.yml \
  src/vessel/subclass-features/the-formless/drain-vitality.yml \
  tests/vessel-stage3-formless-trickster.test.mjs
git -c commit.gpgSign=false commit -m \
  "feat: add Formless and Trickster activities"
```

## Task 5: Add Mantle-bound and Archon-bound Aspect effects

**Files:**

- Modify: `aspects-src/aether-wings.yml`
- Modify: `aspects-src/opalescent-armor.yml`
- Modify: `aspects-src/primordial-bulwark.yml`
- Create: `scripts/vessel/stage3-effects.mjs`
- Modify: `scripts/vessel/operations.mjs`
- Create: `tests/vessel-stage3-effects.test.mjs`
- Create: `tests/vessel-stage3-passive-aspects.test.mjs`

**Interfaces:**

- Consumes: Stage 1 Mantle state, Stage 2 Archon state, actor ownership election.
- Produces:
  `reconcileStage3Effects(actor): Promise<void>`,
  `removeStage3Effects(actor, {binding}): Promise<void>`,
  roles `aether-wings`, `opalescent-armor`, `primordial-bulwark`,
  `primordial-bulwark-harden`.

- [ ] **Step 1: Write failing source and lifecycle tests**

Test that Aether Wings grants fly 60 and hover, Opalescent Armor grants physical
resistance and speed -10, and Primordial Bulwark is Archon-bound. Test:

```js
await reconcileStage3Effects(actor);
assert.deepEqual(
  actor.effects.filter(effect => effect.flags[MODULE_ID]?.vessel?.stage3)
    .map(effect => effect.name),
  ['Aether Wings', 'Opalescent Armor']
);
await reconcileStage3Effects(actor);
assert.equal(moduleEffects(actor).length, 2);
```

Then deactivate Mantle and assert only module-owned bound effects are removed.

- [ ] **Step 2: Verify failure**

```bash
node --test tests/vessel-stage3-effects.test.mjs \
  tests/vessel-stage3-passive-aspects.test.mjs
```

- [ ] **Step 3: Add source effects and focused reconciler**

The reconciler:

```js
export async function reconcileStage3Effects(actor) {
  if (!actor?.isOwner) return;
  const desired = desiredStage3Effects(actor);
  await removeDuplicateModuleEffects(actor, desired);
  await createMissingModuleEffects(actor, desired);
  await disableIneligibleModuleEffects(actor, desired);
}
```

It discovers owned Aspect Items by stable identifier, clones only their
module-tagged effect templates, and never changes transfer effects or foreign
effects. Primordial Bulwark Harden remains a manually invoked Utility activity
with a one-round marker if native damage reduction cannot exactly express the
Charisma reduction.

- [ ] **Step 4: Run focused and Mantle/lifecycle regression tests**

```bash
node --test tests/vessel-stage3-effects.test.mjs \
  tests/vessel-stage3-passive-aspects.test.mjs \
  tests/vessel-mantle.test.mjs tests/vessel-archon-lifecycle.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add aspects-src/aether-wings.yml aspects-src/opalescent-armor.yml \
  aspects-src/primordial-bulwark.yml scripts/vessel/stage3-effects.mjs \
  scripts/vessel/operations.mjs tests/vessel-stage3-effects.test.mjs \
  tests/vessel-stage3-passive-aspects.test.mjs
git -c commit.gpgSign=false commit -m \
  "feat: manage Vessel Stage 3 passive effects"
```

## Task 6: Add active Unsealed Aspect activities

**Files:**

- Modify: `aspects-src/perilous-visage.yml`
- Modify: `aspects-src/otherworldly-maw.yml`
- Modify: `aspects-src/twilight-steps.yml`
- Modify: `aspects-src/shimmering-lance.yml`
- Modify: `aspects-src/dazzling-lance.yml`
- Modify: `aspects-src/sundering-strike.yml`
- Modify: `aspects-src/vexing-strike.yml`
- Create: `tests/vessel-stage3-active-aspects.test.mjs`

**Interfaces:**

- Consumes: shared Iridescent scale, Vessel spell-slot attribute
  `spells.vessel.value`, and Stage 3 role flags.
- Produces all remaining Aspect activities and source-linked effects.

- [ ] **Step 1: Write failing inventory and schema tests**

Assert exact mechanics:

```js
assertActivity(perilous, 'perilous-visage', {
  type: 'save', ability: 'wis', range: 60, effectName: 'Frightened'
});
assertActivity(maw, 'otherworldly-maw', {
  type: 'save', ability: 'cha', damage: '2d6', damageType: 'necrotic'
});
assertActivity(twilight, 'twilight-steps', {
  type: 'utility', activation: 'bonus', duration: 'turn'
});
assertActivity(shimmering, 'shimmering-lance', {
  type: 'attack', attackType: 'ranged', ability: 'cha',
  range: 30, longRange: 90
});
assertActivity(dazzling, 'dazzling-eruption', {
  type: 'save', ability: 'dex', range: 300, templateSize: 30,
  consumptionPath: 'spells.vessel.value'
});
assertActivity(sundering, 'sundering-strike', {
  type: 'save', ability: 'cha'
});
assertActivity(vexing, 'vexing-strike', {
  type: 'utility', activation: 'special'
});
```

- [ ] **Step 2: Verify failure**

```bash
node --test tests/vessel-stage3-active-aspects.test.mjs
```

- [ ] **Step 3: Add activities and source-linked markers**

Use separate native activities for the triggering attack and optional rider.
Dazzling Eruption consumes one Vessel slot through a normal attribute
consumption target and uses:

```text
(@classes.vessel.levels >= 17 ? 8 :
 @classes.vessel.levels >= 13 ? 7 : 6)d8
```

Perilous Visage applies a one-minute Frightened effect; repeat saves and
line-of-sight disadvantage remain on its card. Sundering and Vexing apply
one-round descriptive markers without patching spell or attack workflows.

- [ ] **Step 4: Run focused tests**

```bash
node --test tests/vessel-stage3-active-aspects.test.mjs \
  tests/vessel-stage3-rules.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add aspects-src tests/vessel-stage3-active-aspects.test.mjs
git -c commit.gpgSign=false commit -m \
  "feat: add native Unsealed Aspect activities"
```

## Task 7: Route Stage 3 activity preparation through public hooks

**Files:**

- Modify: `scripts/vessel/hooks.mjs`
- Modify: `scripts/vessel/operations.mjs`
- Modify: `scripts/vessel-automation.mjs`
- Create: `tests/vessel-stage3-hooks.test.mjs`
- Modify: `tests/vessel-automation-hooks.test.mjs`

**Interfaces:**

- Consumes: Stage 3 role inventory, rules, effect reconciler, existing
  `handlePreUseActivity`.
- Produces:
  `prepareStage3Activity(activity, usageConfig): boolean`,
  `handleStage3ActorUpdate(actor, changes): Promise<void>`.

- [ ] **Step 1: Write failing hook tests**

Cover:

```js
assert.equal(handlePreUseActivity(unrelatedActivity), undefined);
assert.equal(handlePreUseActivity(archonOnlyActivityOnBaseActor), false);
assert.equal(handlePreUseActivity(mantleOnlyActivityWithMantleOff), false);
assert.equal(handlePreUseActivity(validActivity), undefined);
```

Assert Arcane Blast, Pseudopods, Shimmering Lance, and Dazzling Eruption receive
only unlocked damage types; Cataclysmic Eruption receives only the saved
affinity type. Assert pre-use rejection occurs before native consumption and
ordinary activity roles are untouched.

- [ ] **Step 2: Verify failure**

```bash
node --test tests/vessel-stage3-hooks.test.mjs \
  tests/vessel-automation-hooks.test.mjs
```

- [ ] **Step 3: Implement routing without resolution**

Add Stage 3 routing after existing Archon/Mantle routing:

```js
if (STAGE3_ACTIVITY_ROLES.has(activityRole)) {
  return prepareStage3Activity(activity, usageConfig);
}
```

Preparation may update the cloned activity source's damage types and validate
state. It must not call `activity.use()`, update HP, apply damage, or consume a
slot. Reconcile passive effects from public actor/effect/item hooks using the
existing responsible-client election.

- [ ] **Step 4: Run hook and lifecycle regression tests**

```bash
node --test tests/vessel-stage3-hooks.test.mjs \
  tests/vessel-automation-hooks.test.mjs \
  tests/vessel-archon-hooks.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add scripts/vessel/hooks.mjs scripts/vessel/operations.mjs \
  scripts/vessel-automation.mjs tests/vessel-stage3-hooks.test.mjs \
  tests/vessel-automation-hooks.test.mjs
git -c commit.gpgSign=false commit -m \
  "feat: route Vessel Stage 3 activities"
```

## Task 8: Migrate existing owned Stage 3 Items

**Files:**

- Modify: `scripts/vessel/constants.mjs`
- Modify: `scripts/vessel/migration.mjs`
- Create: `tests/vessel-stage3-migration.test.mjs`
- Modify: `tests/vessel-archon-migration.test.mjs`

**Interfaces:**

- Consumes: canonical sources from `homebrew-classes`, `vessel-aspects`, and
  `vessel-archon-forms`; Stage 2 migration version 2.
- Produces idempotent migration version 3.

- [ ] **Step 1: Write failing migration tests**

Construct actors with legacy owned Aspects and subclass Items. Assert migration:

```js
assert.equal(actor.flags[MODULE_ID].vessel.migrationVersion, 3);
assert.equal(ownedAspect.name, 'Player Renamed Wings');
assert.equal(ownedAspect.img, 'custom/wings.webp');
assert.ok(findRole(ownedAspect, 'aether-wings'));
assert.ok(findRole(ownedCondemnation, 'condemnation'));
assert.ok(ownedAspect.flags.foreignModule);
```

Assert unrelated activities/effects survive, activity use state survives,
failure does not record version 3, retries succeed, and a second successful run
does no writes.

- [ ] **Step 2: Verify failure**

```bash
node --test tests/vessel-stage3-migration.test.mjs \
  tests/vessel-archon-migration.test.mjs
```

- [ ] **Step 3: Add selective version-3 repair**

Raise `VESSEL_MIGRATION_VERSION` to `3`. Merge only module-owned activities,
effects, fixed formulas, and module flags by stable ID/role. Load all canonical
documents before the first owned-Item update so missing packs cannot create a
partial migration. Reuse Stage 2's preservation and completion semantics.

- [ ] **Step 4: Run all Vessel migration tests**

```bash
node --test tests/vessel-migration.test.mjs \
  tests/vessel-archon-migration.test.mjs \
  tests/vessel-stage3-migration.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add scripts/vessel/constants.mjs scripts/vessel/migration.mjs \
  tests/vessel-stage3-migration.test.mjs \
  tests/vessel-archon-migration.test.mjs
git -c commit.gpgSign=false commit -m \
  "feat: migrate owned Vessel Stage 3 activities"
```

## Task 9: Compile, validate, document, and review Stage 3

**Files:**

- Modify: `README.md`
- Modify: `tests/vessel-compiled-pack.test.mjs`
- Modify: `tests/vessel-archon-compiled-pack.test.mjs`
- Create: `tests/vessel-aspects-compiled-pack.test.mjs`
- Modify generated: `packs/homebrew-classes/**`
- Modify generated: `packs/vessel-archon-forms/**`
- Modify generated: `packs/vessel-aspects/**`
- Modify:
  `docs/superpowers/plans/2026-07-30-vessel-stage-3-activities.md`

**Interfaces:**

- Consumes: all Stage 3 source, scripts, and tests.
- Produces three verified packs and a review-ready local feature branch.

- [ ] **Step 1: Add copied-LevelDB parity tests**

Compare source and compiled documents by stable ID. For every Stage 3 document,
assert equality of:

```js
[
  'system.activities',
  'effects',
  'flags.declan-homebrew-classes'
]
```

For Actor profiles, compare embedded Item activities and effects by embedded
Item ID.

- [ ] **Step 2: Update README**

Document the Stage 3 native workflow, manual-adjudication boundary, available
Archon/Aspect controls, and explicit lack of Midi-QOL dependency. State that
teleports, pushes, swaps, and target restrictions remain player/GM adjudicated.

- [ ] **Step 3: Compile all changed packs**

From `/Users/c7g6g8/Development/dnd5e-pdf-importer/emit`, run:

```bash
node -e 'import("@foundryvtt/foundryvtt-cli").then(async m => {
  await m.compilePack(
    "/Users/c7g6g8/Development/declan-homebrew-classes/.worktrees/vessel-stage-3/src",
    "/Users/c7g6g8/Development/declan-homebrew-classes/.worktrees/vessel-stage-3/packs/homebrew-classes",
    {yaml: true, recursive: true}
  );
  await m.compilePack(
    "/Users/c7g6g8/Development/declan-homebrew-classes/.worktrees/vessel-stage-3/archon-src",
    "/Users/c7g6g8/Development/declan-homebrew-classes/.worktrees/vessel-stage-3/packs/vessel-archon-forms",
    {yaml: true, recursive: true}
  );
  await m.compilePack(
    "/Users/c7g6g8/Development/declan-homebrew-classes/.worktrees/vessel-stage-3/aspects-src",
    "/Users/c7g6g8/Development/declan-homebrew-classes/.worktrees/vessel-stage-3/packs/vessel-aspects",
    {yaml: true, recursive: true}
  );
})'
```

Remove only `LOCK` files inside those three explicit pack directories.

- [ ] **Step 4: Run source validators**

```bash
node -e 'import("./verify.mjs").then(async m => {
  for (const [source, packName] of [
    ["/Users/c7g6g8/Development/declan-homebrew-classes/.worktrees/vessel-stage-3/src", "homebrew-classes"],
    ["/Users/c7g6g8/Development/declan-homebrew-classes/.worktrees/vessel-stage-3/archon-src", "vessel-archon-forms"],
    ["/Users/c7g6g8/Development/declan-homebrew-classes/.worktrees/vessel-stage-3/aspects-src", "vessel-aspects"]
  ]) {
    const result = await m.verifyPack(source, {packName});
    console.log(packName, result.ok, result.errors.length);
    result.errors.forEach(error => console.log(error));
    if (!result.ok) process.exitCode = 1;
  }
})'
```

Expected:

```text
homebrew-classes true 0
vessel-archon-forms true 0
vessel-aspects true 0
```

- [ ] **Step 5: Run complete verification**

```bash
node --test tests/*.test.mjs
git diff --check
git status --short
```

Require every test to pass and no unexpected file changes.

- [ ] **Step 6: Commit compiled content and documentation**

```bash
git add README.md packs tests docs/superpowers/plans/2026-07-30-vessel-stage-3-activities.md
git -c commit.gpgSign=false commit -m \
  "build: compile Vessel Stage 3 activities"
```

- [ ] **Step 7: Perform final review**

Review:

```bash
git diff --stat feat/vessel-archon...HEAD
git diff --check feat/vessel-archon...HEAD
git log --format='%h %s%n%b' feat/vessel-archon..HEAD
git status --short --branch
```

Confirm:

- all 29 Stage 3 roles are covered;
- no private API or workflow replacement was introduced;
- every changed pack passed `verifyPack`;
- no module version, archive, push, or release change exists;
- no `Co-Authored-By` trailer exists.

- [ ] **Step 8: Record completion**

Check every completed plan box, commit the plan-only update, and leave the branch
ready for integration:

```bash
git add docs/superpowers/plans/2026-07-30-vessel-stage-3-activities.md
git -c commit.gpgSign=false commit -m \
  "docs: complete Vessel Stage 3 plan"
```
