# Vessel Spell Progression and Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair Vessel spellcasting presentation, add a native Vessel Compendium Browser filter, and grant fixed subclass spells idempotently from public/private providers.

**Architecture:** The public module owns the Vessel spellcasting model, content-light Sealed Magic manifest, and actor reconciler. Both repositories publish registered dnd5e Spell List journal pages; the private module contributes only privately held spell links. Dynamic grants reuse `resolveSealedMagicEntry` and create ordinary actor-owned spell Items.

**Tech Stack:** Foundry VTT 14, dnd5e 5.3.3, JavaScript ES modules, YAML source packs, Node test runner, `@foundryvtt/foundryvtt-cli`.

## Global Constraints

- Public content is limited to authorized homebrew and SRD 5.1/5.2.1.
- Never store commercial spell descriptions in `declan-homebrew-classes`.
- Exact normalized-name matching only; no fuzzy resolution.
- Never duplicate or delete actor-owned spells.
- Run strict `verifyPack` with zero errors for every affected pack.
- Do not push or release without separate explicit approval.

---

### Task 1: Repair Vessel class spellcasting metadata and scales

**Files:**
- Modify: `src/vessel/the-vessel.yml`
- Modify: `src/vessel/class-features/vessel-magic.yml`
- Test: `tests/vessel-spellcasting.test.mjs`

**Interfaces:**
- Produces: class scale identifiers `cantrips-known`, `spells-known`, `spell-slots`, and `slot-level`.

- [ ] **Step 1: Add failing source assertions** for `primaryAbility.value: [cha]`, an empty Vessel Magic use resource, and the exact published 1–20 scale breakpoints.
- [ ] **Step 2: Run** `node --test tests/vessel-spellcasting.test.mjs` and confirm the new assertions fail.
- [ ] **Step 3: Update the YAML** so Charisma is primary, Vessel Magic has `max: ''` with no recovery, and four stable `ScaleValue` advancements reproduce the published table.
- [ ] **Step 4: Run** `node --test tests/vessel-spellcasting.test.mjs` and confirm it passes.
- [ ] **Step 5: Commit** with `git commit -m "fix: repair Vessel spellcasting progression"`.

### Task 2: Resolve live Vessel slot pools robustly

**Files:**
- Modify: `scripts/vessel/archon-profiles.mjs`
- Test: `tests/vessel-archon-profiles.test.mjs`

**Interfaces:**
- Produces: `resolveVesselSpellSlotPool(actor, dependencies) -> {key, pool, target} | undefined`.

- [ ] **Step 1: Add failing cases** for plain objects, Map-like pool collections, a model-provided slot key, a pool whose `type` is `vessel`, and an actual pool key different from the progression identifier.
- [ ] **Step 2: Run** `node --test tests/vessel-archon-profiles.test.mjs` and confirm the Map-like and alternate-key cases fail.
- [ ] **Step 3: Implement a `spellPoolEntries` adapter** that reads object and Map-like collections, compares model key/progression/type metadata, and returns the exact actor update path.
- [ ] **Step 4: Add the available non-sensitive pool keys to the thrown `ArchonPreparationError.details`** while retaining the current user-facing message.
- [ ] **Step 5: Run** `node --test tests/vessel-archon-profiles.test.mjs` and confirm it passes.
- [ ] **Step 6: Commit** with `git commit -m "fix: resolve Vessel spell slot pools"`.

### Task 3: Define and validate the Sealed Magic manifest

**Files:**
- Create: `scripts/vessel/sealed-magic-manifest.mjs`
- Create: `tests/vessel-sealed-magic-manifest.test.mjs`

**Interfaces:**
- Produces: `SEALED_MAGIC_ENTRIES`, `sealedMagicEntriesForActor(actor)`, and stable keys formatted `<subclass>-<level>-<normalized-name>`.
- Consumes: `getVesselSubclassIdentifier`, `ELEMENTAL_AFFINITY_FLAG`.

- [ ] **Step 1: Transcribe the six published subclass tables** into test expectations containing only key, name, subclass, Vessel level, and optional affinity.
- [ ] **Step 2: Add tests** rejecting duplicate keys, duplicate `(subclass, affinity, level, normalizedName)` entries, invalid levels, and unknown affinities.
- [ ] **Step 3: Run** `node --test tests/vessel-sealed-magic-manifest.test.mjs` and confirm the module is missing.
- [ ] **Step 4: Implement and freeze the manifest**, including shared and affinity-specific Cataclysm entries.
- [ ] **Step 5: Run the test** and confirm exact table parity passes.
- [ ] **Step 6: Commit** with `git commit -m "feat: define Vessel Sealed Magic progression"`.

### Task 4: Reconcile subclass spells onto actors

**Files:**
- Create: `scripts/vessel/sealed-magic-reconciler.mjs`
- Modify: `scripts/vessel/hooks.mjs`
- Modify: `scripts/vessel-automation.mjs`
- Create: `tests/vessel-sealed-magic-reconciler.test.mjs`

**Interfaces:**
- Consumes: `sealedMagicEntriesForActor(actor)`, `resolveSealedMagicEntry(entry)`, `serializeActorOperation(actor, operation)`.
- Produces: `reconcileSealedMagic(actor, dependencies?) -> {created, skipped, unresolved}`.

- [ ] **Step 1: Add failing tests** for eligible-level grants, stable-key idempotence, same-name skip, provider outage, ambiguous source, partial success, non-owner actors, and affinity filtering.
- [ ] **Step 2: Run** `node --test tests/vessel-sealed-magic-reconciler.test.mjs` and confirm failure from the missing module.
- [ ] **Step 3: Implement source loading with `fromUuid` and `toObject()`**, strip compendium-only IDs/ownership/folder fields, and attach `flags.declan-homebrew-classes.vessel.sealedMagic` metadata.
- [ ] **Step 4: Implement normalized-name and stable-key deduplication** without modifying or deleting existing actor Items.
- [ ] **Step 5: Register debounced reconciliation** on ready, owned subclass/class changes, sheet render, and private setting changes; route warnings once per pass to the responsible user.
- [ ] **Step 6: Run the focused tests** and `node --test tests/vessel-spell-provider.test.mjs tests/vessel-sealed-magic-provider.test.mjs tests/vessel-sealed-magic-reconciler.test.mjs`.
- [ ] **Step 7: Commit** with `git commit -m "feat: grant Vessel subclass spells"`.

### Task 5: Add the public native Vessel spell-list pack

**Files:**
- Create: `spell-lists-src/vessel-spells.yml`
- Create: `scripts/build-vessel-spell-list.mjs`
- Modify: `module.json`
- Create: `tests/vessel-spell-list.test.mjs`

**Interfaces:**
- Produces: registered page UUID `Compendium.declan-homebrew-classes.vessel-spell-lists.JournalEntry.<entry-id>.JournalEntryPage.<page-id>` with identifier `vessel` and type `class`.

- [ ] **Step 1: Add tests** requiring a JournalEntry pack with a `flags.dnd5e.spellLists` manifest registration and one normalized profile per authorized public Vessel spell.
- [ ] **Step 2: Run** `node --test tests/vessel-spell-list.test.mjs` and confirm the missing pack failure.
- [ ] **Step 3: Implement the deterministic builder** to read `spells-src`, combine approved SRD profiles, sort by level/name, and throw on duplicate normalized names.
- [ ] **Step 4: Emit the spell-list Journal source** with stable 16-character IDs, `type: spellList`, `system.identifier: vessel`, `system.type: class`, and level grouping.
- [ ] **Step 5: Register the pack and page UUID in `module.json`**, including `dnd5e.display` and spell-list flags required by dnd5e 5.3.3.
- [ ] **Step 6: Compile and verify** the new pack using the importer CLI and strict `verifyPack`; remove empty `LOCK` files.
- [ ] **Step 7: Run** `node --test tests/vessel-spell-list.test.mjs` and commit with `git commit -m "feat: register native Vessel spell list"`.

### Task 6: Add the private Vessel spell-list contribution

**Files (private repository):**
- Create: `scripts/build-vessel-spell-list.mjs`
- Modify: `module.json`
- Modify: `scripts/verify-private-module.mjs`
- Modify: `scripts/package-private-module.mjs`
- Modify: `tests/module-contract.test.mjs`
- Modify: `tests/private-workflow.test.mjs`
- Create: `tests/vessel-spell-list.test.mjs`

**Interfaces:**
- Produces: a third, generation-pinned `JournalEntry` pack and a registered page with identifier `vessel`.
- Consumes: the current generation's private spell index and the approved Vessel list names.

- [ ] **Step 1: Update failing module-contract tests** to require exactly Item, Actor, and JournalEntry packs from one generation and validate the registered spell-list page UUID.
- [ ] **Step 2: Run the private test suite** and confirm the current two-pack assumptions fail.
- [ ] **Step 3: Generalize snapshot verification and packaging** from positional two-pack logic to named `private-spells`, `private-summons`, and `vessel-spell-lists` definitions while retaining containment and immutable-generation checks.
- [ ] **Step 4: Implement the private list builder** to select only Vessel-list Tasha's/Xanathar's documents, normalize names, reject duplicate candidates, and emit links rather than copied spell data.
- [ ] **Step 5: Compile the JournalEntry pack inside the pinned generation** and update `module.json` paths plus `flags.dnd5e.spellLists`.
- [ ] **Step 6: Run** `node --test tests/*.test.mjs`, `node scripts/verify-private-module.mjs`, and `node scripts/package-private-module.mjs`; inspect the ZIP member list.
- [ ] **Step 7: Commit in the private repository** with `git commit -m "feat: contribute private Vessel spell list"`.

### Task 7: Compile, migrate, and verify the complete spell track

**Files:**
- Modify: `scripts/vessel/migration.mjs`
- Modify: `scripts/vessel/constants.mjs`
- Test: `tests/vessel-migration.test.mjs`
- Test: `tests/vessel-compiled-pack.test.mjs`

**Interfaces:**
- Consumes: canonical Vessel class and Vessel Magic Items.
- Produces: migration version 5 or the next unused integer.

- [ ] **Step 1: Add failing migration tests** for primary ability, class spellcasting fields, scales, and removal of the owned Vessel Magic use counter while preserving unrelated edits.
- [ ] **Step 2: Implement the next migration version** and update only canonical progression fields.
- [ ] **Step 3: Compile `homebrew-classes` and the public spell-list pack**, then run strict `verifyPack` against each source tree.
- [ ] **Step 4: Run all Vessel tests and public-content verification** with `node --test tests/vessel-*.test.mjs` and `node scripts/verify-public-content.mjs`.
- [ ] **Step 5: Confirm both repository statuses contain only intended files** and commit with `git commit -m "build: compile Vessel spell progression"`.

