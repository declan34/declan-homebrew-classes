# Optional Private Spell Compendium Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce the public spell-content boundary, add a GM-selectable private
Item compendium provider, and create a content-empty private companion module
whose README tells the DM exactly how to configure it.

**Architecture:** The public module registers one world setting and exposes a
provider-neutral resolver that searches the module's homebrew spells, the
selected private pack, and dnd5e system packs in deterministic order. Public
spell sources are audited by an explicit policy checker, while the private
companion remains a separate repository and normal Foundry module. This plan
builds the provider foundation only; the later Stage 4 progression plan will
consume the resolver to grant subclass spells.

**Tech Stack:** Foundry VTT 13, dnd5e 5.3.3, ECMAScript modules, Node.js
built-in test runner, YAML compendium sources, `js-yaml`,
`@foundryvtt/foundryvtt-cli`, Git, GitHub CLI

## Global Constraints

- Implement public-module work on `feat/optional-private-spells` in the ignored
  worktree `.worktrees/optional-private-spells`.
- The public repository and releases may contain only authorized homebrew
  content and SRD 5.1 or SRD 5.2.1 content used under CC BY 4.0.
- Do not create, transcribe, import, test-fixture, or publish commercial spell
  text, artwork, icons, or book extracts.
- Do not add the private repository as a public dependency, recommendation,
  submodule, build input, fixture, or link.
- Read providers only through public Foundry CompendiumCollection APIs.
- Do not modify provider documents or replace dnd5e spell-use workflows.
- Preserve stable IDs for retained public spell documents.
- Every changed public pack must pass `verifyPack` with `ok: true` and zero
  errors.
- The private companion repository must be created with private visibility and
  verified private before its first push.
- Do not populate the private companion with commercial spell documents in this
  plan.
- Do not bump either module version, build a release archive, merge to `main`,
  push, create a GitHub repository, or publish a release without explicit user
  approval at the relevant handoff.
- Never add a `Co-Authored-By` trailer.

---

## Task 1: Enforce the public content policy and clean the spell pack

**Files:**

- Create: `CONTENT_POLICY.md`
- Create: `scripts/verify-public-content.mjs`
- Create: `tests/public-content-policy.test.mjs`
- Modify: `README.md`
- Delete:
  `spells-src/1st-level/absorb-elements.yml`,
  `spells-src/1st-level/armor-of-agathys.yml`,
  `spells-src/1st-level/arms-of-hadar.yml`,
  `spells-src/1st-level/bane.yml`,
  `spells-src/cantrips/chill-touch.yml`,
  `spells-src/cantrips/create-bonfire.yml`,
  `spells-src/cantrips/dancing-lights.yml`,
  `spells-src/cantrips/frostbite.yml`,
  `spells-src/cantrips/infestation.yml`,
  `spells-src/cantrips/mage-hand.yml`,
  `spells-src/cantrips/message.yml`,
  `spells-src/cantrips/minor-illusion.yml`,
  `spells-src/cantrips/thaumaturgy.yml`,
  `spells-src/cantrips/thunderclap.yml`
- Rebuild: `packs/homebrew-spells/`

**Interfaces:**

- Consumes: YAML spell documents under `spells-src/`.
- Produces:
  `verifyPublicContent({ repositoryRoot, loadYaml }): Promise<{
  ok: boolean, errors: string[], spellCount: number }>`
  and an executable validation command with exit status `1` on violations.

The public spell pack should contain homebrew spells only. Official SRD spells
will be resolved from dnd5e's system packs instead of being duplicated. The
fourteen un-suffixed official spell documents listed above are removed even
when an SRD version exists; this gives the public pack one unambiguous
provenance rule.

- [ ] **Step 1: Write failing policy tests**

Create temporary source trees and assert the checker:

```js
test('accepts explicitly attributed authorized homebrew spells', async () => {
  writeSpell(root, 'allowed.yml', {
    name: 'Example Homebrew',
    type: 'spell',
    system: {
      source: {
        license: 'proprietary',
        custom: 'Laser Llama Original'
      }
    }
  });
  const result = await verifyPublicContent({ repositoryRoot: root, loadYaml });
  assert.equal(result.ok, true);
});

test('rejects proprietary spells without an approved homebrew source', async () => {
  writeSpell(root, 'commercial.yml', {
    name: 'Unclassified Spell',
    type: 'spell',
    system: { source: { license: 'proprietary', custom: '' } }
  });
  const result = await verifyPublicContent({ repositoryRoot: root, loadYaml });
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /approved homebrew source/i);
});

test('rejects private artifacts and forbidden public paths', async () => {
  mkdirSync(join(root, 'private-spells'), { recursive: true });
  writeFileSync(join(root, 'private-spells', 'spell.yml'), 'type: spell\n');
  const result = await verifyPublicContent({ repositoryRoot: root, loadYaml });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /private-spells/);
});
```

Also test malformed YAML, non-spell Items in `spells-src`, missing
`system.source`, unsupported license values, and the exact set of allowed
homebrew source labels.

- [ ] **Step 2: Run the focused test and verify failure**

```bash
node --test tests/public-content-policy.test.mjs
```

Expected: FAIL because `verify-public-content.mjs` does not exist.

- [ ] **Step 3: Implement the checker and policy**

Use these constants:

```js
const ALLOWED_HOMEBREW_SOURCES = new Set(['Laser Llama Original']);
const ALLOWED_SRD_SOURCES = new Set(['SRD 5.1', 'SRD 5.2.1']);
const FORBIDDEN_PUBLIC_SEGMENTS = new Set([
  'declan-private-spells',
  'private-spells',
  'private-spell-content'
]);
```

For `license: proprietary`, require `custom` to be in
`ALLOWED_HOMEBREW_SOURCES`. For `license: CC-BY-4.0`, require `custom` to be in
`ALLOWED_SRD_SOURCES`. Reject every other license/source combination. Scan
tracked source and documentation paths, excluding `.git`, `.worktrees`, and
compiled LevelDB internals, for forbidden private-repository path segments.

`CONTENT_POLICY.md` must reproduce the approved public boundary, require human
permission review for new homebrew sources, include the exact SRD 5.1 and SRD
5.2.1 CC BY attribution statements, and state that passing the script is not a
legal determination.

Use these official source URLs and attributions:

```text
SRD 5.1:
https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf

This work includes material taken from the System Reference Document 5.1
("SRD 5.1") by Wizards of the Coast LLC and available at
https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is
licensed under the Creative Commons Attribution 4.0 International License
available at https://creativecommons.org/licenses/by/4.0/legalcode.

SRD 5.2.1:
https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf

This work includes material from the System Reference Document 5.2.1
("SRD 5.2.1") by Wizards of the Coast LLC, available at
https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative
Commons Attribution 4.0 International License, available at
https://creativecommons.org/licenses/by/4.0/legalcode.
```

- [ ] **Step 4: Remove duplicated official spell sources**

Delete exactly the fourteen un-suffixed files listed in this task. Do not edit
or renumber retained homebrew documents. Update README counts and describe that
SRD spells come from the installed dnd5e system.

- [ ] **Step 5: Run the policy tests and checker**

```bash
node --test tests/public-content-policy.test.mjs
node scripts/verify-public-content.mjs
```

Expected: all tests PASS and the command reports `ok: true`, zero errors, and
`spellCount: 16`.

- [ ] **Step 6: Recompile and validate the public spell pack**

```bash
cd /Users/c7g6g8/Development/dnd5e-pdf-importer/emit
node -e 'import("@foundryvtt/foundryvtt-cli").then(m=>m.compilePack("/Users/c7g6g8/Development/declan-homebrew-classes/.worktrees/optional-private-spells/spells-src","/Users/c7g6g8/Development/declan-homebrew-classes/.worktrees/optional-private-spells/packs/homebrew-spells",{yaml:true,recursive:true}))'
node -e 'import("./verify.mjs").then(async m=>{const r=await m.verifyPack("/Users/c7g6g8/Development/declan-homebrew-classes/.worktrees/optional-private-spells/spells-src",{packName:"homebrew-spells"});console.log(JSON.stringify({ok:r.ok,errors:r.errors.length}));r.errors.forEach(e=>console.error(e));if(!r.ok)process.exitCode=1})'
```

Expected: `{"ok":true,"errors":0}`. Remove only a generated
`packs/homebrew-spells/LOCK` file if present.

- [ ] **Step 7: Commit**

```bash
git add CONTENT_POLICY.md README.md scripts/verify-public-content.mjs \
  tests/public-content-policy.test.mjs spells-src packs/homebrew-spells
git -c commit.gpgsign=false commit -m "chore: enforce public spell content policy"
```

## Task 2: Register the private-compendium world setting

**Files:**

- Modify: `scripts/vessel/constants.mjs`
- Create: `scripts/vessel/spell-settings.mjs`
- Modify: `scripts/vessel-automation.mjs`
- Create: `tests/vessel-spell-settings.test.mjs`
- Modify: `tests/vessel-spellcasting.test.mjs`

**Interfaces:**

- Consumes: `game.settings`, `game.packs`, and the module `init` hook.
- Produces:
  `PRIVATE_SPELL_COMPENDIUM_SETTING = "privateSpellCompendium"`,
  `buildItemPackChoices(packs): Record<string, string>`, and
  `registerPrivateSpellCompendiumSetting({ settings, packs, onChange }): boolean`.

- [ ] **Step 1: Write failing setting tests**

Use fake Actor and Item packs:

```js
test('builds a None-first choice list from installed Item packs', () => {
  const choices = buildItemPackChoices([
    pack('private.spells', 'Private Spells', 'Item'),
    pack('private.actors', 'Private Actors', 'Actor'),
    pack('dnd5e.spells', 'SRD Spells', 'Item')
  ]);
  assert.deepEqual(choices, {
    '': 'None',
    'dnd5e.spells': 'SRD Spells',
    'private.spells': 'Private Spells'
  });
});

test('registers a restricted world setting with an empty default', () => {
  registerPrivateSpellCompendiumSetting({ settings, packs, onChange });
  assert.deepEqual(registrations[0], {
    module: 'declan-homebrew-classes',
    key: 'privateSpellCompendium',
    scope: 'world',
    config: true,
    restricted: true,
    type: String,
    default: ''
  });
});
```

Also assert deterministic label sorting, duplicate labels including collection
IDs for disambiguation, idempotent registration, and `onChange` forwarding.

- [ ] **Step 2: Run the focused test and verify failure**

```bash
node --test tests/vessel-spell-settings.test.mjs
```

Expected: FAIL because the settings module does not exist.

- [ ] **Step 3: Implement setting registration**

Register:

```js
settings.register(MODULE_ID, PRIVATE_SPELL_COMPENDIUM_SETTING, {
  name: 'Private Spell Compendium',
  hint: 'Optional Item compendium used to resolve Vessel Sealed Magic spells.',
  scope: 'world',
  config: true,
  restricted: true,
  type: String,
  choices: buildItemPackChoices(packs),
  default: '',
  onChange
});
```

Call it from the existing `Hooks.once('init', ...)` callback in
`vessel-automation.mjs` before registering automation hooks. Keep
`vessel-spellcasting.mjs` responsible only for the custom spellcasting method.

- [ ] **Step 4: Run focused and entry-point tests**

```bash
node --test tests/vessel-spell-settings.test.mjs \
  tests/vessel-spellcasting.test.mjs \
  tests/vessel-automation-hooks.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/vessel/constants.mjs scripts/vessel/spell-settings.mjs \
  scripts/vessel-automation.mjs tests/vessel-spell-settings.test.mjs \
  tests/vessel-spellcasting.test.mjs
git -c commit.gpgsign=false commit -m "feat: add private spell compendium setting"
```

## Task 3: Implement deterministic spell-provider resolution

**Files:**

- Create: `scripts/vessel/spell-provider.mjs`
- Create: `tests/vessel-spell-provider.test.mjs`
- Modify: `scripts/vessel/spell-settings.mjs`

**Interfaces:**

- Consumes:
  `game.packs`,
  `game.settings.get(MODULE_ID, PRIVATE_SPELL_COMPENDIUM_SETTING)`,
  pack `getIndex({ fields: ['name', 'type'] })`, and pack `getDocument(id)`.
- Produces:
  `normalizeSpellName(name): string`,
  `resolveSpellSource(spell, dependencies?): Promise<SpellResolution>`, and
  `invalidateSpellProviderCache(): void`.

Use this result shape:

```js
{
  status: 'resolved' | 'missing' | 'ambiguous' | 'unavailable',
  spellKey: string,
  sourceUuid: string | null,
  provider: 'homebrew' | 'private' | 'srd' | null,
  candidates: Array<{ id: string, name: string, uuid: string }>,
  diagnostics: Array<{ provider: string, code: string, message: string }>
}
```

- [ ] **Step 1: Write failing normalization and precedence tests**

Cover:

```js
assert.equal(normalizeSpellName('  CAFE\u0301   LIGHT  '), 'café light');
```

Use a canonically equivalent composed/decomposed pair for the actual Unicode
equality assertion. Then assert:

- homebrew wins over the selected private pack and SRD;
- the selected private pack wins over SRD;
- exactly one match in the first matching provider resolves;
- two matches inside that provider return `ambiguous`;
- non-spell index entries are ignored;
- matching is exact after normalization, never fuzzy;
- an empty setting skips private resolution silently;
- a stale selected pack adds an unavailable diagnostic and permits SRD
  fallback;
- only packs with `metadata.packageType === "system"` and
  `metadata.packageName === "dnd5e"` participate in SRD fallback; and
- changing the setting invalidates cached indexes.

- [ ] **Step 2: Run the focused test and verify failure**

```bash
node --test tests/vessel-spell-provider.test.mjs
```

Expected: FAIL because the provider module does not exist.

- [ ] **Step 3: Implement provider descriptors and index caching**

Create descriptors in this order:

```js
[
  {
    provider: 'homebrew',
    collections: ['declan-homebrew-classes.homebrew-spells']
  },
  {
    provider: 'private',
    collections: selectedPrivateCollection ? [selectedPrivateCollection] : []
  },
  {
    provider: 'srd',
    collections: dnd5eSystemItemPackCollections
  }
]
```

Normalize with:

```js
String(name ?? '')
  .normalize('NFC')
  .trim()
  .replace(/\s+/gu, ' ')
  .toLocaleLowerCase('en-US');
```

Cache indexes by collection identifier only. Never cache source documents.
Call `getDocument(id)` only after exactly one candidate wins. Confirm the
loaded document still has `type === "spell"` before returning `resolved`.

- [ ] **Step 4: Wire cache invalidation to the setting**

Pass `invalidateSpellProviderCache` as the setting's `onChange` callback from
`vessel-automation.mjs`. The callback must not reconcile actors yet; Stage 4
will own that behavior.

- [ ] **Step 5: Run resolver and settings tests**

```bash
node --test tests/vessel-spell-provider.test.mjs \
  tests/vessel-spell-settings.test.mjs \
  tests/vessel-automation-hooks.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/vessel/spell-provider.mjs \
  scripts/vessel/spell-settings.mjs scripts/vessel-automation.mjs \
  tests/vessel-spell-provider.test.mjs
git -c commit.gpgsign=false commit -m "feat: resolve spells from configured providers"
```

## Task 4: Add the Stage 4 provider boundary without granting spells yet

**Files:**

- Create: `scripts/vessel/sealed-magic-provider.mjs`
- Create: `tests/vessel-sealed-magic-provider.test.mjs`
- Modify: `docs/superpowers/specs/2026-07-28-vessel-automation-design.md`

**Interfaces:**

- Consumes: `resolveSpellSource({ key, name })`.
- Produces:
  `resolveSealedMagicEntry(entry, dependencies?): Promise<SpellResolution>`
  and a documented contract for the later Stage 4 progression reconciler.

This task intentionally does not add spell-list manifests or actor hooks. The
source PDF's subclass tables require a separate Stage 4 content review, and a
resolver foundation can be tested and released independently without granting
an incorrect spell.

- [ ] **Step 1: Write the failing boundary tests**

```js
test('forwards only the content-free spell identity to the resolver', async () => {
  const calls = [];
  const result = await resolveSealedMagicEntry({
    key: 'cursed-3-hellish-rebuke',
    name: 'Hellish Rebuke',
    subclass: 'the-cursed',
    vesselLevel: 3
  }, {
    resolve: async identity => {
      calls.push(identity);
      return { status: 'missing', spellKey: identity.key };
    }
  });
  assert.deepEqual(calls, [{
    key: 'cursed-3-hellish-rebuke',
    name: 'Hellish Rebuke'
  }]);
  assert.equal(result.status, 'missing');
});
```

Also reject missing keys, blank names, invalid subclass identifiers, and Vessel
levels outside `1..20` before calling the resolver.

- [ ] **Step 2: Run the focused test and verify failure**

```bash
node --test tests/vessel-sealed-magic-provider.test.mjs
```

Expected: FAIL because the boundary module does not exist.

- [ ] **Step 3: Implement the narrow adapter**

Validate and freeze the input entry. Forward only `{ key, name }` to the generic
resolver and return the resolver's structured result unchanged. Do not add
commercial metadata, spell rules, actor mutations, or hook registration.

- [ ] **Step 4: Clarify the Stage 4 design dependency**

Amend the Stage 4 section of the original Vessel design to link to the optional
provider spec and state that dynamic provider UUIDs are resolved at runtime;
they cannot be embedded as fixed advancement UUIDs. Preserve the requirement
that Sealed Magic spells do not count against spells known.

- [ ] **Step 5: Run the focused tests**

```bash
node --test tests/vessel-sealed-magic-provider.test.mjs \
  tests/vessel-spell-provider.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/vessel/sealed-magic-provider.mjs \
  tests/vessel-sealed-magic-provider.test.mjs \
  docs/superpowers/specs/2026-07-28-vessel-automation-design.md
git -c commit.gpgsign=false commit -m "feat: expose Sealed Magic provider contract"
```

## Task 5: Document public-module setup and troubleshooting

**Files:**

- Modify: `README.md`
- Create: `docs/private-spell-compendium.md`
- Create: `tests/private-spell-docs.test.mjs`

**Interfaces:**

- Consumes: setting label and provider contract from Tasks 2 and 3.
- Produces: stable GM-facing installation/configuration documentation that the
  private companion README can reproduce.

- [ ] **Step 1: Write failing documentation contract tests**

Assert that both public documents contain:

```js
[
  'Private Spell Compendium',
  'Game Settings',
  'Configure Settings',
  'Module Settings',
  'Item compendium',
  'None'
]
```

Also assert that neither document contains `declan-private-spells`, a GitHub URL
for the private repository, or instructions to copy private files into the
public module.

- [ ] **Step 2: Run the focused test and verify failure**

```bash
node --test tests/private-spell-docs.test.mjs
```

Expected: FAIL because the setup guide does not exist.

- [ ] **Step 3: Add the setup guide and README summary**

Document these exact GM steps:

1. Install and enable Declan's Homebrew Classes and the private spell module.
2. Open Game Settings → Configure Settings → Module Settings.
3. Under Declan's Homebrew Classes, find Private Spell Compendium.
4. Select the private module's Item compendium.
5. Save and reload if Foundry requests it.
6. If the pack is missing, verify that the private module is enabled and
   declares a dnd5e Item pack.

Explain source precedence, duplicate warnings, stale-setting fallback, and why
the public documentation does not link the private repository.

- [ ] **Step 4: Run the documentation test**

```bash
node --test tests/private-spell-docs.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/private-spell-compendium.md \
  tests/private-spell-docs.test.mjs
git -c commit.gpgsign=false commit -m "docs: explain private spell provider setup"
```

## Task 6: Verify the complete public-module change

**Files:**

- Modify only if verification exposes a defect in a Task 1-5 file.

**Interfaces:**

- Consumes: all prior public-module tasks.
- Produces: evidence that the branch is safe to review and merge.

- [ ] **Step 1: Run the public content guard**

```bash
node scripts/verify-public-content.mjs
```

Expected: `ok: true`, zero errors, `spellCount: 16`.

- [ ] **Step 2: Run the complete Node test suite**

```bash
node --test tests/*.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 3: Validate every public source pack**

```bash
cd /Users/c7g6g8/Development/dnd5e-pdf-importer/emit
node -e 'import("./verify.mjs").then(async m=>{for(const [source,packName] of [["/Users/c7g6g8/Development/declan-homebrew-classes/.worktrees/optional-private-spells/src","homebrew-classes"],["/Users/c7g6g8/Development/declan-homebrew-classes/.worktrees/optional-private-spells/spells-src","homebrew-spells"],["/Users/c7g6g8/Development/declan-homebrew-classes/.worktrees/optional-private-spells/aspects-src","vessel-aspects"],["/Users/c7g6g8/Development/declan-homebrew-classes/.worktrees/optional-private-spells/archon-src","vessel-archon-forms"],["/Users/c7g6g8/Development/declan-homebrew-classes/.worktrees/optional-private-spells/fighting-styles-src","warlord-fighting-styles"]]){const r=await m.verifyPack(source,{packName});console.log(packName,r.ok,r.errors.length);if(!r.ok){r.errors.forEach(e=>console.error(e));process.exitCode=1}}})'
node /Users/c7g6g8/Development/declan-homebrew-classes/.worktrees/optional-private-spells/scripts/verify-warlord-sources.mjs
```

Expected: every named pack reports `true 0`, and both Warlord validations report
zero errors.

- [ ] **Step 4: Inspect branch scope**

```bash
git status --short
git diff --check main...HEAD
git log --oneline --decorate main..HEAD
```

Expected: clean worktree, no whitespace errors, and only the intentional
content-policy/provider/docs commits.

- [ ] **Step 5: Request code review**

Use `superpowers:requesting-code-review`. Address any correctness or scope issue
before declaring the public branch ready. Do not merge or push.

## Task 7: Create the content-empty private companion locally

This task starts only after Task 6 passes. It is a separate Git repository at
`/Users/c7g6g8/Development/declan-private-spells`; it must never be placed
inside the public worktree.

**Files:**

- Create: `/Users/c7g6g8/Development/declan-private-spells/.gitignore`
- Create: `/Users/c7g6g8/Development/declan-private-spells/README.md`
- Create: `/Users/c7g6g8/Development/declan-private-spells/module.json`
- Create:
  `/Users/c7g6g8/Development/declan-private-spells/spells-src/_folder.yml`
- Create:
  `/Users/c7g6g8/Development/declan-private-spells/scripts/verify-private-module.mjs`
- Create:
  `/Users/c7g6g8/Development/declan-private-spells/tests/module-contract.test.mjs`
- Build:
  `/Users/c7g6g8/Development/declan-private-spells/packs/private-spells/`

**Interfaces:**

- Produces module ID `declan-private-spells` and Item pack collection
  `declan-private-spells.private-spells`.
- The public module depends only on the configured collection string selected
  by the GM, never on these fixed IDs.

- [ ] **Step 1: Create the directory and initialize private-module tests**

Create the directory without a remote and initialize Git:

```bash
mkdir /Users/c7g6g8/Development/declan-private-spells
cd /Users/c7g6g8/Development/declan-private-spells
git init -b main
git config user.name declan34
git config user.email 33579054+declan34@users.noreply.github.com
```

The first test loads `module.json` and asserts:

```js
assert.equal(manifest.id, 'declan-private-spells');
assert.deepEqual(manifest.compatibility, { minimum: '13', verified: '13' });
assert.deepEqual(manifest.relationships.systems, [{
  id: 'dnd5e',
  type: 'system',
  compatibility: { minimum: '5.3.3' }
}]);
assert.deepEqual(manifest.packs, [{
  name: 'private-spells',
  label: 'Private Campaign Spells',
  path: 'packs/private-spells',
  type: 'Item',
  system: 'dnd5e'
}]);
```

Also assert that README contains the exact six setting steps from Task 5 and
the literal collection identifier
`declan-private-spells.private-spells`.

- [ ] **Step 2: Run the private-module test and verify failure**

```bash
node --test tests/module-contract.test.mjs
```

Expected: FAIL because the manifest and README do not exist.

- [ ] **Step 3: Add the content-empty module skeleton**

Use version `0.1.0`, omit public `url`, `manifest`, and `download` fields, and
declare only the one Item pack. The source folder document must have a stable
16-character alphanumeric `_id`, `_key`, and `lastModifiedBy`:

```yaml
name: Private Campaign Spells
type: Item
folder: null
_id: privSpellFold001
_key: '!folders!privSpellFold001'
_stats:
  lastModifiedBy: prvbuilder000001
```

The manifest identity is:

```json
{
  "id": "declan-private-spells",
  "title": "Declan's Private Spells",
  "description": "Private campaign spell compendium.",
  "version": "0.1.0",
  "authors": [{ "name": "declan34" }],
  "compatibility": { "minimum": "13", "verified": "13" },
  "relationships": {
    "systems": [{
      "id": "dnd5e",
      "type": "system",
      "compatibility": { "minimum": "5.3.3" }
    }]
  },
  "packs": [{
    "name": "private-spells",
    "label": "Private Campaign Spells",
    "path": "packs/private-spells",
    "type": "Item",
    "system": "dnd5e"
  }]
}
```

`.gitignore` must include:

```gitignore
module.zip
packs/*/LOCK
.DS_Store
```

- [ ] **Step 4: Write the private README**

Include:

- manual installation from a privately shared `module.zip`;
- the exact Game Settings path and selection steps;
- expected module ID `declan-private-spells`;
- expected pack collection `declan-private-spells.private-spells`;
- troubleshooting when the pack is absent;
- a warning that the repository and release assets must remain private;
- a statement that the repository is for the owner's private game;
- a reminder to verify access rights and source ownership before adding data;
- the compile and `verifyPack` commands; and
- a warning never to copy its source, pack, or archive into
  `declan-homebrew-classes`.

- [ ] **Step 5: Implement the private-module verifier**

`verify-private-module.mjs` must:

- reject missing or non-private-safe manifest fields;
- require exactly the configured Item pack;
- reject symlinks pointing outside the repository;
- reject any path containing the public module's `packs/` destination;
- call the importer's `verifyPack` for `spells-src`; and
- print only counts and paths, never spell descriptions.

- [ ] **Step 6: Compile the empty pack and run verification**

```bash
cd /Users/c7g6g8/Development/dnd5e-pdf-importer/emit
node -e 'import("@foundryvtt/foundryvtt-cli").then(m=>m.compilePack("/Users/c7g6g8/Development/declan-private-spells/spells-src","/Users/c7g6g8/Development/declan-private-spells/packs/private-spells",{yaml:true,recursive:true}))'
cd /Users/c7g6g8/Development/declan-private-spells
node --test tests/module-contract.test.mjs
node scripts/verify-private-module.mjs
```

Expected: tests PASS and verification reports `ok: true`, zero errors. Remove
only a generated `packs/private-spells/LOCK` file if present.

- [ ] **Step 7: Commit the local private skeleton**

```bash
git add .gitignore README.md module.json spells-src \
  packs/private-spells scripts/verify-private-module.mjs \
  tests/module-contract.test.mjs
git -c commit.gpgsign=false commit -m "chore: scaffold private spell module"
```

Do not add spell documents, create the GitHub repository, add a remote, or push
in this task.

## Task 8: Handoff for private GitHub creation and later Stage 4 work

**Files:**

- No file changes.

**Interfaces:**

- Consumes: the verified public feature branch and local private companion.
- Produces: two explicit user approval gates.

- [ ] **Step 1: Report the verified state**

Report:

- public branch name and commits;
- public test and `verifyPack` results;
- removed public official-spell document count;
- retained authorized-homebrew spell count;
- private local commit;
- private module/pack IDs; and
- confirmation that no commercial spell content was created.

- [ ] **Step 2: Request approval for repository integration**

Ask separately for:

1. approval to merge the public feature branch into local `main`; and
2. approval to create `declan34/declan-private-spells` with GitHub visibility
   `PRIVATE` and push the content-empty skeleton.

Before any private push, create with:

```bash
gh repo create declan34/declan-private-spells --private \
  --source /Users/c7g6g8/Development/declan-private-spells \
  --remote origin
gh repo view declan34/declan-private-spells --json nameWithOwner,visibility
```

Proceed to `git push -u origin main` only if the returned visibility is exactly
`PRIVATE`. Stop immediately if it is not.

- [ ] **Step 3: Defer releases and Stage 4 grants**

Do not release either module in this plan. The next design/plan should audit the
six authoritative Sealed Magic tables, add the content-free spell manifest, and
make the Stage 4 progression reconciler consume
`resolveSealedMagicEntry()`.
