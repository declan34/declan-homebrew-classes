# Vessel Archon Form Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` to implement this plan task-by-task.
> Check off each step only after its named verification passes.

**Goal:** Make Archon Form a Foundry-native transformation with the correct
subclass profile, Vessel resource choices, Spirit Mantle integration, duration,
extension, and safe reversion prompts.

**Architecture:** A new Actor compendium contains the nine Archon profiles. The
owned Archon Form Item exposes native dnd5e Transform activities for the free-use
and Vessel-slot paths plus Utility activities for extension and reversion. Focused
Vessel services select and validate the profile, prepare dnd5e transformation
settings, record lifecycle state, consume Vessel slots, reconcile Spirit Mantle,
and prompt at rule boundaries. Foundry's `Actor#transformInto`,
`Actor#revertOriginalForm`, activity cards, actor preparation, rolls, saves,
damage, spellcasting, and token replacement remain authoritative.

**Tech Stack:** Foundry VTT 13, dnd5e 5.3.3, ECMAScript modules, dnd5e YAML
compendium sources, Node.js built-in test runner, `js-yaml`,
`@foundryvtt/foundryvtt-cli`

## Global Constraints

- Work only in the `feat/vessel-archon` worktree. Do not edit Warlord files or
  the separate Warlord worktree.
- Preserve native dnd5e transform, revert, activity, rest, spell, damage, save,
  healing, actor-preparation, and token workflows.
- Do not require Midi-QOL or monkey-patch dnd5e classes or methods.
- Treat the module's lifecycle flags as advisory state around native transformed
  actors, never as a replacement actor engine.
- Preserve original ability scores, hit points, class/race features, Vessel
  spells, and merge save/skill proficiencies. Let the form provide type,
  movement, senses, resistances, immunities, languages, and form traits.
- Use supported dnd5e transformation equipment settings and an actor flag for
  the player's default; do not manipulate inventory documents manually.
- Prompts must be owner-only, deduplicated, and must never replace an actor while
  another activity workflow is resolving.
- Missing profile UUIDs, source actors, permissions, or Vessel slots fail with a
  clear notification before a module-managed resource is consumed.
- Every `_id`, `_key`, and `_stats.lastModifiedBy` is exactly 16 alphanumeric
  characters.
- Run `verifyPack` for every changed or new pack; it must report zero errors.
- Do not bump the module version, build a release archive, push, or publish
  without a new explicit user request.
- Never add a `Co-Authored-By` trailer.

## Task 1: Source and compile the nine Archon Actor profiles

**Files:**
- Create: `archon-src/_folder.yml`
- Create: `archon-src/ascended-archon.yml`
- Create: `archon-src/cataclysm-air-archon.yml`
- Create: `archon-src/cataclysm-earth-archon.yml`
- Create: `archon-src/cataclysm-fire-archon.yml`
- Create: `archon-src/cataclysm-water-archon.yml`
- Create: `archon-src/cursed-archon.yml`
- Create: `archon-src/fallen-archon.yml`
- Create: `archon-src/formless-archon.yml`
- Create: `archon-src/trickster-archon.yml`
- Modify: `module.json`
- Create: `tests/vessel-archon-profiles.test.mjs`
- Create: `tests/vessel-archon-compiled-pack.test.mjs`

- [ ] Write failing source tests that inventory exactly nine stable Actor IDs and
  verify each form's authoritative size, type, movement, senses, resistances,
  immunities, languages, skill proficiencies, AC bonus flag, and trait Items
  against the existing Vessel subclass text.
- [ ] Add the nine `character` Actor YAML documents. Keep abilities and HP
  neutral because transform settings retain the Vessel's values. Encode only
  published profile facts; never invent missing speeds, senses, or defenses.
- [ ] Store profile metadata under
  `flags.declan-homebrew-classes.vessel.archon`, including stable `profile`,
  `subclass`, optional `affinity`, and numeric `acBonus`.
- [ ] Add the `vessel-archon-forms` Actor pack to `module.json` with player
  observer ownership.
- [ ] Compile `archon-src` to `packs/vessel-archon-forms`, remove any `LOCK`,
  and add a copied-LevelDB parity test that compares all nine compiled profiles
  with YAML source.
- [ ] Run:
  `node --test tests/vessel-archon-profiles.test.mjs tests/vessel-archon-compiled-pack.test.mjs`.

## Task 2: Add subclass control Items, native activities, and pure selection rules

**Files:**
- Modify: `src/vessel/class-features/archon-form.yml`
- Create: `src/vessel/subclass-features/the-ascended/archon-form-control.yml`
- Create: `src/vessel/subclass-features/the-cataclysm/archon-form-control.yml`
- Create: `src/vessel/subclass-features/the-cursed/archon-form-control.yml`
- Create: `src/vessel/subclass-features/the-fallen/archon-form-control.yml`
- Create: `src/vessel/subclass-features/the-formless/archon-form-control.yml`
- Create: `src/vessel/subclass-features/the-trickster/archon-form-control.yml`
- Modify: `src/vessel/the-ascended.yml`
- Modify: `src/vessel/the-cataclysm.yml`
- Modify: `src/vessel/the-cursed.yml`
- Modify: `src/vessel/the-fallen.yml`
- Modify: `src/vessel/the-formless.yml`
- Modify: `src/vessel/the-trickster.yml`
- Modify: `scripts/vessel/constants.mjs`
- Modify: `scripts/vessel/rules.mjs`
- Create: `tests/vessel-archon-content.test.mjs`
- Modify: `tests/vessel-rules.test.mjs`

- [ ] Write failing tests for six dedicated subclass control Items. Each subclass
  level-3 advancement grants its control Item. Each control has four roles: free
  Transform, slot Transform, Extend, and Revert. The five ordinary controls
  reference one direct profile; Cataclysm references four affinity profiles.
- [ ] Keep the generic class Archon Form Item as the one-use/rest rules feature
  and source of free uses. Its control metadata links subclass controls back to
  this stable owned Item rather than duplicating or moving the resource.
- [ ] Configure the free Transform activity with an `itemUses` target. Its
  target is filled at pre-use time with the owned generic Archon Form Item ID,
  allowing dnd5e's normal consumption and chat-card refund workflow to own the
  resource. Configure the slot Transform with native attribute consumption at
  `spells.vessel.value`.
- [ ] Configure Extend and Revert as self-targeted Utility activities with no
  native consumption targets.
- [ ] Add pure functions for profile inventory lookup, subclass detection,
  Cataclysm affinity selection, 10-minute versus one-hour duration, Archon AC
  bonus, early-end rules, and transform settings.
- [ ] Ensure the settings retain physical and mental abilities, HP, class,
  features, spells, biography, and gear proficiencies; merge saves and skills;
  exclude retained temp HP; and use
  `2 * @classes.vessel.levels` as the transform temp-HP formula.
- [ ] Run:
  `node --test tests/vessel-archon-content.test.mjs tests/vessel-rules.test.mjs`.

## Task 3: Implement profile routing and resource preflight

**Files:**
- Create: `scripts/vessel/archon-profiles.mjs`
- Create: `tests/vessel-archon-profile-routing.test.mjs`

- [ ] Write failing tests for the six subclasses, four Cataclysm affinities,
  saved-affinity defaulting, explicit profile choices, missing pack documents,
  owner/permission failure, and invalid cross-subclass selection.
- [ ] Resolve pack Actors lazily through public compendium APIs and cache only
  stable source Actor documents, not transformed owned actors.
- [ ] Preflight the owned Archon Form feature and `system.spells.vessel.value`,
  then inject the correct dynamic consumption target into the activity source
  before dnd5e prepares consumption. Free Transform must never touch slots and
  slot Transform/Extend must never touch the feature use.
- [ ] Treat dnd5e's activity chat-card Refund action as the safe recovery path
  when a player creates a Transform card but never completes its later native
  Transform button. Do not build a competing resource ledger.
- [ ] Run: `node --test tests/vessel-archon-profile-routing.test.mjs`.

## Task 4: Implement lifecycle state, transform preparation, and native reversion

**Files:**
- Create: `scripts/vessel/archon-lifecycle.mjs`
- Modify: `scripts/vessel/mantle.mjs`
- Modify: `scripts/vessel/rules.mjs`
- Create: `tests/vessel-archon-lifecycle.test.mjs`
- Modify: `tests/vessel-mantle.test.mjs`

- [ ] Write failing tests for start time, expiry, source actor UUID, selected
  profile, free/slot payment, active status, form-only effect tagging, and
  idempotent cleanup.
- [ ] Prepare native Transform usage by filtering the activity's offered
  profiles to the actor's subclass and affinity, applying the shared
  transformation settings, and validating permission/source/profile before the
  native activity consumes anything.
- [ ] On successful native transformation, mark the resulting actor with
  lifecycle state, activate Spirit Mantle, apply the profile's AC bonus to the
  module-owned Ethereal Armor minimum, and confirm form temp HP is twice Vessel
  level without reducing a higher unrelated temp-HP value.
- [ ] Preserve both the original actor's languages and the profile languages via
  module-owned transform preparation because dnd5e has no native language merge.
- [ ] Revert only through `Actor#revertOriginalForm`; afterward clear form temp
  HP, remove only module-tagged form effects/state, and reconcile Spirit Mantle
  on the restored actor without touching unrelated effects.
- [ ] Extend expiry by exactly 600 seconds only after dnd5e successfully
  consumes the Extend activity's Vessel-slot attribute target.
- [ ] Handle linked and unlinked token actors using public dnd5e transform/revert
  hooks plus normal create/update hooks where the native hook surface differs.
- [ ] Run:
  `node --test tests/vessel-archon-lifecycle.test.mjs tests/vessel-mantle.test.mjs`.

## Task 5: Wire activity routing and safe rule-boundary prompts

**Files:**
- Modify: `scripts/vessel/hooks.mjs`
- Modify: `scripts/vessel-automation.mjs`
- Create: `tests/vessel-archon-hooks.test.mjs`
- Modify: `tests/vessel-automation-hooks.test.mjs`

- [ ] Write failing tests for pre-use filtering/validation, free-use gating,
  slot fallback, Extend, Revert, successful transform finalization, error
  reporting, and no effect on unrelated activities.
- [ ] Route only module-tagged Archon roles. The native Transform activities
  still create their normal chat cards and invoke native transform buttons.
- [ ] Deduplicate owner prompts for expiry, HP 0, and pre-level-7 Unconscious.
  Queue prompts to a microtask and wait for confirmation before invoking native
  revert.
- [ ] At level 7+, use one-hour duration and do not prompt for Unconscious; at
  every level prompt for HP 0. Expiry offers Extend with a Vessel slot or Revert
  and shows active profile plus remaining duration.
- [ ] After level-11 successful transformation, offer a non-blocking reminder to
  use an eligible Sealed Magic spell for free; do not intercept or recreate the
  spell activity.
- [ ] Register only public Foundry/dnd5e hooks and elect one responsible client
  for world-time/actor state prompts to avoid duplicates.
- [ ] Run:
  `node --test tests/vessel-archon-hooks.test.mjs tests/vessel-automation-hooks.test.mjs`.

## Task 6: Migrate existing owned Archon Form Items

**Files:**
- Modify: `scripts/vessel/constants.mjs`
- Modify: `scripts/vessel/migration.mjs`
- Modify: `tests/vessel-migration.test.mjs`

- [ ] Raise the Vessel migration version to 2 and write failing tests for an
  activity-less legacy Archon Form Item, partially migrated Items, custom names
  and images, unrelated activities/flags, idempotency, and failure not recording
  the version.
- [ ] Load canonical Archon Form alongside Vessel and Spirit Mantle and merge the
  four module activities by stable IDs/roles.
- [ ] Repair mechanics, profiles, settings, consumption, and module flags while
  preserving user presentation, unrelated activities, and foreign flags.
- [ ] Ensure migration still completes Stage 1 repairs and records version 2
  only after every required owned Item update succeeds.
- [ ] Run: `node --test tests/vessel-migration.test.mjs`.

## Task 7: Compile, verify, document, and review the complete feature

**Files:**
- Modify: `tests/vessel-compiled-pack.test.mjs`
- Modify: `README.md`
- Modify generated: `packs/homebrew-classes/**`
- Modify generated: `packs/vessel-archon-forms/**`

- [ ] Extend compiled-pack parity to cover the four Archon Form activities and
  shared transform settings.
- [ ] Document the Archon controls, profile selection, duration/reversion
  reminders, native workflow boundary, equipment-policy behavior, and the fact
  that Stage 3 form attacks/traits remain normal descriptive Items unless they
  already have native activities.
- [ ] Compile `src` to `packs/homebrew-classes` and `archon-src` to
  `packs/vessel-archon-forms`; remove `LOCK` files.
- [ ] Run `verifyPack` on `src` as `homebrew-classes` and on `archon-src` as
  `vessel-archon-forms`; require `ok: true` and zero errors for both.
- [ ] Run the complete test suite with `node --test tests/*.test.mjs`.
- [ ] Inspect `git diff --check`, `git status --short`, and the complete diff.
  Confirm that no Warlord source, scripts, tests, or pack was changed.
- [ ] Request a final code review and resolve every actionable issue. Do not
  release from this task.
