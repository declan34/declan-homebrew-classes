# Vessel Iridescent Strikes Feature Split Design

**Date:** 2026-08-02

## Goal

Make Iridescent Strikes a distinct level-1 Vessel class feature so using its
attack does not post Spirit Mantle's unrelated rules to chat. Preserve the
existing Foundry-native attack, scaling, damage-type, Spirit Mantle, and Archon
automation.

## User Experience

A Vessel owns two separate level-1 features:

- **Spirit Mantle** contains the Cloak or Dismiss activity and the inactive
  Ethereal Armor effect template.
- **Iridescent Strikes** contains the concise Iridescent Strikes rules and one
  **Iridescent Strike** attack activity.

The single strike activity uses a flexible special activation. It represents
the same attack whether the rules permit it as part of the Attack action, as a
bonus action, or through another Vessel feature. The player does not need
separate action and bonus-action buttons.

Using the strike posts only the Iridescent Strikes feature text and attack
details. Toggling Spirit Mantle continues to post only from Spirit Mantle.

## Content Structure

Create one stable `feat` Item in `src/vessel/class-features/` with:

- a stable 16-character Item ID and `iridescent-strikes` identifier;
- the Iridescent Strikes portion of the published Spirit Mantle rules;
- one native dnd5e Attack activity;
- the existing `iridescent-strike` module automation role;
- Charisma as its attack ability;
- unarmed melee classification;
- `@scale.vessel.iridescent-strike + @mod` damage;
- radiant as its canonical initial damage type; and
- no independent uses or resource consumption.

Spirit Mantle keeps its stable Item ID and identifier. Its canonical source
retains the Spirit Mantle activation, appearance, Ethereal Armor, and related
non-strike rules. It contains only the Cloak or Dismiss activity and Ethereal
Armor effect template; both Strike activities are removed.

The Vessel class's level-1 ItemGrant grants both stable Items. The existing
Iridescent Strike ScaleValue remains on the Vessel class Item so every feature
that references `@scale.vessel.iridescent-strike` continues to work.

## Automation

No parallel combat or damage system is introduced. The new attack remains a
native dnd5e Attack activity and continues through Foundry's normal attack and
damage workflow.

The existing pre-use hook routes by the immutable `iridescent-strike` role, not
by parent Item identity. It therefore continues to:

- require an active Spirit Mantle;
- offer to activate Spirit Mantle when inactive;
- retry the actor-owned activity after activation;
- populate only damage types unlocked for the Vessel; and
- persist stale owned activity damage types before a native retry.

Spirit Mantle toggling, Ethereal Armor, Archon Form activation and reversion,
and Stage 3 attacks remain unchanged.

## Existing-Actor Migration

Increment the Vessel migration version. The migration loads the canonical
Vessel, Spirit Mantle, Iridescent Strikes, Archon Form, and subclass-control
Items from the Homebrew Classes compendium.

For an existing Vessel actor, migration:

1. creates the Iridescent Strikes Item from its canonical source if it is
   missing, preserving its stable ID;
2. repairs the module-owned Strike activity on that Item when it already
   exists;
3. removes only activities with the module-owned `iridescent-strike` role from
   Spirit Mantle;
4. repairs Spirit Mantle's module-owned toggle and Ethereal Armor mechanics;
5. preserves unrelated and custom activities, item presentation, effect state,
   and other player data; and
6. writes the new migration version only after all required operations succeed.

The migration does not transfer spent resources because Iridescent Strike has
no uses. Existing Spirit Mantle active state and the actor's active armor effect
remain intact.

If creation or repair fails, the migration flag remains unchanged so the next
reconciliation can retry safely. Re-running a successful migration is
idempotent and does not create duplicate Items.

## Testing and Validation

Tests will establish that:

- the Vessel grants both level-1 Items;
- Spirit Mantle contains exactly one module-owned toggle and no Strike;
- Iridescent Strikes contains exactly one correctly configured native attack;
- attack automation works when the activity belongs to the new Item;
- inactive Mantle prompting and native retry still use the owned Strike;
- migration creates or repairs the new Item, removes only legacy module-owned
  Strikes from Spirit Mantle, preserves custom data, retries after partial
  failure, and remains idempotent;
- the compiled Homebrew Classes pack matches both canonical sources; and
- the complete test suite and strict Homebrew Classes pack verification pass.

The affected source pack is recompiled before compiled-pack parity tests. Any
empty generated LevelDB `LOCK` file is removed before committing.

## Release Scope

Implementation, version bump, push, and release are separate operations. No
version is selected and no release is published without explicit approval.
