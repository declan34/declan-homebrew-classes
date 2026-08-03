# Vessel Iridescent Strikes Feature Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Iridescent Strike into its own level-1 Vessel feature with one native attack while preserving Spirit Mantle, damage scaling, automation, and existing actors.

**Architecture:** The Homebrew Classes YAML remains authoritative. A new stable feat owns the role-tagged Strike activity, Spirit Mantle owns only its toggle and armor effect, and migration version 4 creates or repairs the new feat while deleting only legacy module-owned Strikes from Spirit Mantle. Existing hooks continue routing by immutable activity role, so combat stays inside dnd5e's native attack and damage workflow.

**Tech Stack:** Foundry VTT v13/v14 module manifest, dnd5e 5.3.3 activities and advancements, YAML source documents, JavaScript ES modules, Node's built-in test runner, `@foundryvtt/foundryvtt-cli`, and the importer's strict `verifyPack` validator.

## Global Constraints

- The new Item ID is `hbrvesIriStrike1`; its identifier is `iridescent-strikes`.
- The single activity ID is `IriStrikeAct0001`; its role remains `iridescent-strike`.
- The activity uses native dnd5e Attack resolution and special activation.
- The scale remains `@scale.vessel.iridescent-strike` on the Vessel class Item.
- Spirit Mantle keeps its stable ID, toggle activity, and Ethereal Armor effect.
- Migration preserves custom activities, item presentation, effect state, and unrelated player data.
- No version bump, push, tag, or release is part of this plan.

---

### Task 1: Canonical Feature Split

**Files:**
- Create: `src/vessel/class-features/iridescent-strikes.yml`
- Modify: `src/vessel/class-features/spirit-mantle.yml`
- Modify: `src/vessel/the-vessel.yml`
- Modify: `tests/vessel-spirit-mantle-content.test.mjs`

**Interfaces:**
- Consumes: the existing `iridescent-strike` scale and automation role.
- Produces: canonical Item `hbrvesIriStrike1` with activity `IriStrikeAct0001`; a level-1 grant for both Items; a Mantle containing only `mantle-toggle` and `mantle-ac` mechanics.

- [ ] **Step 1: Write failing source-content tests**

Load `iridescent-strikes.yml` beside the existing Vessel and Mantle fixtures and assert:

```js
assert.equal(strikes._id, 'hbrvesIriStrike1');
assert.equal(strikes.system.identifier, 'iridescent-strikes');
assert.deepEqual(
  Object.values(mantle.system.activities).map(role),
  ['mantle-toggle']
);
const strike = Object.values(strikes.system.activities)[0];
assert.equal(strike._id, 'IriStrikeAct0001');
assert.equal(role(strike), 'iridescent-strike');
assert.equal(strike.type, 'attack');
assert.equal(strike.activation.type, 'special');
assert.equal(strike.attack.ability, 'cha');
assert.equal(strike.attack.type.classification, 'unarmed');
assert.equal(
  strike.damage.parts[0].custom.formula,
  '@scale.vessel.iridescent-strike + @mod'
);
assert.deepEqual(strike.damage.parts[0].types, ['radiant']);
```

Assert the level-1 ItemGrant contains both stable UUIDs:

```js
assert.deepEqual(
  levelOneGrant.configuration.items.map(entry => entry.uuid),
  [
    'Compendium.declan-homebrew-classes.homebrew-classes.Item.hbrvespnPw2Da1c3',
    'Compendium.declan-homebrew-classes.homebrew-classes.Item.hbrvesIriStrike1'
  ]
);
```

- [ ] **Step 2: Run the content test and verify RED**

Run:

```bash
node --test tests/vessel-spirit-mantle-content.test.mjs
```

Expected: FAIL because `iridescent-strikes.yml` does not exist and Spirit Mantle still owns two Strikes.

- [ ] **Step 3: Create the canonical feature and split Spirit Mantle**

Create the new feat using the current Strike activity as its mechanical source, with exactly one activity:

```yaml
_id: hbrvesIriStrike1
name: Iridescent Strikes
type: feat
system:
  identifier: iridescent-strikes
  activities:
    IriStrikeAct0001:
      _id: IriStrikeAct0001
      type: attack
      name: Iridescent Strike
      activation:
        type: special
      flags:
        declan-homebrew-classes:
          vessel:
            role: iridescent-strike
      attack:
        ability: cha
        type:
          value: melee
          classification: unarmed
      damage:
        includeBase: true
        parts:
          - custom:
              enabled: true
              formula: '@scale.vessel.iridescent-strike + @mod'
            denomination: 0
            types: [radiant]
```

Copy the complete surrounding dnd5e feat/activity schema from the current canonical Mantle Strike, remove both Strike mappings from Spirit Mantle, and split the published description so the new feature contains the Iridescent Strikes paragraph while Mantle retains activation, appearance, Ethereal Armor, and non-strike rules. Add the new stable UUID to the existing level-1 ItemGrant after Spirit Mantle.

- [ ] **Step 4: Run the content test and verify GREEN**

Run:

```bash
node --test tests/vessel-spirit-mantle-content.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 5: Commit the canonical split**

```bash
git add src/vessel/class-features/iridescent-strikes.yml src/vessel/class-features/spirit-mantle.yml src/vessel/the-vessel.yml tests/vessel-spirit-mantle-content.test.mjs
git -c commit.gpgSign=false commit -m "feat: split Iridescent Strikes from Spirit Mantle"
```

---

### Task 2: Existing-Actor Migration Version 4

**Files:**
- Modify: `scripts/vessel/constants.mjs`
- Modify: `scripts/vessel/migration.mjs`
- Modify: `tests/vessel-migration.test.mjs`

**Interfaces:**
- Consumes: canonical Item `hbrvesIriStrike1`, activity role `iridescent-strike`, and existing `ownedItemSource(canonical)` helper.
- Produces: `IRIDESCENT_STRIKES_ITEM_ID`, migration version 4, `source.strikes`, one owned Strikes Item, and a Mantle with no module-owned Strike activities.

- [ ] **Step 1: Write failing migration tests**

Extend the fixture to load the new canonical source. Make the fake Item updater support Foundry deletion keys:

```js
const deletion = path.match(/^system\.activities\.-=([^.]+)$/);
if (deletion) {
  this.system.activities.delete(deletion[1]);
  continue;
}
```

Make the fake actor implement Item creation from canonical data. Assert migration from version 3:

```js
assert.equal(VESSEL_MIGRATION_VERSION, 4);
assert.equal(target.itemsByIdentifier('iridescent-strikes').length, 1);
assert.equal(
  [...mantleItem.system.activities.values()].some(
    activity => role(activity) === 'iridescent-strike'
  ),
  false
);
assert.equal(mantleItem.system.activities.has('CustomActivity01'), true);
```

Add cases proving an existing Strikes Item is repaired without duplication, a failed Item creation leaves migration version 3, and retry creates exactly one Item and records version 4.

- [ ] **Step 2: Run the migration test and verify RED**

Run:

```bash
node --test tests/vessel-migration.test.mjs
```

Expected: FAIL because migration version is 3, the canonical Strikes Item is not loaded or created, and Mantle Strike activities are retained.

- [ ] **Step 3: Implement migration version 4**

Add the stable constant and bump the version:

```js
export const VESSEL_MIGRATION_VERSION = 4;
export const IRIDESCENT_STRIKES_ITEM_ID = 'hbrvesIriStrike1';
```

Load the new document with the other Homebrew Classes migration sources and return it as `strikes`. Add a focused repair function that ensures the canonical role-tagged activity exists on the owned Strikes Item using `repairActivity`.

Before migration completes:

```js
let strikesItem = items.find(item => identifier(item) === 'iridescent-strikes');
if (!strikesItem) {
  const created = await actor.createEmbeddedDocuments(
    'Item',
    [ownedItemSource(source.strikes)],
    { keepId: true }
  );
  strikesItem = created?.[0];
  if (!strikesItem) {
    throw new Error('Foundry did not create the missing Iridescent Strikes Item.');
  }
}
await migrateIridescentStrikesItem(strikesItem, source.strikes);
```

Change `migrateMantleItem` to require only the toggle from the canonical Mantle and delete every legacy activity whose role is `iridescent-strike` using exact Foundry deletion paths:

```js
for (const activity of documents(item.system?.activities)) {
  if (getAutomationRole(activity) !== AUTOMATION_ROLES.IRIDESCENT_STRIKE) continue;
  await item.update({ [`system.activities.-=${documentId(activity)}`]: null });
}
```

Keep custom activities and the Mantle effect migration unchanged. Only set the version 4 flag after creation, Strikes repair, Mantle cleanup, and all existing migration work succeeds.

- [ ] **Step 4: Run focused migration and automation tests**

Run:

```bash
node --test tests/vessel-migration.test.mjs tests/vessel-automation-hooks.test.mjs
```

Expected: all tests PASS, including inactive-Mantle prompt and owned-activity retry behavior.

- [ ] **Step 5: Commit migration version 4**

```bash
git add scripts/vessel/constants.mjs scripts/vessel/migration.mjs tests/vessel-migration.test.mjs
git -c commit.gpgSign=false commit -m "feat: migrate Iridescent Strikes to its own item"
```

---

### Task 3: Compiled Pack Parity and Full Verification

**Files:**
- Modify: `tests/vessel-compiled-pack.test.mjs`
- Rebuild: `packs/homebrew-classes/`

**Interfaces:**
- Consumes: the canonical source Items and migration implementation from Tasks 1 and 2.
- Produces: a committed LevelDB pack containing the split feature and tests proving source/pack parity.

- [ ] **Step 1: Write the failing compiled-pack parity test**

Load `iridescent-strikes.yml`, locate both stable Items in the extracted pack, and assert:

```js
assert.ok(compiledMantle);
assert.ok(compiledStrikes);
assert.deepEqual(compiledMantle.system.activities, mantleSource.system.activities);
assert.deepEqual(compiledStrikes.system.activities, strikesSource.system.activities);
assert.deepEqual(compiledMantle.effects, mantleSource.effects);
```

- [ ] **Step 2: Run the parity test and verify RED**

Run:

```bash
node --test tests/vessel-compiled-pack.test.mjs
```

Expected: FAIL because the committed pack does not contain `hbrvesIriStrike1` and still contains the old Mantle activities.

- [ ] **Step 3: Recompile the Homebrew Classes pack**

From `dnd5e-pdf-importer/emit`, run:

```bash
node -e 'import("@foundryvtt/foundryvtt-cli").then(m=>m.compilePack("/Users/c7g6g8/Development/declan-homebrew-classes/src","/Users/c7g6g8/Development/declan-homebrew-classes/packs/homebrew-classes",{yaml:true,recursive:true}))'
```

Remove only an exact zero-byte `packs/homebrew-classes/LOCK` created by compilation.

- [ ] **Step 4: Run the complete verification gate**

Run:

```bash
node --test tests/*.test.mjs
node -e 'import("./verify.mjs").then(async m=>{const r=await m.verifyPack("/Users/c7g6g8/Development/declan-homebrew-classes/src",{packName:"homebrew-classes"});console.log(JSON.stringify({ok:r.ok,errors:r.errors.length}));r.errors.forEach(e=>console.error(e));if(!r.ok)process.exitCode=1})'
node scripts/verify-warlord-sources.mjs
git diff --check
```

Expected: zero failing tests; `verifyPack` prints `{"ok":true,"errors":0}`; Warlord core and cross-pack validation both print `{"ok":true,"errors":0}`; `git diff --check` exits 0.

- [ ] **Step 5: Commit pack parity**

```bash
git add tests/vessel-compiled-pack.test.mjs packs/homebrew-classes
git -c commit.gpgSign=false commit -m "build: compile split Iridescent Strikes feature"
```

---

### Task 4: Whole-Branch Review

**Files:**
- Review only: all files changed since `6717d75`.

**Interfaces:**
- Consumes: all prior task commits.
- Produces: a clean, locally verified implementation ready for explicit release approval.

- [ ] **Step 1: Inspect the complete diff and commit scope**

```bash
git diff --stat 6717d75..HEAD
git diff --check 6717d75..HEAD
git status -sb
```

Expected: only the canonical content split, migration, tests, and rebuilt Homebrew Classes pack are changed; the worktree is clean and local `main` is ahead of `origin/main` only by intentional commits.

- [ ] **Step 2: Re-run the focused user-visible regression tests**

```bash
node --test tests/vessel-spirit-mantle-content.test.mjs tests/vessel-migration.test.mjs tests/vessel-automation-hooks.test.mjs tests/vessel-compiled-pack.test.mjs
```

Expected: all focused tests PASS. Stop without pushing, tagging, rebuilding `module.zip`, changing `module.json`, or publishing a release.
