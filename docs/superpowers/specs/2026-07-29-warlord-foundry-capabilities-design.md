# Warlord Foundry Capabilities Design

**Date:** 2026-07-29

**Target:** Foundry VTT dnd5e 5.3.3

**Module:** Declan's Homebrew Classes

## Purpose

Make the base Warlord class substantially easier and more satisfying to play in
Foundry while preserving dnd5e's normal rules workflows.

The implementation should turn rules text into native activities when an activity
adds real mechanical value: action economy, targeting, resource consumption, a
roll, healing, a saving throw, or an effect. Features that would only repeat their
description should continue to use Foundry's existing **Post to Chat** action.

The guiding rule is:

> Use native dnd5e activities and effects for game mechanics. Add module code only
> where Foundry cannot express a Warlord-specific choice, and then use that code to
> route into a native activity rather than resolving the mechanic itself.

## Scope

This pass covers:

- the core Warlord class features;
- the 40 Tactical Exploits currently included in the module;
- the seven Fighting Styles currently included in the module;
- migration of existing actor-owned copies of those items;
- automated content and behavior tests.

This pass does not cover:

- content from the separate LaserLlama Warlord v3.3 expansion;
- Academy subclass features;
- automatic detection of attack, save, or damage triggers;
- automatically moving tokens or causing another actor to attack;
- replacing dnd5e attack, save, healing, damage, or effect resolution;
- a dependency on Midi-QOL or another automation module;
- redundant activities whose only behavior is posting a description to chat.

## Native-First Boundaries

Native dnd5e documents own:

- activation type and action economy;
- range and target selection;
- feature and Exploit Die consumption;
- attack, damage, healing, and saving-throw rolls;
- short-rest, long-rest, and initiative recovery;
- Active Effect application and expiration where dnd5e supports it;
- chat cards and ordinary damage or healing application.

The module may:

- remember the actor's selected Leadership Style ability;
- prompt for the Hit Die used by Inspiring Word;
- select or configure a native activity using those choices;
- migrate module-owned mechanical data on existing actor items;
- warn when required Warlord configuration or resources are missing.

The module must not:

- calculate and directly apply damage or healing;
- bypass normal activity consumption;
- inspect a completed roll and silently change its result;
- monkey-patch private dnd5e workflow methods;
- control another player's token or actor;
- remove or overwrite unrelated user content.

## Leadership Style Configuration

### Why configuration is required

Warlords choose Charisma, Wisdom, or Intelligence as their Leadership ability.
dnd5e 5.3.3 Save activities can use a configured ability for their DC, but ordinary
feature Heal and Utility activities do not expose a dynamic ability selector and
do not give `@mod` a Warlord-specific meaning. A shared compendium item therefore
cannot safely infer the correct Leadership modifier.

The module must not use the highest of Intelligence, Wisdom, and Charisma, because
that can differ from the Leadership Style the player selected.

### Player experience

Leadership Style receives one visible **Set Leadership Style** utility control. It
opens a small dialog with:

- **Captain — Charisma**
- **Mentor — Wisdom**
- **Strategist — Intelligence**

The current selection is preselected and can be changed later. Confirming stores
the ability key (`cha`, `wis`, or `int`) in a versioned module flag on the actor.
Canceling changes nothing.

When a Warlord activity needs a Leadership ability and no choice has been stored,
the module opens the same dialog before the activity proceeds. Canceling prevents
the activity from running and consumes nothing.

Changing the selection updates only module-owned mechanical fields on the actor's
Warlord items:

- Save activity DC calculation ability;
- explicit Leadership-modifier formulas used by hidden Inspiring Word helpers;
- module-owned formula labels or chat hints.

Native activities continue to resolve the resulting save, roll, or healing. The
configuration service does not resolve any roll.

### Ownership and concurrency

The flag belongs to the actor, not to a world-level user setting, because one user
may own multiple Warlords with different Leadership Styles.

Only an actor owner may change it. Concurrent configuration requests for the same
actor share one in-flight dialog and one update. Updates are idempotent. If an item
is added after the choice is stored, the item-create hook configures only that new
module-owned item.

## Shared Exploit Dice

The **Tactical Exploits** class feature becomes the authoritative shared resource:

- uses maximum: `@scale.warlord.exploit-dice`;
- recovery: all uses on a short rest;
- no separate duplicated die pool on individual Exploit items.

Every activity that spends an Exploit Die consumes one use from Tactical Exploits.
The consumption target uses Tactical Exploits' stable item identifier. dnd5e
remaps an identifier-based item target to the corresponding embedded item on the
actor, allowing the same activity data to work from the compendium and on actor
copies.

Orders whose descriptions do not spend an Exploit Die remain free. If an Exploit
has both its own limited uses and an Exploit Die cost, its activity consumes both
as the rule requires.

If Tactical Exploits is missing, an Exploit activity must fail with a clear warning
rather than creating a second resource or allowing an untracked use.

### Tactical Skill

Tactical Exploits receives a native Utility activity for Tactical Skill. It:

- has no action activation;
- consumes one shared Exploit Die;
- rolls `@scale.warlord.exploit-die`;
- posts the die result in the normal dnd5e card.

The player adds that result to the qualifying check. The module does not detect
proficient checks, edit a completed check, or enforce the once-per-check rule.

## Exploit Availability

Advancement choice pools must reflect the degree a Warlord can learn:

| Warlord level | Available degrees |
| --- | --- |
| 2–4 | 1st |
| 5–8 | 1st–2nd |
| 9–12 | 1st–3rd |
| 13–16 | 1st–4th |
| 17–20 | 1st–5th |

Later choices continue to include lower-degree Exploits. Existing actor choices
remain untouched.

Ability-score or proficiency prerequisites that Foundry cannot represent reliably
remain visible in the item description. This pass does not add a custom
prerequisite engine.

The erroneous generic `prerequisites.level: 4` value on Exploit source items must
be replaced with the correct degree-based minimum level or removed when the
advancement pool is the authoritative gate. The implementation plan must select
one consistent representation and test it across all 40 items.

## Inspiring Word

### Visible activity

Inspiring Word exposes one visible **Inspiring Word** launcher, not four activities
named after Hit Dice.

Using it:

1. validates that the actor owns the feature and has a use available;
2. resolves the actor's configured Leadership ability, prompting if necessary;
3. prompts for the target's Hit Die: d6, d8, d10, or d12;
4. dispatches to the matching hidden native Heal helper activity;
5. lets that Heal activity perform targeting, use consumption, healing, chat-card
   creation, and normal healing application.

The helper formula is one Hit Die plus the explicitly selected Leadership
modifier. Helpers use stable, immutable formulas, such as:

- `1d6 + @abilities.cha.mod`
- `1d8 + @abilities.wis.mod`
- `1d12 + @abilities.int.mod`

There are twelve hidden helpers: four Hit Dice times three Leadership abilities.
This avoids mutating a single activity immediately before use, which can make
rerolls and old chat cards refer to different source data.

The helpers are implementation details. They must be hidden from the ordinary
activity list or otherwise clearly marked as router-only so the player still sees
one feature action.

### Safety behavior

- Canceling either prompt spends no use and creates no chat card.
- Repeated clicks while a prompt or helper launch is in flight share or reject the
  duplicate request; they cannot spend two uses.
- If the selected target has no matching Hit Die, the player may still choose the
  die manually because Foundry does not expose another actor's class Hit Die as a
  reliable activity formula.
- If the actor lacks the appropriate hidden helper, the launcher warns and stops.
- The launcher never applies hit points itself.

### Uses, range, and recovery

- Uses maximum remains `@scale.warlord.inspiring-word`.
- Recovery is all uses on a short rest, which also covers a long rest through
  dnd5e's normal rest behavior.
- Activation is a bonus action.
- The target is one other creature.
- Base range is 30 feet.
- Tactical Superiority doubles the actor-owned activity range to 60 feet at
  Warlord level 11.
- Tactical Superiority adds native initiative recovery of one expended use at
  Warlord level 11.

The launcher must not display two separate use pools or consume one use itself and
another through the helper. The native helper is the sole consumer.

## Rallying Cry

Rallying Cry receives a native reaction Utility activity. It:

- targets one other creature;
- uses a base range of 30 feet;
- consumes one Rallying Cry use;
- posts the configured Leadership modifier in the activity roll/card;
- reminds the target to reroll its saving throw and add the displayed modifier.

The target performs the reroll through its normal save workflow. The module does
not reproduce the original save, force another actor to roll, or edit the result.

Rallying Cry:

- recovers all uses on a short rest;
- retains the existing `@scale.warlord.rallying-cry` maximum;
- gains native initiative recovery of one use at Warlord level 11;
- has its actor-owned activity range increased to 60 feet at level 11.

## Tactical Superiority

Tactical Superiority is represented through the native fields of the affected
actor-owned items:

- Inspiring Word gains recovery of one use on initiative;
- Rallying Cry gains recovery of one use on initiative;
- their ranges increase from 30 to 60 feet;
- module-owned ranged Exploit activities have their ranges doubled.

The update is level-aware and reversible. If an actor's Warlord level is reduced
below 11, module-owned values return to their base settings without altering
user-created activities.

No extra Tactical Superiority button is added.

## Exploit Activity Classification

An Exploit may contain more than one native activity when its text describes
genuinely different mechanical uses. Activity names should describe the action,
not reproduce the entire rule.

### Tier A: substantial native automation

These Exploits receive native activities for the rule components Foundry can
resolve directly:

| Exploit | Native responsibility |
| --- | --- |
| Defensive Order | activation, targets, shared-die consumption, defense effect |
| Enlivening Order | activation, target, shared-die consumption, healing |
| Dirty Hit | activation, target, shared-die consumption, save, damage/effect |
| Feint | activation, target, shared-die consumption, advantage/effect |
| Heroic Order | activation, target, shared-die consumption, temporary hit points or effect |
| Menacing Shout | activation, targets, shared-die consumption, save, frightened effect |
| Resilient Order | activation, target, shared-die consumption, save-related effect |
| Revitalizing Order | activation, target, shared-die consumption, healing |
| Stand the Fallen | activation, targets, consumption, healing |
| Steadfast Order | activation, target, shared-die consumption, condition-related effect |
| War Cry | activation, targets, consumption, save/effect |

Each activity automates only what its exact source description supports. Effects
with a trigger Foundry cannot observe use an explicit duration or a player-managed
enable/remove step.

### Tier B: native tracking and partial automation

These Exploits receive Utility, Use, Attack, Save, or effect activities when useful
for activation, targeting, resource spending, die rolling, or a clear mechanical
effect. Their conditional result remains player-managed:

- Contingency Plan
- Crescendo of Violence
- Daring Rescue
- Defensive Stance
- Eloquent Speech
- Exposing Strike
- Final Strike
- First Aid
- Heroic Fortitude
- Heroic Will
- Hold the Line
- Honor Duel
- Imposing Presence
- Insightful Order
- Inspirational Speech
- Intimidating Command
- Pack Tactics
- Parry
- Perilous Gambit
- Riposte
- Surprise Attack
- Tactical Reposition
- Taunting Strike
- Victory Surge
- Wild Charge

When the useful mechanical value is only rolling the Exploit Die and recording its
consumption, a Utility activity is sufficient. The module does not invent an
effect for prose that requires judgment.

### Tier C: Post to Chat only

These free Orders remain description-driven and use Foundry's existing **Post to
Chat** action:

- Attack Order
- Maneuvering Order
- Rejuvenating Order
- Support Order

They do not receive a dedicated activity merely to duplicate their prose. The
module does not make the target attack, move, or take another action.

## Fighting Styles

### Balanced Fighting

A native Enchant activity applies the style's +2 damage bonus to one selected
eligible melee weapon. Eligibility remains explained in the description; the
player chooses the correct weapon.

### Classical Swordplay

A native Enchant activity applies +2 to attack rolls with one selected finesse
weapon. A separate module-owned +1 AC effect is present but disabled by default;
the player enables it only while the style's equipment requirements are met.

### Defensive Fighting

A module-owned +1 AC effect is disabled by default. The player enables it while
the style's armor requirement is met and disables it otherwise.

### Mounted Warrior

A native Use activity applies the +1 AC effect to the Warlord and the selected or
controlled mount. The effect is removed manually on dismount. The module does not
watch token mounting state or guess which token is the mount.

### Protection

A native reaction Use activity targets the protected creature and rolls or
displays the Warlord's proficiency bonus for comparison with the triggering attack.
It does not detect the attack, change the attack roll, or impose a result on
another actor.

### Standard Bearer

A native reaction activity applies advantage on the target's next saving throw.
If dnd5e cannot expire the effect specifically after that save, the card instructs
the player to remove it after the roll.

### Tactical Fighting

The bonus-action Help use receives a native activity that can apply advantage to
the target's next attack. The bonus-action Search option remains **Post to Chat**
because it uses Foundry's existing check workflow and needs no separate mechanic.

### Style safety

This pass intentionally avoids equipment, attack, or mount watcher hooks. Enchant
activities and player-enabled effects provide the useful native automation without
creating state that can become silently incorrect.

## Runtime Architecture

The Warlord runtime should be small and independent of the Vessel automation:

- `scripts/warlord/leadership.mjs` owns Leadership Style choice, the actor flag,
  and configuration of module-owned activity fields;
- `scripts/warlord/inspiring-word.mjs` owns only the Hit Die prompt and dispatch to
  a hidden native Heal helper;
- `scripts/warlord/migration.mjs` upgrades actor-owned Warlord content;
- `scripts/warlord/hooks.mjs` registers supported Foundry hooks and deduplicates
  configuration or routing requests;
- pure constants and item-role helpers may be separated where that improves tests.

The implementation must use public Foundry/dnd5e APIs. If a supported hook is not
available for a particular workflow, the native item remains manually usable.

Module-owned activities, effects, and helpers receive stable role flags and stable
IDs. Runtime code looks up roles or identifiers, not localized display names.

## Existing-Actor Migration

Compendium changes do not update items already owned by actors, so a versioned,
idempotent actor migration is required.

### Responsibility

One responsible active client migrates each Warlord actor:

1. the first active GM under deterministic JavaScript code-unit ordering;
2. if no GM is active, the first active OWNER under the same ordering.

The migration version flag is written only after all required item updates succeed.
A failed migration is safe to retry on the next ready cycle.

### What the migration repairs

For module-owned Warlord content, the migration may add or repair:

- Leadership Style configuration metadata;
- the Tactical Exploits shared use pool and Tactical Skill activity;
- stable identifier-based Exploit Die consumption;
- activity activation, range, target, roll, save, heal, and effect fields;
- Inspiring Word launcher metadata and hidden helpers;
- short-rest and initiative recovery;
- Rallying Cry activity;
- Tactical Superiority level-aware ranges;
- Fighting Style activities and effects;
- module role/version flags.

### What the migration preserves

The migration preserves:

- current spent uses, clamped only if a corrected maximum makes that necessary;
- custom item names and descriptions;
- custom chat flavor and notes;
- unrelated or user-created activities;
- unrelated effects;
- foreign flag namespaces;
- items not confidently identified as this module's Warlord content;
- the player's chosen Exploits, including legacy choices that are no longer in the
  correct degree pool.

Mechanical structures created by this module are identified by stable role flags.
The migration repairs only those structures. It never deletes an unknown activity
because its name resembles a module activity.

### Newly granted items

The same configuration functions apply to newly created actor-owned items. If the
actor already has a Leadership choice, Save DCs and formulas are configured
immediately. Level-derived Tactical Superiority fields are also applied.

## Source and Pack Generation

YAML source remains authoritative. Generated LevelDB packs and `module.zip` must be
rebuilt using the repository's existing build process after source edits.

Tests must compare the relevant source mechanics with compiled pack documents so a
release cannot contain stale Warlord data.

## Testing and Verification

### Content tests

Automated tests must verify:

- all 40 Exploits are present exactly once;
- every Exploit belongs to exactly one approved automation tier;
- all Exploit degree pools unlock at the correct Warlord levels;
- free Orders do not consume the shared pool;
- every die-spending activity targets Tactical Exploits by stable identifier;
- Tactical Exploits uses equal `@scale.warlord.exploit-dice` and recover on a
  short rest;
- Inspiring Word and Rallying Cry recover on a short rest;
- Tactical Superiority adds one-use initiative recovery at level 11;
- base and doubled ranges are correct;
- all Leadership-dependent saves use the configured ability;
- all twelve hidden Inspiring Word formulas are correct;
- every Fighting Style matches the approved native/manual mapping;
- source YAML and compiled LevelDB pack data agree.

### Runtime unit tests

Pure or mocked tests must cover:

- storing, reading, changing, and canceling Leadership Style;
- refusing a Leadership-dependent activity after configuration is canceled;
- configuring only module-owned activity fields;
- Inspiring Word d6/d8/d10/d12 dispatch for each Leadership ability;
- canceling Inspiring Word without spending a use;
- duplicate-click deduplication;
- missing helper and missing Tactical Exploits warnings;
- level 11 range and recovery application;
- reversal when Warlord level falls below 11;
- deterministic migration responsibility;
- partial migration failure and safe retry;
- preservation of user activities, effects, descriptions, flags, and spent uses;
- no-op behavior after a migration version is complete.

### Repository verification

Before release:

1. run focused Warlord content and runtime tests;
2. run all existing Vessel and module tests;
3. run every repository validator;
4. rebuild all generated packs;
5. confirm a clean source-to-pack parity check;
6. inspect the packaged module contents;
7. run `git diff --check`.

### Live Foundry smoke test

The release handoff should give the DM a short checklist:

1. update an existing Warlord actor and confirm its current uses and custom notes
   survive migration;
2. select each Leadership Style and confirm a representative Save DC changes;
3. use Inspiring Word once for each Hit Die and cancel once;
4. spend an Exploit Die from two different Exploits and confirm one shared pool;
5. short rest and confirm Warlord resources recover;
6. roll initiative at level 11 with expended Inspiring Word and Rallying Cry uses;
7. use one Tier A Exploit, one Tier B Exploit, and one free Order;
8. apply and remove each Fighting Style effect or enchantment;
9. confirm ordinary dnd5e attack, save, healing, and damage workflows remain
   unchanged.

## Acceptance Criteria

The design is complete when:

- the Warlord has one reliable shared Exploit Die pool;
- Exploit choices respect degree unlocks;
- meaningful core features, Exploits, and Fighting Styles have native activities;
- prose-only features rely on Post to Chat instead of redundant buttons;
- Inspiring Word presents one Hit Die prompt and resolves through native healing;
- Leadership ability is explicit and consistent across activities;
- existing actors upgrade without losing user customization;
- no automation replaces dnd5e's attack, save, healing, damage, or effect engine;
- automated tests and a DM-facing live checklist cover the delivered behavior.
