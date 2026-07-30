# Optional Private Spell Compendium Design

**Date:** 2026-07-30  
**Status:** Approved design, pending implementation plan  
**Applies to:** `declan-homebrew-classes` and a future private companion spell module

## Purpose

Stage 4 of the Vessel automation needs to grant fixed Sealed Magic spells even
when those spells are not present in the public module or the dnd5e system's SRD
packs. The public module must support a privately maintained spell compendium
without naming it, depending on it, or redistributing its contents.

The result must:

- keep the public repository limited to authorized homebrew and SRD content;
- let a GM select one optional private Item compendium in Foundry;
- resolve required spells deterministically from public and private providers;
- leave Foundry and dnd5e responsible for spell documents and spell use; and
- degrade clearly when a source is absent or ambiguous.

This design does not create, import, transcribe, or publish commercial spell
content.

## Public Content Policy

The public repository and every public release may contain only:

1. original homebrew content owned by the repository owner;
2. third-party homebrew content used with permission and the required credit;
3. material from SRD 5.1 or SRD 5.2.1 used under CC BY 4.0 with the required
   attribution; and
4. module code, tests, identifiers, and documentation that do not reproduce
   unlicensed commercial content.

The restriction applies to source YAML, compiled packs, test fixtures,
snapshots, documentation, images, release archives, and Git history. The public
repository must not contain commercial spell descriptions, artwork, icons,
book extracts, or a compiled substitute for a commercial sourcebook.

The policy will be recorded in a repository policy file and summarized in the
public README. A release check will inspect the public spell source tree and
release inputs for known policy violations. Automation is a guardrail, not a
legal determination; maintainers remain responsible for reviewing new content
and its license.

## Provider Contract

The public module accepts one optional private provider through a world-scoped,
GM-configured setting:

- **Label:** Private Spell Compendium
- **Setting key:** `privateSpellCompendium`
- **Value:** the selected Item compendium collection identifier
- **Default:** an empty string meaning "None"
- **Visibility:** configurable by a GM in Module Settings

The setting lists installed Item compendia. It does not require a particular
module ID, pack ID, repository name, folder structure, or license flag. A
provider qualifies when the selected pack exists and contains normal dnd5e
Items whose document type is `spell`.

The public module never writes to the selected compendium. It reads the index
and source documents through Foundry's public CompendiumCollection APIs. Spells
copied onto an actor become ordinary embedded dnd5e spell Items and continue to
work if the private module is later unavailable.

## Spell Resolution

Stage 4 will describe every required spell with a content-free manifest entry:

```js
{
  key: "stable-module-owned-key",
  name: "Display Name",
  subclass: "subclass-identifier",
  vesselLevel: 3
}
```

The manifest contains only the information necessary to identify and grant a
spell. It does not contain spell rules text or commercial metadata.

For each required spell, the resolver searches in this order:

1. `declan-homebrew-classes.homebrew-spells`;
2. the Item compendium selected by `privateSpellCompendium`;
3. Item compendia owned by the installed `dnd5e` system; and
4. no result, returned as an explicit unresolved state.

The third step is intentionally restricted to system-owned dnd5e packs. The
resolver does not automatically scan premium content modules or unrelated
third-party compendia.

Candidates must have document type `spell`. Names are compared after Unicode
normalization, trimming, whitespace collapsing, and locale-independent
lowercasing. The resolver does not use fuzzy matching.

Resolution returns a structured result:

```js
{
  status: "resolved" | "missing" | "ambiguous" | "unavailable",
  spellKey: "stable-module-owned-key",
  sourceUuid: "Compendium.package.pack.Item.id" | null,
  provider: "homebrew" | "private" | "srd" | null,
  candidates: []
}
```

Exactly one match in the first provider that has a match resolves the spell.
Multiple matches within that provider produce `ambiguous`; lower-priority
providers are not used to break the tie. A disabled or missing selected private
pack produces `unavailable` for that provider, after which the resolver may
continue to the dnd5e system packs. The user-facing diagnostic must still
identify the unavailable configured pack.

## Stage 4 Integration

The resolver is an isolated service consumed by the Stage 4 progression
reconciler. The resolver does not level actors, create advancements, or consume
resources.

When Stage 4 determines that a Vessel should receive a Sealed Magic spell, it
asks the resolver for the source document and imports a copy through Foundry's
normal embedded Item APIs. The actor-owned copy receives module flags recording:

- the stable spell key;
- the resolved source UUID;
- the provider category; and
- the Vessel subclass and grant level.

Those flags make reconciliation idempotent without tying future checks to a
mutable document name. Existing actor-owned spells are never deleted merely
because their provider becomes unavailable. Provider documents are never
modified.

Missing or ambiguous spells produce one actionable GM-facing warning per
reconciliation pass. Stage 4 continues processing other spells. The warning
names the spell, explains whether the pack is missing or matches are ambiguous,
and directs the GM to the module setting. No placeholder spell containing
invented rules text is created.

## Foundry User Experience

On a new world, no private provider is configured. The module continues to use
its homebrew pack and the dnd5e system's SRD packs without prompting.

A GM who installs a private companion module configures it as follows:

1. Enable both **Declan's Homebrew Classes** and the private spell module in the
   world.
2. Open **Game Settings → Configure Settings → Module Settings**.
3. Find **Declan's Homebrew Classes → Private Spell Compendium**.
4. Select the private module's spell Item compendium.
5. Save changes and reload the world if Foundry requests it.
6. Level or reopen the applicable Vessel actor so Stage 4 reconciliation can
   grant any newly available spells.

If the expected compendium is absent from the dropdown, the GM should confirm
that the private module is installed, enabled in that world, and declares an
Item pack for the dnd5e system.

The same instructions must appear in the private companion repository's
`README.md`. The public README will explain the optional setting and provider
contract but will not name, link to, or advertise the private repository.

## Private Companion Repository Boundary

The private companion is a separate Foundry module and a separate private Git
repository. Its README must include:

- the Foundry installation method chosen by the repository owner;
- the exact world-setting steps above;
- the module and pack IDs that the GM should see in the dropdown;
- a statement that access is limited to the private game;
- a reminder not to make the repository or release assets public; and
- rebuild instructions that do not copy content into the public module.

The public module must not declare the private module as a dependency or
recommendation. The private module may depend on the public module only if a
future feature requires it; the initial spell pack does not need that
dependency.

Creation of commercial spell documents is outside the scope of the public
module implementation. The private repository must never be used as a build
input for a public release.

## Error Handling

- An empty setting is valid and produces no warning by itself.
- A stale setting value produces a GM warning and still permits SRD fallback.
- A selected non-Item pack is rejected.
- Documents whose type is not `spell` are ignored.
- A pack index failure is caught, logged without document contents, and reported
  to the GM as an unavailable provider.
- Duplicate normalized names within the winning provider are reported as
  ambiguous.
- A failed actor import leaves the source pack unchanged and does not mark the
  spell as granted.
- Players without setting permission can use already granted spell Items without
  access to the source compendium.

## Testing

### Unit tests

- setting choice construction includes installed Item packs and excludes Actor
  packs;
- name normalization handles case, whitespace, and Unicode consistently;
- provider precedence is homebrew, selected private, then system SRD;
- only dnd5e system-owned packs participate in automatic SRD fallback;
- an empty private setting is silent;
- stale settings, pack failures, duplicates, missing spells, and non-spell
  documents return the specified structured statuses; and
- resolver caching is invalidated when the world setting changes.

### Stage 4 integration tests

- a resolved source spell is imported once and tagged with the stable spell key;
- repeated reconciliation is idempotent;
- a copied spell remains usable when the provider is unavailable;
- one failed spell does not block other grants; and
- source compendium documents are never updated.

### Repository and release checks

- the public spell source tree contains an allowed provenance declaration for
  every document;
- CC BY content has the required attribution;
- public release inputs do not include private module paths or artifacts; and
- the compiled public packs still pass the importer's mandatory `verifyPack`
  validation.

### Manual Foundry checks

On Foundry VTT 13 with dnd5e 5.3.3 or later:

- configure, change, clear, disable, and re-enable the private provider;
- confirm the dropdown exposes the intended private Item compendium;
- confirm a Vessel receives the correct actor-owned spell copy;
- confirm duplicate and missing spell warnings are actionable for the GM; and
- confirm players can cast previously granted spells while the private module is
  disabled.

## Out of Scope

- publishing, transcribing, or reviewing commercial spell content;
- bypassing sourcebook access controls;
- automatically discovering premium or arbitrary third-party compendia;
- fuzzy matching spell names;
- synchronizing later provider edits into actor-owned spells;
- supporting multiple private providers in an ordered list; and
- replacing dnd5e spell use, preparation, slot consumption, or damage workflows.
