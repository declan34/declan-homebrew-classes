# Private Spell Compendium setup

This optional setting lets a GM select an installed companion module's spell
pack for Vessel Sealed Magic. The companion module is distributed separately;
this public documentation intentionally does not link to its repository.

## GM setup

1. Install and enable Declan's Homebrew Classes and the private spell module.
2. Open Game Settings → Configure Settings → Module Settings.
3. Under Declan's Homebrew Classes, find Private Spell Compendium.
4. Select the private module's Item compendium.
5. Save and reload if Foundry requests it.
6. If the pack is missing, verify that the private module is enabled and declares a dnd5e Item pack.

Choose **None** when the optional companion is not installed or should not be
used. Only enabled modules with a dnd5e `Item` pack appear as choices.

## How spell sources are chosen

For each spell, Declan's Homebrew Classes checks sources in this order:

1. Its public Homebrew Spells compendium.
2. The selected private **Item compendium**.
3. Eligible Item packs supplied by the installed dnd5e system.

The first source with an exact matching spell name wins. If a source contains
duplicate matching spells, Foundry warns the GM instead of choosing one
arbitrarily. Rename or remove the duplicate in the selected source before play.

## Troubleshooting

If the expected pack is missing from **Private Spell Compendium**, confirm that
the private spell module is enabled for this world and that it declares a dnd5e
`Item` pack. Then return to **Game Settings** → **Configure Settings** →
**Module Settings** and select the pack.

If the saved setting refers to a pack that is no longer available, the module
warns that the configured pack is unavailable and continues to the dnd5e
fallback source when possible. Select a current **Item compendium** or choose
**None** to clear the stale setting.

The public module does not package private spell content or provide copy steps:
keep the companion module installed and enabled as its own module. Obtain that
module through the channel authorized by its owner.
