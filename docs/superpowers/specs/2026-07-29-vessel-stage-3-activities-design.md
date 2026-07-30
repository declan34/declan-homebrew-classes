# Vessel Stage 3 Activities Design

**Date:** 2026-07-29

**Status:** Approved for implementation

## Goal

Complete the third Vessel automation stage by turning the planned Archon
traits, subclass features, and ten high-value Unsealed Aspects into useful
Foundry-native activities and effects. Preserve Foundry VTT 13 and dnd5e 5.3.3
as the authority for attacks, saves, damage, healing, conditions, activity
consumption, and transformation.

Stage 3 builds on the Stage 2 Archon profiles and lifecycle. It does not replace
the transformation service, implement Stage 4 character progression, or add the
Stage 5 reactive prompt observer.

## Delivery Scope

### Archon and subclass capabilities

- Ascended: Arcane Blast and Astral Step.
- Cataclysm: affinity traits, Bluster, and Cataclysmic Eruption.
- Cursed: Frenzy and Infernal Drain.
- Fallen: Divine Wrath, Divine Ward, and Condemnation.
- Formless: Pseudopods, Sticky Slime, and Drain Vitality.
- Trickster: Juxtapose and Stolen Memory.

### Unsealed Aspects

- Aether Wings.
- Opalescent Armor.
- Perilous Visage.
- Otherworldly Maw.
- Primordial Bulwark.
- Twilight Steps.
- Shimmering Lance.
- Dazzling Lance.
- Sundering Strike.
- Vexing Strike.

## Parallel Delivery Strategy

Development occurs on `feat/vessel-stage-3`, initially based on the latest
clean `feat/vessel-archon` commit. Stage 3 does not modify the active Stage 2
worktree.

Work that depends only on source Items, Actor profiles, pure rule calculations,
and native activity data can proceed immediately. Before final compilation and
review, Stage 3 incorporates the completed Stage 2 branch and resolves its final
hook and migration interfaces. Stage 3 must not duplicate or bypass Stage 2
operations for form detection, Spirit Mantle state, profile selection, reversion,
or cleanup.

No version bump, release archive, merge to `main`, push, or GitHub release is
part of this stage.

## Automation Boundary

### Native documents remain authoritative

Use ordinary dnd5e Items, activities, Active Effects, consumption targets,
templates, damage parts, healing parts, saving throws, and durations wherever
the system supports the rule.

The module must not:

- decide whether an attack hits;
- replace damage, healing, saving throw, or condition resolution;
- move tokens automatically to resolve teleportation, pushes, or position swaps;
- inspect or rewrite private dnd5e workflow objects;
- monkey-patch Foundry or dnd5e methods;
- require Midi-QOL or another automation module;
- silently choose targets, spend resources, or activate optional riders.

### Three automation grades

Every Stage 3 capability uses one of three explicit grades:

1. **Native:** the complete mechanic is represented by supported dnd5e
   activities and effects.
2. **Native with player adjudication:** Foundry rolls the attack, save, damage,
   healing, or applies a visible effect, while movement or a targeting
   restriction remains described for the player and GM.
3. **Lifecycle-coordinated:** a small public-hook coordinator makes a native
   activity available only in the appropriate Mantle or Archon state, prepares
   an unlocked damage choice, or removes a module-owned form effect during
   Stage 2 cleanup. It never resolves the roll itself.

If a rule cannot be represented reliably, use grade 2. A visible, manually
adjudicated activity is preferable to brittle pseudo-automation.

## Content Normalization

The Stage 2 Actor profiles already separate many Archon traits that were
embedded in noisy subclass descriptions. Stage 3 adds activities and effects to
those stable profile Items rather than recreating the traits on the original
Vessel.

Any remaining player-facing subclass mechanic buried inside another feature
description becomes a standalone, stable Item before receiving automation.
Subclass advancements grant such Items at the published level. Existing source
text remains faithful to the class; Stage 3 may correct extraction formatting
but must not invent missing rules, numbers, ranges, or prerequisites.

Stable IDs and identifiers are preserved. New `_id`, `_key`, and
`_stats.lastModifiedBy` values must be exactly 16 alphanumeric characters.

## Archon Capability Design

### Ascended

**Arcane Blast** receives a Dexterity-save activity targeting a point within 60
feet and a 5-foot-radius burst. Its damage uses the Vessel's current Iridescent
Strike die and an unlocked Iridescent Strike damage type. The activity remains
once-per-turn by rule text; Stage 3 does not create a hidden turn ledger.

**Astral Step** receives a utility activity that posts the eligible teleport
distance after a spell is cast. The player moves the token using Foundry's
normal controls. Stage 3 does not observe every spell cast or teleport tokens;
that would be reactive workflow automation outside this stage.

### Cataclysm

Each affinity profile retains its passive native defenses and movement. Traits
that alter resistance, immunity, object damage, rerolls, or movement remain
visible profile Items when dnd5e has no supported exact representation.

**Bluster** receives a visible rider activity/reminder for the 10-foot push.
Foundry does not move the target automatically, and the player or GM adjudicates
size-based distance reduction.

**Cataclysmic Eruption** receives a native Dexterity-save damage activity,
measured area, published range, and `9d6` affinity damage. The allowed damage
type is prepared from the actor's saved Cataclysm affinity. Ordinary dnd5e
half-damage-on-save behavior remains authoritative.

### Cursed

**Frenzy** receives a bonus-free utility activity with a one-round,
module-tagged Active Effect. Supported dnd5e advantage and
grants-advantage fields represent the two sides of the rule. If the installed
system cannot represent the defender-facing half through public fields, the
effect retains that half as explicit chat and sheet guidance.

**Infernal Drain** receives a manually invoked, once-per-turn follow-up
activity. It increases temporary hit points by the Charisma modifier without
exceeding twice the Vessel level. Native healing/temp-HP preparation is used
where it preserves the published increase semantics; any cap coordination is a
small owner-authorized document update performed only after the player invokes
the activity, never inferred from damage.

### Fallen

**Divine Wrath** uses a supported enchantment or native attack variant, selected
after confirming the exact dnd5e 5.3.3 schema. It uses Charisma, deals radiant
damage, and is tagged as an Iridescent Strike. If dnd5e cannot temporarily
enchant an arbitrary weapon without modifying the original Item, the feature
provides a generic native attack activity and leaves the chosen weapon's base
die in Foundry's situational field.

**Divine Ward** receives a bonus-action healing activity targeting one creature
within 30 feet and granting temporary hit points equal to the Vessel's Charisma
modifier for one minute.

**Condemnation** becomes a standalone level-6 subclass Item if it is not already
normalized by the final Stage 2 source. Its activity applies a source-linked,
form-only Condemned marker. The marker explains movement and critical-threshold
rules. Supported critical fields may prepare Divine Wrath, but Stage 3 does not
globally change critical thresholds against unrelated targets. Only one active
module-owned Condemned marker is retained per transformation.

### Formless

**Pseudopods** receives a 10-foot melee Iridescent Strike activity using the
shared Vessel die, Charisma, and unlocked damage types. Grapple and Shove remain
ordinary Foundry actions rather than custom resolution.

**Sticky Slime** receives a Dexterity-save activity that applies a
source-linked Grappled effect on failure, plus an action-based Strength-save
escape activity. Size eligibility is stated clearly and remains player/GM
adjudicated.

**Drain Vitality** receives a Constitution-save acid-damage activity with the
published Vessel-level scaling. A linked follow-up activity handles the
temporary-HP increase after damage is known. Stage 3 does not intercept damage
results to invoke the follow-up automatically.

### Trickster

**Juxtapose** receives a bonus-action Charisma-save activity with a 60-foot
target. On failure or voluntary failure, the player and GM swap the tokens using
normal Foundry controls.

**Stolen Memory** receives an Intelligence-save activity and a one-round,
source-linked marker describing the sensory and targeting restriction. The
module does not hide tokens or override Foundry target selection.

## Unsealed Aspect Design

### State-bound passive Aspects

**Aether Wings** supplies a module-owned effect granting a 60-foot flying speed
and hover while Spirit Mantle is active.

**Opalescent Armor** supplies a Mantle-bound effect for resistance to
bludgeoning, piercing, and slashing damage and a 10-foot speed reduction.
Silvered-weapon bypass is encoded through supported dnd5e bypass fields when
available; otherwise it remains prominent on the effect and chat card.

**Primordial Bulwark** supplies Archon-only resistance to all damage except
force, psychic, and radiant. Its bonus-action Harden activity creates a
module-owned effect lasting until the start of the Vessel's next turn. Damage
reduction uses a supported dnd5e reduction field if one exists; otherwise the
effect displays the Charisma-modifier reduction for Foundry's normal situational
damage controls.

Lifecycle reconciliation enables or disables only effects belonging to these
Aspects. Removing Spirit Mantle, reverting, deleting the source Item, or losing
eligibility removes only the corresponding module-owned effects.

### Active Aspects

**Perilous Visage** receives a Wisdom-save activity for chosen creatures within
60 feet and a one-minute Frightened effect with repeat-at-end-of-turn guidance.
Disadvantage while the target can see the Archon remains stated because line of
sight is not replaced by module code.

**Otherworldly Maw** receives a Charisma-save activity dealing `2d6` necrotic
damage and a linked temporary-HP follow-up capped at twice the Vessel level.

**Twilight Steps** receives a bonus-action activity representing its modified
slot-free *spectral passage*: duration through the end of the current turn and
no concentration. Granting the ordinary spell known belongs to Stage 4
progression; the Aspect's immediately usable activity ships in Stage 3.

**Shimmering Lance** receives a ranged Iridescent Strike spell-attack activity
with range 30/90, Charisma, the shared damage die, and unlocked damage types.

**Dazzling Lance** upgrades play through its own ranged Strike configuration at
100/300 and a separate Vessel-slot-consuming eruption activity. The eruption is
a Dexterity save in a 30-foot area, uses an unlocked Iridescent damage type, and
scales `6d8` at level 10, `7d8` at level 13, and `8d8` at level 17. It uses
ordinary half damage on a successful save.

**Sundering Strike** receives a Charisma-save rider activity and a one-round
source-linked marker that records the concentration and spellcasting
restriction. Stage 3 does not monkey-patch spell usage to enforce the marker.

**Vexing Strike** receives a source-linked one-round marker after a melee
Iridescent Strike. The marker explains disadvantage against targets other than
the Vessel and Charmed-immunity exclusion. It does not rewrite another actor's
attack workflow.

## Shared Rules and Lifecycle Integration

Pure helpers prepare:

- Vessel level and level-scaled formulas;
- the active Archon profile and Cataclysm affinity;
- unlocked Iridescent Strike damage types;
- Mantle and Archon eligibility;
- form-only and Mantle-only effect roles;
- temporary-HP caps;
- Dazzling Lance and Drain Vitality scaling.

Activities and effects carry stable module flags identifying their feature and
role. Stage 2 lifecycle cleanup recognizes the shared form-only role and removes
only module-owned temporary effects. Stage 3 must not make Stage 2 depend on
specific Stage 3 Item IDs.

The hook layer routes only module-tagged activities. It may prepare a choice or
validate state before native use, but it cannot roll, consume a resource, or
apply damage itself. Invalid state produces a clear warning and leaves the
actor unchanged.

## Owned-Item Migration

Compendium replacement does not update Items already owned by actors. After the
final Stage 2 migration lands, Stage 3 increments the Vessel migration version
and repairs owned Stage 3 Items by stable ID or identifier.

Migration:

- merges module-owned activities, effects, mechanical flags, and fixed formulas;
- preserves custom names, images, descriptions or notes, sort order, activity
  use state, unrelated activities/effects, and foreign flags;
- updates Actor-profile trait Items in the source compendium rather than
  rewriting arbitrary transformed actors;
- remains idempotent and records completion only after every required update
  succeeds;
- continues to perform all earlier Stage 1 and Stage 2 repairs.

## Error Handling

- Missing source Items, profile traits, or compendium documents produce a
  user-facing warning and no partial activity use.
- An unavailable Archon or Mantle state blocks only state-bound capabilities.
- Missing public dnd5e fields degrade the affected mechanic to visible player
  adjudication rather than failing module initialization.
- Failed effect creation leaves unrelated effects untouched.
- Repeated state reconciliation does not duplicate effects.
- Only an owner-authorized responsible client mutates actor state.
- Third-party automation incompatibility degrades to the manually usable native
  activity.

## Testing and Verification

### Source and schema tests

- Inventory every planned Stage 3 capability and Aspect.
- Verify stable IDs, activity roles, activation, target, range, formulas,
  effects, durations, consumption, and lifecycle tags.
- Verify source descriptions and numbers against the existing class content.
- Assert that every form-only effect is module-owned and cleanup-safe.

### Unit tests

- Test scaling at boundary levels.
- Test Mantle and Archon eligibility.
- Test Cataclysm affinity and Iridescent damage choices.
- Test temporary-HP cap calculations.
- Test effect reconciliation, deduplication, and cleanup.
- Test migration preservation, retries, and idempotency.

### Hook tests

- Tagged Stage 3 activities route through public hooks.
- Unrelated activities are unaffected.
- Invalid state cancels before native consumption.
- Native workflows remain responsible for rolls and resources.
- Only the responsible owner receives a state-changing operation.

### Pack and regression verification

- Compile and compare `archon-src`, `aspects-src`, and any changed class sources
  with their LevelDB packs.
- Run `verifyPack` for every changed pack and require `ok: true` with zero
  errors.
- Remove all LevelDB `LOCK` files.
- Run the complete Node test suite.
- Run source validators, `git diff --check`, and a full branch diff review.
- Confirm no release metadata was changed.

## Completion Criteria

Stage 3 is complete when:

- all listed Archon/subclass capabilities and ten Aspects have useful native
  activities or explicit native-with-adjudication controls;
- state-bound mechanics are available only in the correct Mantle or Archon
  state;
- Stage 2 transformation and cleanup remain authoritative;
- existing owned Items migrate without losing player customization;
- all changed packs validate with zero errors;
- the complete test suite passes;
- the branch receives a final code review with no unresolved actionable
  findings.

