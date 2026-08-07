# Vessel Passive Aspects and Content Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate Striking Presence and Uncanny Strength faithfully, repair corrupted Cursed feature text, and migrate existing actors safely.

**Architecture:** Permanent proficiency comes from owned Aspect transfer effects. Mantle-only benefits are reconciled from the existing Spirit Mantle flag; a narrow pre-skill-roll hook substitutes Charisma for Athletics without replacing dnd5e's roll workflow. Canonical content migrations target only module-owned fields.

**Tech Stack:** Foundry VTT 14, dnd5e 5.3.3, JavaScript ES modules, YAML Items and Active Effects, Node test runner.

## Global Constraints

- Striking Presence proficiency is always active; advantage is Mantle-only.
- Uncanny Strength Athletics proficiency is always active; Charisma substitution is Mantle-only.
- Multiple Striking Presence copies keep independent choices.
- Preserve dnd5e's native skill roll and damage workflows.
- Do not push or release without separate explicit approval.

---

### Task 1: Add per-copy Striking Presence configuration

**Files:**
- Modify: `aspects-src/striking-presence.yml`
- Create: `scripts/vessel/striking-presence.mjs`
- Modify: `scripts/vessel/constants.mjs`
- Modify: `scripts/vessel/hooks.mjs`
- Create: `tests/vessel-striking-presence.test.mjs`

**Interfaces:**
- Produces: `configureStrikingPresence(item, dependencies?)`, item flag `vessel.strikingPresence.skill`, and stable configure activity role.

- [ ] **Step 1: Add failing tests** for first-time choice, cancel/no mutation, reconfiguration, invalid stored skills, non-owner protection, and two copies with different choices.
- [ ] **Step 2: Add one Configure utility activity** to the Aspect and route its pre-use hook to `DialogV2.wait` choices `dec`, `itm`, and `per`.
- [ ] **Step 3: Store the selected skill on the owned Item**, not the actor, so duplicate copies remain independent.
- [ ] **Step 4: Queue configuration once when an owned copy is detected without a valid choice**, while allowing normal actor opening to continue.
- [ ] **Step 5: Run** `node --test tests/vessel-striking-presence.test.mjs` and commit with `git commit -m "feat: configure Striking Presence skills"`.

### Task 2: Reconcile Striking Presence effects

**Files:**
- Modify: `scripts/vessel/striking-presence.mjs`
- Modify: `scripts/vessel/hooks.mjs`
- Modify: `tests/vessel-striking-presence.test.mjs`

**Interfaces:**
- Produces: `reconcileStrikingPresence(actor)` and effects keyed by owned source Item ID.
- Consumes: `isSpiritMantleActive(actor)`.

- [ ] **Step 1: Add failing tests** proving proficiency exists uncloaked, advantage does not; cloaking adds advantage; uncloaking removes only advantage; and two copies do not collapse.
- [ ] **Step 2: Build a permanent proficiency change** using `system.skills.<skill>.value`, Upgrade mode, value `1`.
- [ ] **Step 3: Build a tagged actor effect while cloaked** using `system.skills.<skill>.roll.mode`, Add mode, value `1`, with source Item UUID and ID flags.
- [ ] **Step 4: Reconcile on item/flag changes through the shared actor serializer** and delete only exact module-tagged effects.
- [ ] **Step 5: Run the focused tests** and commit with `git commit -m "feat: automate Striking Presence"`.

### Task 3: Automate Uncanny Strength without replacing rolls

**Files:**
- Modify: `aspects-src/uncanny-strength.yml`
- Create: `scripts/vessel/uncanny-strength.mjs`
- Modify: `scripts/vessel/hooks.mjs`
- Create: `tests/vessel-uncanny-strength.test.mjs`

**Interfaces:**
- Produces: `prepareUncannyAthleticsRoll(config, actor, skillId) -> boolean` and a permanent Athletics proficiency effect.

- [ ] **Step 1: Add failing tests** for permanent Athletics proficiency, unchanged uncloaked rolls, Charisma-cloaked Athletics, non-Athletics skills, and actors without the Aspect.
- [ ] **Step 2: Add a transfer effect** upgrading `system.skills.ath.value` to `1`.
- [ ] **Step 3: Register the dnd5e pre-skill-roll hook** and, only for owned cloaked Uncanny Strength Athletics checks, set the supported roll configuration ability to `cha`.
- [ ] **Step 4: Do not call the roll method or alter the result**; return control to dnd5e for its native dialog/chat workflow.
- [ ] **Step 5: Run** `node --test tests/vessel-uncanny-strength.test.mjs` and commit with `git commit -m "feat: automate Uncanny Strength"`.

### Task 4: Repair Cursed feature descriptions

**Files:**
- Modify: `src/vessel/subclass-features/the-cursed/hellfire.yml`
- Verify: `src/vessel/subclass-features/the-cursed/malignant-aura.yml`
- Create: `tests/vessel-cursed-content.test.mjs`

**Interfaces:**
- Produces: canonical published descriptions for identifiers `hellfire` and `malignant-aura`.

- [ ] **Step 1: Add failing assertions** that Hellfire contains only its 6th-level feature text and neither item contains `Cursed Archon`, `Dark Sacrifice`, `Lord of Darkness`, or `The Fallen` contamination.
- [ ] **Step 2: Replace Hellfire's description** with the exact published paragraph already visible before the corrupted stat-block tail; leave clean Malignant Aura text unchanged.
- [ ] **Step 3: Review both descriptions against the source PDF** without importing unrelated page text.
- [ ] **Step 4: Run** `node --test tests/vessel-cursed-content.test.mjs` and commit with `git commit -m "fix: repair Cursed feature descriptions"`.

### Task 5: Migrate existing actor Items

**Files:**
- Modify: `scripts/vessel/migration.mjs`
- Modify: `scripts/vessel/constants.mjs`
- Modify: `tests/vessel-migration.test.mjs`

**Interfaces:**
- Produces: the next unused Vessel migration version and canonical source loading for the two Aspects plus two Cursed features.

- [ ] **Step 1: Add failing migration tests** for corrupted owned Malignant Aura/Hellfire text, missing Aspect effects/activities, two Striking Presence copies, and unrelated custom Item fields.
- [ ] **Step 2: Load canonical source Items once** from the class/aspect packs and synchronize only description, module flags, owned activities, and module-tagged effects.
- [ ] **Step 3: Preserve per-copy Striking Presence choice flags** and all unrelated user effects/fields.
- [ ] **Step 4: Run** `node --test tests/vessel-migration.test.mjs tests/vessel-striking-presence.test.mjs tests/vessel-uncanny-strength.test.mjs`.
- [ ] **Step 5: Commit** with `git commit -m "fix: migrate Vessel passive aspects"`.

### Task 6: Compile and verify the passive/content track

**Files:**
- Modify generated pack: `packs/homebrew-classes/`
- Modify generated pack: `packs/vessel-aspects/`
- Modify: `tests/vessel-compiled-pack.test.mjs`

**Interfaces:**
- Produces: compiled parity for canonical descriptions, activities, flags, and effects.

- [ ] **Step 1: Extend compiled-pack assertions** to cover Hellfire, Malignant Aura, Striking Presence, and Uncanny Strength.
- [ ] **Step 2: Compile both packs** with `@foundryvtt/foundryvtt-cli`, then remove empty `LOCK` files.
- [ ] **Step 3: Run strict `verifyPack`** for `src`/`homebrew-classes` and `aspects-src`/`vessel-aspects`; require `ok:true` and zero errors.
- [ ] **Step 4: Run all Vessel tests** with `node --test tests/vessel-*.test.mjs`.
- [ ] **Step 5: Inspect `git diff --check` and repository status**, then commit with `git commit -m "build: compile Vessel passive fixes"`.

