# Public content policy

This repository's public spell compendium contains only authorized homebrew
spells and explicitly attributed SRD material. Official D&D spells are resolved
from the installed `dnd5e` system packs; they are not duplicated in
`spells-src/` or `packs/homebrew-spells/`.

## Approved public boundary

- Proprietary spell documents must identify `Laser Llama Original` in
  `system.source.custom` and use `system.source.license: proprietary`.
- SRD spell documents must use `system.source.license: CC-BY-4.0` and identify
  either `SRD 5.1` or `SRD 5.2.1` in `system.source.custom`.
- Every YAML document under `spells-src/` (apart from folder metadata) must be
  a spell Item with `system.source` metadata.
- Private artifacts and paths named `declan-private-spells`, `private-spells`,
  or `private-spell-content` do not belong in this public repository.

Adding a new homebrew source requires human permission review before its label
is added to the approved policy and validator.

## SRD attribution

SRD 5.1 source: <https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf>

This work includes material taken from the System Reference Document 5.1
("SRD 5.1") by Wizards of the Coast LLC and available at
https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is
licensed under the Creative Commons Attribution 4.0 International License
available at https://creativecommons.org/licenses/by/4.0/legalcode.

SRD 5.2.1 source:
<https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf>

This work includes material from the System Reference Document 5.2.1
("SRD 5.2.1") by Wizards of the Coast LLC, available at
https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative
Commons Attribution 4.0 International License, available at
https://creativecommons.org/licenses/by/4.0/legalcode.

Run `node scripts/verify-public-content.mjs` before publishing spell changes.
Passing that script is not a legal determination; maintainers remain responsible
for reviewing permission, provenance, and attribution.
