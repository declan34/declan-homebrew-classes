# Final Warlord Branch Fix — Migration Report

## Scope

- Bumped the Warlord actor migration from version 3 to version 4.
- Added the exact 40 supported Warlord Exploit identifiers as a runtime
  contract.
- Hardened Exploit source loading around actor ownership, index completeness,
  identifier and document identity, uniqueness, and final closure.
- Limited existing Exploit effect repairs to module-owned mechanics while
  preserving player presentation, enabled state, custom system data, and
  foreign flags.
- Retained legacy Fighting Style effect IDs and remapped every canonical
  activity effect reference to the retained embedded effect.
- Reconciled only `system.prerequisites.level` for actor-owned Fighting Style
  items.

## Root Causes

- Exploit ownership was inferred by excluding known non-Exploit identifiers,
  so unrelated actor items could be treated as Exploits and incomplete pack
  reads could silently close over only a subset.
- Existing Exploit effects were replaced field-by-field from canonical data,
  including player-owned presentation and state.
- Fighting Style activities were repaired before accounting for a canonical
  effect that already existed under a legacy embedded-document ID.
- Fighting Style prerequisite metadata was not part of migration.

## TDD Evidence

The focused migration suite first failed on the new contracts:

- unsupported actor items still triggered an Exploit pack lookup;
- incomplete Exploit indexes did not throw;
- the 40-item identifier contract did not exist;
- canonical effect repair overwrote player-owned effect fields;
- Fighting Style activities retained nonexistent canonical effect IDs.

After implementation, the focused migration suite passes all 28 tests,
including retry safety, legacy effect-link idempotency, preservation of both
enabled and disabled effects, and migration of an actor previously flagged at
version 3.

## Validation

- `node --test tests/warlord-migration.test.mjs`: 28/28 passing.
- `git diff --check`: clean.

