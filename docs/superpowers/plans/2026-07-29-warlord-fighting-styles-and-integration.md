# Warlord Fighting Styles and Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native, player-controlled mechanics for all seven current Warlord Fighting Styles, migrate existing actors safely, document the complete Warlord experience, and validate all generated packs without publishing a release.

**Architecture:** Fighting Style YAML owns Enchant, Use, Utility, and Active Effect documents. Effects with eligibility that Foundry cannot observe remain disabled-by-default or explicitly player-removed; no equipment, attack, save, or mount watcher is added. The existing Warlord migration selectively merges only module-role-tagged structures.

**Tech Stack:** Foundry VTT 13, dnd5e 5.3.3, ECMAScript modules, YAML compendium sources, Node.js built-in test runner, `js-yaml`, `@foundryvtt/foundryvtt-cli`

## Global Constraints

- Complete the Warlord Core Foundation and Exploit Suite plans first.
- Target Foundry VTT 13 and dnd5e 5.3.3 or newer.
- Do not add equipment, mount, attack, save, or trigger watcher hooks.
- Do not automatically remove effects when Foundry cannot represent the exact expiration trigger.
- Do not control another player's token or rewrite attack/save resolution.
- Preserve user-created activities, effects, names, descriptions, and flags.
- Keep every Foundry document ID exactly 16 alphanumeric characters.
- YAML source is authoritative and compiled LevelDB must match.
- Run `verifyPack`; it must report `{"ok":true,"errors":0}`.
- Do not bump `module.json`, rebuild `module.zip`, push, tag, or publish without explicit user approval.
- Never add a `Co-Authored-By` trailer.

## File Structure

- Modify all seven files in `fighting-styles-src/`.
- Create `tests/warlord-fighting-styles-content.test.mjs`.
- Modify `scripts/warlord/migration.mjs`.
- Modify `tests/warlord-migration.test.mjs`.
- Create `tests/warlord-fighting-styles-compiled-pack.test.mjs`.
- Modify `README.md`.
- Create `docs/warlord-live-smoke-test.md`.
- Rebuild `packs/warlord-fighting-styles/`.

---

### Task 1: Native Fighting Style documents

**Files:**
- Modify: `fighting-styles-src/balanced-fighting.yml`
- Modify: `fighting-styles-src/classical-swordplay.yml`
- Modify: `fighting-styles-src/defensive-fighting.yml`
- Modify: `fighting-styles-src/mounted-warrior.yml`
- Modify: `fighting-styles-src/protection.yml`
- Modify: `fighting-styles-src/standard-bearer.yml`
- Modify: `fighting-styles-src/tactical-fighting.yml`
- Create: `tests/warlord-fighting-styles-content.test.mjs`

**Interfaces:**
- Consumes: Warlord style roles from the core plan.
- Produces: seven exact native/manual style mappings.

- [ ] **Step 1: Write failing source tests**

Load all seven YAML documents and assert:

```js
assert.equal(styles.length, 7);
assert.equal(activity('balanced-fighting').type, 'enchant');
assert.equal(activity('classical-swordplay').type, 'enchant');
assert.equal(effect('classical-swordplay', 'ac').disabled, true);
assert.equal(effect('defensive-fighting', 'ac').disabled, true);
assert.equal(activity('mounted-warrior').type, 'utility');
assert.equal(activity('protection').activation.type, 'reaction');
assert.equal(activity('protection').roll.formula, '@prof');
assert.equal(activity('standard-bearer').activation.type, 'reaction');
assert.equal(activity('tactical-fighting', 'help').activation.type, 'bonus');
assert.equal(activity('tactical-fighting', 'search'), undefined);
```

Every module-owned activity and effect must carry:

```yaml
flags:
  declan-homebrew-classes:
    warlord:
      role: fighting-style-activity
      style: protection
      mechanic: proficiency-comparison
```

or `role: fighting-style-effect` for effects.

- [ ] **Step 2: Run to verify RED**

```bash
node --test tests/warlord-fighting-styles-content.test.mjs
```

Expected: failures because all seven items currently have no activities/effects.

- [ ] **Step 3: Add the exact native mappings**

Implement:

| Style | Native content | Player-managed boundary |
| --- | --- | --- |
| Balanced Fighting | Enchant selected weapon with `+2` damage | player selects eligible melee weapon |
| Classical Swordplay | Enchant selected finesse weapon with `+2` attack; disabled `+1` AC effect | player enables AC only while eligible |
| Defensive Fighting | disabled `+1` AC effect | player enables only while armor requirement is met |
| Mounted Warrior | Use targets self plus controlled/selected mount and applies `+1` AC | player removes on dismount |
| Protection | reaction Use, one protected creature, displays `@prof` | player compares with triggering attack |
| Standard Bearer | reaction applies advantage to next save | player removes after that save if native expiry cannot |
| Tactical Fighting | bonus-action Help applies next-attack advantage | Search remains Post to Chat |

Enchant changes must use supported dnd5e 5.3.3 enchantment fields discovered
from the 5.3.3 Enchant activity/effect schema. Tests must assert the resulting
attack/damage change keys, not merely the activity type.

Effects use dnd5e Active Effect changes:

```yaml
- key: system.attributes.ac.bonus
  mode: 2
  value: '1'
  priority: 20
```

Use `system.attributes.ac.bonus`; it is the documented dnd5e 5.3.x additive AC
field. Do not alter `system.attributes.ac.calc`.

- [ ] **Step 4: Run focused and complete tests**

```bash
node --test tests/warlord-fighting-styles-content.test.mjs
node --test tests/*.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add fighting-styles-src tests/warlord-fighting-styles-content.test.mjs
git -c commit.gpgSign=false commit -m "feat: add native Warlord Fighting Styles"
```

---

### Task 2: Fighting Style actor migration

**Files:**
- Modify: `scripts/warlord/migration.mjs`
- Modify: `tests/warlord-migration.test.mjs`

**Interfaces:**
- Consumes: canonical style items from `declan-homebrew-classes.warlord-fighting-styles`.
- Produces: migration version 3 with selective activity/effect repair.

- [ ] **Step 1: Add failing migration tests**

Fixtures must include:

- Balanced Fighting with a user activity;
- Defensive Fighting with a user-created AC effect;
- Mounted Warrior with a renamed item and custom description;
- a foreign module flag;
- a partial canonical effect missing from the actor.

Assert:

```js
assert.ok(balanced.system.activities.canonicalEnchantId);
assert.ok(balanced.system.activities.userActivityId);
assert.ok(defensive.effects.some(effect => effect.id === userEffectId));
assert.ok(defensive.effects.some(effect => role(effect) ===
  'fighting-style-effect'));
assert.equal(mounted.name, customName);
assert.equal(mounted.system.description.value, customDescription);
assert.deepEqual(mounted.flags.otherModule, foreignFlags);
```

- [ ] **Step 2: Run to verify RED**

```bash
node --test tests/warlord-migration.test.mjs
```

Expected: style migration assertions fail.

- [ ] **Step 3: Extend migration**

Load canonical style items only for actor-owned style identifiers. Reuse
role-selective activity repair. For effects, merge by exact module role plus
style/mechanic flags; create a missing canonical effect with `keepId: true`,
repair only its mechanical changes/duration/role flags, and preserve all unknown
effects.

Increment:

```js
export const WARLORD_MIGRATION_VERSION = 3;
```

Preserve current disabled state for an existing player-managed style effect.
Newly created eligibility effects default to disabled.

- [ ] **Step 4: Run focused and complete tests**

```bash
node --test tests/warlord-migration.test.mjs
node --test tests/*.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/warlord/migration.mjs tests/warlord-migration.test.mjs
git -c commit.gpgSign=false commit -m "feat: migrate Warlord Fighting Styles"
```

---

### Task 3: Compile and validate the Fighting Style pack

**Files:**
- Create: `tests/warlord-fighting-styles-compiled-pack.test.mjs`
- Rebuild: `packs/warlord-fighting-styles/`

**Interfaces:**
- Produces: exact YAML-to-LevelDB parity for all seven styles.

- [ ] **Step 1: Write the failing compiled-pack test**

Copy the pack to a temporary directory, extract it, and compare every style's:

```js
[
  '_id', 'system.identifier', 'system.activities',
  'system.enchant', 'effects', 'flags'
]
```

Assert seven unique source and compiled item IDs. Never open the committed
LevelDB directly.

- [ ] **Step 2: Run to verify RED**

```bash
node --test tests/warlord-fighting-styles-compiled-pack.test.mjs
```

Expected: stale-pack failure.

- [ ] **Step 3: Compile and verify**

From the importer `emit` directory:

```bash
node -e 'import("@foundryvtt/foundryvtt-cli").then(m=>m.compilePack("/Users/c7g6g8/Development/declan-homebrew-classes/fighting-styles-src","/Users/c7g6g8/Development/declan-homebrew-classes/packs/warlord-fighting-styles",{yaml:true,recursive:true}))'
```

Remove only `packs/warlord-fighting-styles/LOCK` if left behind.

Run:

```bash
node -e 'import("./verify.mjs").then(async m=>{const r=await m.verifyPack("/Users/c7g6g8/Development/declan-homebrew-classes/fighting-styles-src",{packName:"warlord-fighting-styles"});console.log(JSON.stringify({ok:r.ok,errors:r.errors.length}));r.errors.forEach(e=>console.log(e))})'
```

Expected: `{"ok":true,"errors":0}`.

Then:

```bash
cd /Users/c7g6g8/Development/declan-homebrew-classes
node --test tests/*.test.mjs
git diff --check
```

Expected: all tests pass and the diff check is silent.

- [ ] **Step 4: Commit**

```bash
git add packs/warlord-fighting-styles tests/warlord-fighting-styles-compiled-pack.test.mjs
git -c commit.gpgSign=false commit -m "build: compile Warlord Fighting Styles"
```

---

### Task 4: User documentation and complete regression gate

**Files:**
- Modify: `README.md`
- Create: `docs/warlord-live-smoke-test.md`

**Interfaces:**
- Consumes: completed core, Exploit, and style plans.
- Produces: DM/player documentation and a release-ready verification record.

- [ ] **Step 1: Add Warlord documentation**

Add this section to `README.md`:

```markdown
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
```

- [ ] **Step 2: Create the live smoke-test document**

Copy the Core and Exploit checkpoints from the preceding plans and add:

```markdown
## Fighting Styles

- Enchant one eligible weapon with Balanced Fighting and verify +2 damage.
- Enchant one finesse weapon with Classical Swordplay and verify +2 attack.
- Enable and disable Classical Swordplay and Defensive Fighting AC effects.
- Apply Mounted Warrior to the Warlord and mount, then remove both on dismount.
- Use Protection and verify it displays the Warlord's proficiency bonus only.
- Use Standard Bearer, roll the target's next save, and remove the effect.
- Use Tactical Fighting's Help activity and confirm Search remains Post to Chat.
```

End with a table for Foundry version, dnd5e version, module commit, tester,
pass/fail, and notes.

- [ ] **Step 3: Run the complete automated gate**

```bash
node --test tests/*.test.mjs
git diff --check
git status --short
```

Expected: all tests pass, diff check is silent, and status lists only the two
documentation files.

Run all three source validators from the importer `emit` directory and require
`{"ok":true,"errors":0}` for `src`, `exploits-src`, and
`fighting-styles-src`.

- [ ] **Step 4: Commit documentation**

```bash
git add README.md docs/warlord-live-smoke-test.md
git -c commit.gpgSign=false commit -m "docs: explain Warlord automation"
```

- [ ] **Step 5: Stop before release mutation**

Report the tested commit and live Foundry checklist to the user. Do not edit
`module.json` version, rebuild `module.zip`, push, tag, or create a GitHub release
until the user explicitly authorizes a release version and publication.
