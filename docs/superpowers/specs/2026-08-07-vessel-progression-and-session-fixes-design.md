# Vessel Progression and Session Fixes Design

**Date:** 2026-08-07
**Status:** Approved
**Applies to:** `declan-homebrew-classes` and `declan-private-spells`

## Goal

Complete Vessel progression and repair the issues observed in live Foundry VTT
14 play while preserving dnd5e's own spell, effect, attack, damage, and roll
workflows.

## Constraints

- Foundry VTT 14 and dnd5e 5.3.3 are the supported validation target.
- The public repository may contain only authorized homebrew and SRD 5.1 or
  SRD 5.2.1 content.
- Commercial spell documents remain exclusively in the private companion.
- Native dnd5e Items, Active Effects, spell-list pages, and rolls remain the
  source of truth. Scripts supply prompts, dynamic source resolution, and
  reversible lifecycle state only where native data is insufficient.
- Existing actors must be migrated in place; rebuilding an actor is not an
  acceptable installation step.
- Every affected compiled pack must pass strict `verifyPack` with zero errors.
- A release, push, or publication requires separate explicit approval.

## Vessel Class and Spellcasting

The Vessel class keeps the custom `vessel` single-level spellcasting method and
its existing short-rest slot table. Its class data identifies Charisma as both
the spellcasting ability and the primary ability. Vessel Magic is explanatory
class text, not a separate resource, and therefore has no Item-use counter.

The class exposes native scale values for cantrips known, spells known, spell
slot count, and slot level. These reproduce the published level table and make
the progression visible in class summaries and formulas without replacing
dnd5e's spellbook.

Slot-consuming Archon activities resolve the actual prepared Vessel spell pool
at use time. Resolution considers the class progression, registered
spellcasting model, model-provided slot key, and actor pool metadata. A failure
reports the candidate keys and available pools without exposing unrelated actor
data. Consumption continues through the activity's native attribute target.

## Native Vessel Spell List

Each module contributes a dnd5e Spell List journal page registered through its
manifest under the identifier `vessel` and type `class`.

- The public page contains only authorized Vessel-list spell profiles and links
  to the public homebrew or dnd5e SRD Items.
- The private page contains the Vessel-list spells available from the private
  Tasha's and Xanathar's imports.
- A deterministic builder normalizes Unicode, whitespace, and case, then emits
  one profile per normalized name. Duplicate names fail validation rather than
  being silently selected.
- Both pages are available to the dnd5e Compendium Browser, producing a native
  Vessel class filter without copying spell documents between repositories.

## Sealed Magic Progression

A public, content-light manifest describes each fixed subclass spell using a
stable key, display name, subclass identifier, Vessel grant level, and optional
Cataclysm affinity. It contains no commercial rules text.

The progression reconciler runs for an owned Vessel after actor creation,
subclass or level changes, actor-sheet opening, world ready, and private-provider
changes. For every eligible manifest entry it uses the existing resolver order:

1. public Vessel homebrew spells;
2. the configured private Item compendium;
3. dnd5e system Item packs.

Resolved spells are copied with Foundry's normal embedded Item API and tagged
with stable key, source UUID, provider, subclass, and grant level. Reconciliation
is idempotent by stable key and normalized owned spell name. It never creates a
second same-name spell, deletes a manually owned spell, or modifies a provider
document. One unresolved entry does not block other grants. Actionable warnings
are deduplicated per reconciliation pass and shown to the responsible owner/GM.

Cataclysm entries are filtered by the actor's stored Elemental Affinity. Changing
affinity does not silently delete spells already owned; it warns the GM when a
previously granted affinity spell needs manual review.

## Dire Stature

When an actor owning Dire Stature begins an Archon transformation, the existing
asynchronous preflight asks whether to grow. The free-use and spell-slot
activities remain separate native activities, so the selected payment and its
normal dnd5e consumption are not reimplemented.

- Dire Stature offers normal size or one category of growth.
- Colossal Archon additionally permits two categories of growth.
- Growth is capped at Huge and requires the player to confirm that the scene has
  room.
- The actor size and every active token's width and height are updated.
- A tagged, Archon-bound Active Effect adds +1 AC and 1d4 damage to melee weapon
  and melee spell attacks per category above Medium.
- Module-controlled melee Archon activities receive the corresponding reach.
  Other owned or third-party activities are not rewritten; the prompt and
  effect description state the current reach increase.

The chosen growth and all original size/token geometry are persisted in the
Archon state snapshot. Reversion, failed activation, and cleanup retry restore
them exactly.

## Passive Aspects

### Striking Presence

Each owned copy stores its own chosen skill: Deception, Intimidation, or
Persuasion. A configuration prompt appears when a choice is missing and a
Configure activity permits correction. A permanent transfer effect upgrades
that skill to proficiency. A separate tagged Mantle-bound effect grants
advantage only while Spirit Mantle is active. Multiple owned copies remain
independent so Malignant Aura can grant a different second skill.

### Uncanny Strength

A permanent transfer effect upgrades Athletics to proficiency. While Spirit
Mantle is active, a narrow dnd5e skill-roll preparation hook changes Athletics'
ability to Charisma. The system still performs and displays the ordinary native
skill roll. All other Athletics rolls and all rolls while uncloaked remain
Strength-based.

## Archon Reversion Integrity

Snapshots use raw serializable Actor and Token source values, never prepared
`Set` objects. They include portrait, prototype token art, active token art and
geometry, movement, senses, skills, traits including languages, and temporary
HP before transformation.

Reversion restores the exact pre-transform temporary HP value. This removes all
temporary HP gained in Archon Form while preserving temporary HP that existed
before transformation. Tests must include JSON round trips to model persistence
through Foundry flags rather than relying only on in-memory structured clones.

## Content Repair and Migration

The current canonical Malignant Aura source is clean. Hellfire incorrectly
contains the Cursed Archon block and later subclass text and is shortened to its
published feature text. A new Vessel migration version synchronizes the
canonical descriptions of both items on existing actors, repairs the Vessel
class primary ability and spellcasting data, removes the Vessel Magic use
counter, installs new Aspect effects/activities, and preserves user-authored
fields outside the owned canonical automation surface.

## Error Handling and Verification

- Every prompt is owner-gated and serialized through the existing actor
  operation queue.
- Canceling a growth or skill-choice prompt performs no mutation or consumption.
- Failed spell resolution never creates placeholders.
- Failed Archon activation performs rollback using the same persisted snapshot.
- Unit tests cover every resolver state and lifecycle branch.
- Source/compiled parity tests include the class, repaired features, aspects,
  and spell-list packs.
- Both repositories finish clean, with public-content checks and strict pack
  verification passing before any release decision.

