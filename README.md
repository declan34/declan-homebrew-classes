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
