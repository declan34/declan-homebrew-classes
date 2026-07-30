# Declan's Homebrew Classes (D&D 5e / Foundry VTT)

Homebrew classes for the [dnd5e](https://github.com/foundryvtt/dnd5e) system in Foundry VTT,
generated from source PDFs. Installs **alongside** your normal dnd5e system and adds a
**Homebrew Classes** compendium — it does **not** replace or modify the dnd5e system.

Currently included:

- **The Vessel** — a Charisma-based caster/martial class, with its six *Sealed Spirit* subclasses:
  The Ascended, The Cataclysm, The Cursed, The Fallen, The Formless, The Trickster.

## Vessel automation

The Vessel includes native dnd5e activities for Spirit Mantle and Iridescent
Strikes. Spirit Mantle toggles Ethereal Armor only while the character is
unarmored and not wielding a Shield; its formula competes with other valid AC
calculations instead of replacing them. Iridescent Strikes use Charisma, scale
with Vessel level, and use Foundry's ordinary attack, critical-hit, and damage
workflows.

The module's custom code coordinates the Mantle state and prompts before an
inactive Vessel attempts a Strike. It does not replace Foundry's attack or damage
resolution and does not require another automation module.

### Archon Form

At 3rd level, each Vessel subclass receives an **Archon Form control** with
Foundry-native activities to:

- transform using the feature's free use or one Vessel Magic slot;
- extend an active form by 10 minutes using one Vessel Magic slot;
- revert through Foundry's normal transformation workflow; and
- choose whether usable equipment is retained or merged/left behind.

The Transform activity prompts for the appropriate subclass profile. Cataclysm
Vessels can choose Air, Earth, Fire, or Water, with their saved affinity used as
the default. The module binds the transformation to the Vessel who used the
activity, then calls Foundry's native `Actor#transformInto` API; selecting another
token cannot redirect it.

Archon Form keeps the Vessel's abilities, hit points, class features, spells,
and biography, while merging saves and skills and applying the form's movement,
senses, defenses, languages, and descriptive traits. Spirit Mantle is activated
on entry, temporary hit points and Ethereal Armor are reconciled, and the module
prompts at expiry or applicable early-end boundaries. Controlled Transformation
uses the one-hour duration and removes the pre-7th-level Unconscious prompt.
Elder Archon gives a non-blocking reminder for its free eligible Sealed Magic
spell.

Foundry remains responsible for activity consumption/refunds, transformation,
reversion, attacks, saves, damage, healing, spells, and token replacement. The
module coordinates the class state around those public workflows without
replacing them.

### Stage 3 Archon and Aspect activities

The Archon profiles expose native activities for their attacks, saves, damage,
healing, temporary hit points, and limited-use features. The active Unsealed
Aspects likewise provide native controls for their strikes, saves, damage,
healing, durations, and recovery. Aether Wings, Opalescent Armor, and Primordial
Bulwark apply and remove their module-owned effects automatically as Spirit
Mantle and Archon Form change.

The module prepares affinity and Iridescent damage choices, checks whether an
activity requires Spirit Mantle or Archon Form, and prompts the player where a
choice is required. Foundry's ordinary chat cards and activity workflows remain
the source of truth. Teleports, forced movement, token swaps, target-specific
restrictions, and adjustments based on damage already resolved remain explicit
player/GM adjudication steps described on the activity. This automation has no
Midi-QOL dependency.

## Warlord automation

The Warlord uses one shared Exploit Die pool, degree-aware Exploit choices,
native activities for mechanically useful Exploits, and player-controlled
Fighting Style effects. Set the actor's Leadership Style once so Foundry can use
the correct Intelligence, Wisdom, or Charisma modifier.

Inspiring Word asks for the target's Hit Die and then opens Foundry's native
healing workflow. Conditional Exploits and reactions track their action,
targets, rolls, and resources while leaving the triggering attack, save, or
movement in Foundry's normal workflow. Free prose-driven Orders continue to use
Post to Chat.

The module does not replace attack, save, healing, damage, or effect resolution
and does not require Midi-QOL.

## Install (for your DM)

In Foundry: **Add-on Modules → Install Module**, and paste this manifest URL:

```
https://raw.githubusercontent.com/declan34/declan-homebrew-classes/main/module.json
```

Then enable the module in your world. The classes appear in the **Homebrew Classes** compendium.
When a new version is released, Foundry shows an **Update** button.

**Requires:** the `dnd5e` system (v5.3.3+) and Foundry VTT v13+.

## ⚠️ Auto-generated draft — verify before play

This content was extracted automatically from a PDF. The **descriptive text is faithful**
(copied verbatim), but some **mechanical wiring needs a human check**:

- **Feature levels:** class features are placed at their correct levels from the class table;
  subclass features are placed from the "*Nth-level … feature*" line in each description.
  Spot-check them.
- **Subclass-feature grants:** a few class-level advancement links (e.g. the *Sealed Spirit*
  subclass-choice and the *Unsealed Aspects* pool) are left as TODO and may need wiring by hand.
- **Spellcasting:** The Vessel uses a non-standard caster progression (Spells Known / Slots
  columns rather than the standard slot grid) — review the spellcasting setup on the class.
- Any feature flagged in the importer's review report may have incomplete automation.

Treat this as a **strong starting point**, not a finished, fully-automated class.

## Credits

The Vessel is homebrew content. **Original author: _[fill in — credit the creator of The Vessel]_.**
Packaged for Foundry by declan34. If you are the original author and want changes or removal,
open an issue.

## Rebuilding

The compendium source (YAML) lives in `src/`; the compiled pack is in `packs/homebrew-classes/`.
Generated with [dnd5e-pdf-importer](https://github.com/declan34/dnd5e-pdf-importer).

Warlord Exploits live in a separate compendium but reference the Warlord
class's `@scale.warlord.exploit-die` value. Validate both authoritative source
trees without duplicating that scale definition by running:

```bash
node scripts/verify-warlord-sources.mjs
```

This checks `src/` on its own, then checks a temporary combined copy of `src/`
and `exploits-src/`. The combined check is the required Exploit formula-closure
validation; standalone `exploits-src/` verification cannot resolve a class
scale stored in another pack. The helper removes its temporary copy and never
modifies source or compiled pack files.
