# Vessel Dire Stature and Reversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reversible Dire Stature transformation choices and make Archon reversion preserve languages, token geometry, and pre-transform temporary HP exactly.

**Architecture:** Extend the existing in-place Archon snapshot and asynchronous activity preflight. Growth choices become persisted transformation state; normal dnd5e Active Effects supply AC and melee damage bonuses, and the lifecycle owns exact rollback.

**Tech Stack:** Foundry VTT 14, dnd5e 5.3.3, JavaScript ES modules, YAML Items, Node test runner.

## Global Constraints

- Preserve the current in-place Actor lifecycle and actor-operation serializer.
- Do not invoke native `transformInto` or create world Actors.
- Do not rewrite dnd5e damage resolution.
- Restore exact pre-transform state after normal reversion, rollback, and retry cleanup.
- Do not push or release without separate explicit approval.

---

### Task 1: Make Archon snapshots persistence-safe

**Files:**
- Modify: `scripts/vessel/archon-lifecycle.mjs`
- Modify: `tests/vessel-archon-lifecycle.test.mjs`

**Interfaces:**
- Produces: serializable `state.snapshot.actor` and `state.snapshot.tokens[]` including `width`, `height`, and texture.

- [ ] **Step 1: Add a failing JSON round-trip test** that activates, serializes/parses the stored flag, and reverts an actor with standard/custom languages, Set-backed traits, temp HP 0, and a non-1x1 token.
- [ ] **Step 2: Confirm failure** with `node --test tests/vessel-archon-lifecycle.test.mjs` because Set values become empty objects and geometry is absent.
- [ ] **Step 3: Build snapshots from `actor.toObject()` or `_source`** and normalize set-like trait values to arrays before `setFlag`.
- [ ] **Step 4: Snapshot and restore active token `width` and `height`** alongside texture source; keep UUID-first resolution.
- [ ] **Step 5: Add explicit tests** for 0→Archon temp HP→0 and 4→Archon temp HP→4 reversion.
- [ ] **Step 6: Run the focused test** and commit with `git commit -m "fix: persist Archon reversion snapshots"`.

### Task 2: Model Dire Stature growth choices

**Files:**
- Modify: `scripts/vessel/constants.mjs`
- Modify: `scripts/vessel/rules.mjs`
- Create: `tests/vessel-dire-stature.test.mjs`

**Interfaces:**
- Produces: `getDireStatureOptions(actor) -> number[]`, `getDireGrowthBonuses(categories)`, and state field `growthCategories`.

- [ ] **Step 1: Add failing tests** for no Aspect, Dire Stature `[0,1]`, Dire plus Colossal `[0,1,2]`, and Huge cap.
- [ ] **Step 2: Add stable automation roles** for the Dire prompt/effect and implement identifier-based Aspect detection.
- [ ] **Step 3: Implement bonus calculation** returning `{size, width, height, acBonus, meleeDamage, reachBonus}` where one category yields Large/2x2/+1/`1d4`/+5 and two yields Huge/3x3/+2/`2d4`/+10.
- [ ] **Step 4: Run** `node --test tests/vessel-dire-stature.test.mjs` and commit with `git commit -m "feat: model Dire Stature growth"`.

### Task 3: Prompt during the existing Archon preflight

**Files:**
- Modify: `scripts/vessel/archon-profiles.mjs`
- Modify: `scripts/vessel/hooks.mjs`
- Modify: `tests/vessel-archon-profile-routing.test.mjs`
- Modify: `tests/vessel-archon-hooks.test.mjs`

**Interfaces:**
- Consumes: `getDireStatureOptions(actor)`.
- Produces: `promptForDireStature(actor, dependencies?) -> number | null`; prepared payload includes `growthCategories`.

- [ ] **Step 1: Add failing async-preflight tests** proving no prompt without Dire, cancel prevents retry/consumption, and the selected value survives the guarded retry.
- [ ] **Step 2: Implement one owner-gated `DialogV2.wait`** with Normal, Large, and conditional Huge buttons plus the room-confirmation text.
- [ ] **Step 3: Cache the selection in the existing preparation payload** so the retry does not prompt twice.
- [ ] **Step 4: Copy `growthCategories` into the pending transformation state** before the native activity completes.
- [ ] **Step 5: Run the two focused suites** and commit with `git commit -m "feat: prompt for Dire Stature on transform"`.

### Task 4: Apply native growth effects and token geometry

**Files:**
- Modify: `aspects-src/dire-stature.yml`
- Modify: `scripts/vessel/archon-lifecycle.mjs`
- Modify: `scripts/vessel/stage3-effects.mjs`
- Modify: `tests/vessel-dire-stature.test.mjs`
- Modify: `tests/vessel-stage3-effects.test.mjs`

**Interfaces:**
- Produces: a transformation-ID-tagged Archon effect with AC and melee damage changes.

- [ ] **Step 1: Add failing assertions** for `system.attributes.ac.bonus`, `system.bonuses.mwak.damage`, and `system.bonuses.msak.damage` using +1/`1d4` or +2/`2d4`.
- [ ] **Step 2: Apply actor size and active-token geometry** after the profile update but before finalization.
- [ ] **Step 3: Create the tagged effect through normal embedded ActiveEffect APIs** and include the reach reminder in its description.
- [ ] **Step 4: Adjust only module-owned temporary melee Archon activities** by the computed reach bonus; never mutate unrelated owned Items.
- [ ] **Step 5: Verify failed activation and normal reversion remove the exact effect and restore size/geometry** through lifecycle tests.
- [ ] **Step 6: Run focused tests** and commit with `git commit -m "feat: apply Dire Stature in Archon Form"`.

### Task 5: Migrate, compile, and validate Dire Stature

**Files:**
- Modify: `scripts/vessel/migration.mjs`
- Modify: `scripts/vessel/constants.mjs`
- Modify: `tests/vessel-migration.test.mjs`
- Modify: `tests/vessel-compiled-pack.test.mjs`

**Interfaces:**
- Produces: the next unused migration version with canonical Dire source synchronization.

- [ ] **Step 1: Add a failing migration test** for an existing owned Dire Stature Item lacking its canonical effect/flags.
- [ ] **Step 2: Extend migration source loading and repair** without replacing unrelated user effects.
- [ ] **Step 3: Compile `vessel-aspects` and `homebrew-classes`**, remove empty `LOCK` files, and run strict `verifyPack` on both.
- [ ] **Step 4: Run** `node --test tests/vessel-*.test.mjs` and confirm zero failures.
- [ ] **Step 5: Commit** with `git commit -m "build: compile Dire Stature automation"`.

