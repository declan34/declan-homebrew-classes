# Vessel Automation Design

**Date:** 2026-07-28

**Target:** Foundry VTT dnd5e 5.3.3

**Module:** Declan's Homebrew Classes

## Purpose

Make the Vessel class feel native and pleasant to play in Foundry without replacing
or bypassing dnd5e's rules engine. The module should automate bookkeeping and present
timely choices, while Foundry remains responsible for attacks, damage, saving throws,
healing, resource consumption, effects, and actor transformation.

The guiding rule is:

> Use native dnd5e documents and workflows whenever they can express the rule. Add
> custom module code only to coordinate state, calculate Vessel-specific values, or
> prompt the player at the appropriate moment.

## Confirmed Product Decisions

- Use a hybrid implementation: native activities and Active Effects backed by a
  small Vessel-specific JavaScript layer.
- Prompt the player before spending resources, applying optional riders, or using a
  reaction.
- Do not rewrite, replace, or patch Foundry's damage-resolution system.
- Do not silently alter a completed combat result.
- Do not require Midi-QOL or another automation module.
- Preserve compatibility with an otherwise unmodified dnd5e 5.3.3 game.
- Treat other automation modules as optional peers. Vessel automation must fail
  safely when their workflows differ.
- Build the system in independently testable stages rather than delivering one large
  automation script.

## Scope and Delivery Stages

The complete vision contains several related subsystems. Each stage receives its own
implementation plan and verification before the next begins.

1. **Core Vessel combat:** Spirit Mantle state and Iridescent Strike activities.
2. **Archon lifecycle:** form selection, transformation, duration, extension,
   reversion, and cleanup.
3. **Archon and Aspect actions:** native activities and effects for form traits,
   subclass abilities, and Unsealed Aspects.
4. **Character progression:** Sealed Magic grants, affinities, bonus Aspects, and
   correct resource formulas.
5. **Optional reactive prompts:** Dire Preservation, Primeval Will, Iridescent
   Shield, Primeval Thirst, Fey Retribution, and Consume Strike.

The first implementation plan must cover only stage 1. Later stages build on its
public state API but must not require stage 1 internals to be rewritten.

Before stage 3 or 4, the imported subclass content must be normalized. Several
later-level subclass features and Archon stat blocks are currently embedded in
earlier feature descriptions instead of existing as separate items and
advancements.

## Architectural Boundaries

### Native dnd5e documents

Items, activities, Active Effects, advancements, consumption targets, measured
templates, damage rolls, saving throws, and Transform activities remain ordinary
dnd5e documents. A player should still be able to open an item and understand its
mechanics without reading module code.

Native documents own:

- attack, save, damage, healing, and temporary-hit-point formulas;
- activation type and action economy;
- ranges, targets, areas, and durations;
- feature uses and rest recovery;
- Vessel-slot consumption;
- conditions and ordinary actor changes;
- class and subclass item grants.

### Vessel state service

A small service owns the lifecycle of Spirit Mantle and, in stage 2, Archon Form.
It exposes explicit operations such as `activateMantle`, `deactivateMantle`,
`enterArchonForm`, `extendArchonForm`, and `revertArchonForm`.

State is persisted under versioned module flags on the original Vessel actor so that
it survives reloads and can be migrated. During transformation, the temporary actor
or unlinked token delta stores a reference to that state owner. Active Effects
represent rules-visible state, but the original actor's flags remain the
authoritative lifecycle record. The service must reconcile missing or stale effects
when the original or transformed actor is loaded.

The service does not roll dice, resolve damage, decide whether an attack hits, or
apply healing.

### Vessel rule calculations

Pure helpers calculate Vessel-specific values from actor data:

- Vessel level;
- Iridescent Strike damage die;
- available Iridescent Strike damage types;
- Ethereal Armor formula and Archon AC bonus;
- Archon duration;
- temporary-hit-point cap;
- feature-use formulas.

These helpers do not update documents. They are unit-tested without Foundry UI
state and are shared by activities, effects, cards, and prompts.

### Prompt coordinator

Stage 5 adds an opt-in observer that listens to public Foundry/dnd5e hooks. When a
potential feature trigger is confidently recognized, it offers the owning player a
prompt. The coordinator:

- never spends a reaction or resource without confirmation;
- deduplicates prompts for the same workflow;
- confirms the actor still has the feature and satisfies its visible prerequisites;
- dismisses stale prompts when the triggering workflow has ended;
- does nothing when the event cannot be interpreted safely.

It must not monkey-patch damage application or depend on private workflow internals.
If a third-party module bypasses the relevant public hook, the feature remains
manually usable from the actor sheet.

## Stage 1: Spirit Mantle and Iridescent Strikes

### Spirit Mantle control

Spirit Mantle receives a native utility activity presented as a bonus-action toggle.
Using it asks the Vessel state service to activate or dismiss the Mantle.

Activating the Mantle:

- records Mantle state on the actor;
- applies one identifiable, non-duplicating Mantle Active Effect;
- exposes Ethereal Armor when its prerequisites are met;
- makes the Vessel's Iridescent Strike activities available;
- optionally applies a token visual indicator that does not replace user artwork.

Dismissing the Mantle:

- removes only effects created by the Mantle controller;
- clears Mantle state;
- leaves unrelated actor effects and equipment untouched.

Repeated activation is idempotent. If state and effect disagree after a reload, the
service repairs the mismatch without creating duplicate effects.

### Ethereal Armor

While the Mantle is active, an unarmored Vessel without a shield can use:

`10 + Constitution modifier + Charisma modifier + Archon AC bonus`

The automation must not overwrite worn armor, shields, or another valid AC
calculation. In dnd5e 5.3.3, the Mantle effect targets the supported
`system.attributes.ac.min` formula field in UPGRADE mode. Actor preparation then
chooses the higher of Ethereal Armor and the actor's ordinary calculated AC, so
Monk/Barbarian Unarmored Defense, Mage Armor, natural armor, and custom formulas
continue to work. The effect never changes `system.attributes.ac.calc`.

Equipping armor or a shield while the Mantle is active immediately makes Ethereal
Armor inapplicable. Removing that equipment makes it available again. The actor
sheet must continue to explain the active AC mode.

### Stage 1 actor migration

Compendium updates do not replace Items already owned by actors. At world ready,
one responsible active client per Vessel actor performs a versioned migration
before reconciliation. Responsibility uses deterministic JavaScript code-unit
ordering: the first active GM, or otherwise the first active OWNER.

The migration adds or repairs the fixed Iridescent Strike ScaleValue, three
Spirit Mantle activities, and the module-role-tagged effect template. Stable
mechanical fields owned by this module are refreshed from the compendium, while
user presentation, notes, activity use state, current unlocked damage types,
unrelated activities/advancements/effects, and foreign flag namespaces remain
unchanged. The actor migration flag is written only after all owned Items update
successfully, making retries safe and subsequent ready cycles no-ops. A migration
error is reported but does not suppress the independent reconciliation pass, so
inactive stale effects are still disabled and removed when cleanup is safe.

### Iridescent Strike activities

Spirit Mantle contains native attack activities for:

- a melee unarmed Iridescent Strike;
- a bonus-action melee Iridescent Strike.

Later features can grant additional variants rather than duplicating the underlying
damage rules.

All variants:

- use Charisma for attack and damage;
- add proficiency normally through dnd5e;
- count as unarmed strikes;
- use the Vessel's scaling damage die;
- add the Charisma modifier once;
- offer only damage types the actor has unlocked;
- remain native attack activities so ordinary dnd5e targeting, advantage,
  critical-hit, and damage workflows continue to work.

The scaling die is:

| Vessel level | Die |
| --- | --- |
| 1–4 | d6 |
| 5–10 | d8 |
| 11–16 | d10 |
| 17–20 | d12 |

Radiant is always available. Subclass features add their defined damage types.
Ascended's prepared-spell-derived damage types are evaluated when the activity is
used; if they cannot be derived confidently, the activity offers radiant and allows
the player to use Foundry's normal situational bonus field.

Using a Strike while the Mantle is inactive produces a warning and offers to
activate the Mantle. It does not automatically consume the character's bonus action
or silently activate the feature.

## Stage 2: Archon Form Lifecycle

Each subclass grants a dedicated Archon Form control item. Most subclasses reference
one Actor profile; Cataclysm references four affinity profiles and defaults to the
actor's saved affinity.

The control card offers:

- **Transform** using the free feature use;
- **Transform with Vessel Slot** when no free use remains;
- **Extend 10 Minutes** by consuming one Vessel slot;
- **Revert**;
- the active profile and remaining duration.

Native Transform activities and `Actor#transformInto` perform the transformation.
The Vessel controller supplies settings that preserve the original ability scores,
hit points, class/race features, Vessel spells, and merged save/skill proficiencies.
The form contributes its creature type, movement, senses, resistances, immunities,
languages, and form-specific traits.

On entry:

- Spirit Mantle becomes active;
- the actor gains temporary hit points equal to twice its Vessel level;
- the correct Archon AC bonus is included in Ethereal Armor;
- the start time, expiry time, profile, and source actor are stored;
- eligible Archon-only activities become available.

On reversion:

- Foundry restores the original actor;
- all Archon-only effects created by this module are removed;
- temporary hit points gained in the form are cleared as required by the class;
- Mantle state is reconciled with the resulting actor;
- unrelated effects are preserved.

The controller displays expiry reminders but does not forcibly interrupt an active
roll or turn. At expiry it prompts the player to spend a Vessel slot to extend the
form or to revert. Before level 7, applying the Unconscious condition also produces a
reversion prompt. At every level, reaching 0 hit points produces a reversion prompt.
These prompts describe mandatory class rules, but reversion waits for confirmation
so it cannot replace an actor while Foundry is still resolving a workflow.
Controlled Transformation changes the base duration to one hour and removes
Unconscious as an early end condition. At level 11, successful transformation can
prompt for an eligible free Sealed Magic cast.

Equipment handling uses Foundry's supported transform setting. The player chooses a
default policy per actor and can request the configuration dialog when a different
choice is needed.

## Stage 3: Archon and Aspect Activities

Rules that can be represented natively receive normal activities and effects. The
initial high-value set is:

- Ascended: Arcane Blast and Astral Step;
- Cataclysm: affinity traits, Bluster, and Cataclysmic Eruption;
- Cursed: Frenzy and Infernal Drain;
- Fallen: Divine Wrath, Divine Ward, and Condemnation marking;
- Formless: pseudopod Strike, Sticky Slime, and Drain Vitality;
- Trickster: Juxtapose and Stolen Memory;
- Aether Wings, Opalescent Armor, Perilous Visage, Otherworldly Maw,
  Primordial Bulwark, Twilight Steps, Shimmering Lance, Dazzling Lance,
  Sundering Strike, and Vexing Strike.

Targeted riders use source-linked effects and normal durations. Form-only effects are
tagged so the Archon lifecycle can remove them without touching unrelated effects.

The module can calculate a roll formula or prepare a native activity before use. It
must not intercept final damage to implement features such as Elder Power or
Hellfire. Those mechanics use supported dnd5e damage configuration when
available and otherwise remain clearly described manual modifiers.

## Stage 4: Progression and Resources

Subclass advancements grant each Sealed Magic spell at its specified Vessel level.
These spells do not count against spells known.

Advancements also:

- prompt Cataclysm players for Elemental Affinity;
- grant subclass-specific bonus Aspects;
- preserve replacement rules for ordinary Aspects;
- expose cantrips known, spells known, slot level, and Aspects known;
- set feature uses to formulas such as `max(1, Charisma modifier)`;
- grant both ordinary-use and Vessel-slot fallback activities when a rule permits
  either payment method.

Vessel slots remain the custom single-level, short-rest-recovery progression already
registered by the module.

## Stage 5: Optional Reactive Prompts

Reactive prompts are enabled by a world setting and can be disabled per user. The
first supported prompts are:

- Primeval Will after a failed Intelligence, Wisdom, Charisma, or concentration
  saving throw;
- Dire Preservation when the observed workflow would reduce the Vessel to 0 hit
  points without killing it outright;
- Iridescent Shield when the Vessel or a creature within its current reach takes
  damage;
- Primeval Thirst when a visible creature within 30 feet casts a spell;
- Fey Retribution after the Vessel succeeds on a saving throw against a spell;
- Consume Strike after the Formless Archon is hit by an attack.

Every feature also retains a manually usable sheet activity. Prompts supplement
native play; they are never the only way to use a feature.

Consume Strike's arbitrary attack copying is intentionally not automated in the
initial release. Its prompt records the triggering attack and reminds the player of
the option, but copying another item's complete damage and effects is too dependent
on item and third-party workflow structure to be reliable.

## Error Handling and Compatibility

- Missing source items, Actor profiles, or UUIDs produce a user-facing notification
  and leave the current actor unchanged.
- Resource consumption is transactional: transformation or an activity does not
  proceed if its required use or Vessel slot cannot be consumed.
- Failed transformation attempts do not remove the original token or actor.
- Reversion is always available to the GM, even if the initiating player disconnects.
- A reload or scene change reconciles persisted Vessel state with the current actor
  and token.
- Hook observers use public APIs and validate their payloads before prompting.
- Unsupported or ambiguous third-party workflows degrade to manual activities.
- Module debug logging is disabled by default and contains no actor biography or chat
  content.

## Testing Strategy

### Unit tests

Test pure rules and state transitions:

- Vessel-level lookup and multiclass actors;
- Iridescent Strike die and damage-type choices;
- Ethereal Armor eligibility;
- duration changes from Controlled Transformation;
- resource-choice rules and feature-use formulas;
- idempotent Mantle/Form state transitions;
- prompt eligibility and deduplication.

### Document fixture tests

Validate compiled compendium documents:

- activity types, activation costs, formulas, ranges, and targets;
- effect changes and durations;
- advancement UUIDs and grant levels;
- Transform profile UUIDs and settings;
- no dangling rider or consumption references.

`verifyPack` remains mandatory after every content compilation.

### Foundry integration checks

On dnd5e 5.3.3, manually verify:

- activation, dismissal, reload, and equipment changes during Spirit Mantle;
- melee, bonus-action, critical, and subclass damage-type Strikes;
- free-use and slot-funded transformation;
- linked and unlinked tokens;
- expiry reminder, extension, reversion, 0 HP, and scene reload;
- permissions for player-owned actors and GM fallback;
- behavior with reactive prompts disabled;
- graceful manual fallback alongside common automation modules.

### Regression boundary

Existing non-Vessel actors, spells, activities, damage application, rests, and
transformation must behave identically when Vessel automation is unused.

## Explicit Non-Goals

- Replacing dnd5e attack, damage, save, healing, rest, or transformation engines.
- Automatically choosing whether to spend a reaction or resource.
- Requiring Midi-QOL.
- Automatically copying arbitrary attacks for Consume Strike.
- Perfect enforcement of narrative restrictions such as whether an Archon can wear a
  particular piece of equipment.
- Automatically moving tokens for every teleport or forced-movement rule when native
  placement remains clearer and safer.
- Implementing all five stages in one change set.

## Success Criteria

The design succeeds when a Vessel player can understand and operate the class from
its actor sheet, receives useful prompts without losing agency, and can always fall
back to native Foundry controls. Disabling the custom automation must leave valid
items and activities rather than a broken character. No Vessel feature may require
replacement of Foundry's existing damage or transformation systems.
