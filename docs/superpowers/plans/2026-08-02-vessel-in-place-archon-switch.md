# Vessel In-Place Archon Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace native Actor polymorphing with a reversible in-place Archon Form switch, fix Vessel slot-pool discovery, populate the private-spell dropdown after packs load, and publish the approved built-in dnd5e token artwork in the Archon profile pack.

**Architecture:** The original Vessel Actor remains authoritative. Activation snapshots only the actor and token fields the module changes, creates profile Items and Active Effects as tagged embedded documents, applies profile movement/traits and Archon temp HP, changes portrait/prototype/scene-token artwork, and records recovery metadata in the existing Archon state flag. Reversion and ready-time reconciliation delete only documents carrying the matching transformation tag and restore the snapshot. Native dnd5e Activities, effects, rolls, consumption, saves, and damage resolution remain untouched.

**Tech Stack:** Foundry VTT v14, dnd5e 5.3.3, JavaScript ES modules, YAML source packs, Node built-in tests, `@foundryvtt/foundryvtt-cli`, and strict `verifyPack` validation.

## Global Constraints

- Do not call `Actor#transformInto` or `Actor#revertOriginalForm` for Archon Form.
- Do not create temporary world Actors.
- Do not replace Foundry's activity, damage, save, effect, or resource-consumption systems.
- Delete only embedded documents tagged with this module and the active transformation ID.
- Preserve and restore actor portrait, prototype-token artwork, active scene-token artwork, movement, senses, creature traits, languages, and pre-form temporary HP.
- Keep the switch usable by an owning player without GM-only cleanup.
- Source YAML is authoritative; every changed pack must pass strict `verifyPack` with zero errors.

---

### Task 1: Resolve the native Vessel spell-slot pool

**Files:**
- Modify: `scripts/vessel/archon-profiles.mjs`
- Modify: `tests/vessel-archon-profile-routing.test.mjs`

**Interfaces:**
- Produces: `resolveVesselSpellSlotPool(actor, options) -> { key, pool, target } | undefined`
- Consumed by: `prepareArchonActivityUse` for slot validation and activity consumption routing.

- [ ] Add failing tests where the owned Vessel class resolves its configured spellcasting method to a pool whose key is not hard-coded, and where the selected pool is exhausted.
- [ ] Run `node --test tests/vessel-archon-profile-routing.test.mjs` and confirm the new dynamic-pool case fails because consumption remains `spells.vessel.value`.
- [ ] Resolve the owned Vessel class, its prepared spellcasting type/progression, and the registered dnd5e model's `getSpellSlotKey()`; fall back to a uniquely matching prepared pool by `type`.
- [ ] Validate `pool.value` and rewrite each Vessel-slot activity consumption target to `spells.${key}.value` before native dnd5e consumption.
- [ ] Re-run the focused test and require zero failures.

### Task 2: Build the in-place Archon lifecycle

**Files:**
- Modify: `scripts/vessel/archon-lifecycle.mjs`
- Modify: `scripts/vessel/hooks.mjs`
- Modify: `tests/vessel-archon-lifecycle.test.mjs`
- Modify: `tests/vessel-archon-hooks.test.mjs`

**Interfaces:**
- Produces: `activateArchonForm(actor, profileActor, pending, options)` and in-place `revertArchonForm(actor, options)`.
- State additions: `snapshot`, `temporaryItemIds`, `temporaryEffectIds`, and `transformationId` under `flags.declan-homebrew-classes.vessel.archon.state`.

- [ ] Add failing lifecycle tests that activate on the same Actor, tag copied profile documents, update art/profile fields, preserve native character Items, and never call `transformInto`.
- [ ] Add failing reversion tests that restore the exact snapshot and delete only matching tagged Items/Effects, leaving unrelated documents intact.
- [ ] Add failing recovery tests for reload reconciliation and partial activation cleanup.
- [ ] Run the focused lifecycle/hook tests and confirm failures identify the still-native transform path.
- [ ] Implement snapshot/apply helpers using `Actor#update`, `TokenDocument#update`, and `createEmbeddedDocuments`; strip source IDs before creating temporary documents and attach module/transformation flags.
- [ ] Store state before dependent automation, activate Spirit Mantle through the existing helper, and roll back created documents/changed fields if activation fails.
- [ ] Replace the post-use `transformInto` call with `activateArchonForm`; remove native-transform permission requirements from preparation.
- [ ] Reimplement reversion as in-place cleanup and snapshot restoration; make cleanup idempotent for reload recovery.
- [ ] Re-run focused tests and require zero failures.

### Task 3: Refresh private-spell choices after compendium discovery

**Files:**
- Modify: `scripts/vessel/spell-settings.mjs`
- Modify: `scripts/vessel-automation.mjs`
- Modify: `tests/vessel-spell-settings.test.mjs`
- Modify: `tests/vessel-spellcasting.test.mjs`

**Interfaces:**
- Produces: `refreshPrivateSpellCompendiumChoices({ settings, packs }) -> boolean`.

- [ ] Add a failing test that registers with no packs during `init`, adds an Item pack, runs the `ready` callback, and expects the existing setting registration to contain the new choice.
- [ ] Run the two focused setting tests and confirm the choice remains `None` before implementation.
- [ ] Mutate the registered setting's choices from current `game.packs` during `ready`, preserving the selected collection and filtering to Item packs.
- [ ] Re-run the focused tests and require zero failures.

### Task 4: Publish approved token art and migrate owned controls

**Files:**
- Modify: `archon-src/*.yml`
- Modify: `scripts/vessel/migration.mjs` only where lifecycle activity repair requires it
- Modify: `tests/vessel-archon-profiles.test.mjs`
- Modify: `tests/vessel-archon-migration.test.mjs`
- Modify: `tests/vessel-archon-compiled-pack.test.mjs`
- Rebuild: `packs/vessel-archon-forms/`

**Interfaces:**
- Profile `img` becomes the source for actor, prototype token, and active token art during the in-place switch.

- [ ] Add failing source tests for the nine exact built-in paths: Solar, four Elementals, PitFiend, FallenArchangelSwordSpear, OchreJelly, and Doppelganger.
- [ ] Update all nine Archon Actor YAML sources with the approved `systems/dnd5e/tokens/...` paths.
- [ ] Add or adjust owned-item migration coverage so existing actors receive any canonical lifecycle activity changes without losing user-authored fields.
- [ ] Compile `archon-src/` into `packs/vessel-archon-forms/` and remove an empty generated `LOCK` if present.
- [ ] Run source, migration, and compiled-pack parity tests and require zero failures.

### Task 5: Full verification and handoff

**Files:**
- Verify all modified files and generated packs.

- [ ] Run `node --test tests/*.test.mjs` and require zero failures.
- [ ] Run strict `verifyPack` for `src` as `homebrew-classes`, `archon-src` as `vessel-archon-forms`, `aspects-src` as `vessel-aspects`, `exploits-src` as `warlord-exploits`, and `fighting-styles-src` as `warlord-fighting-styles`; require `ok: true` and zero errors for each.
- [ ] Run `git diff --check` and inspect `git status --short` plus the complete diff.
- [ ] Do not push, merge, tag, or release without explicit user approval.
