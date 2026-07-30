import { resolveSpellSource } from './spell-provider.mjs';

const SEALED_MAGIC_SUBCLASSES = new Set([
  'the-ascended',
  'the-cataclysm',
  'the-cursed',
  'the-fallen',
  'the-formless',
  'the-trickster'
]);

function nonBlankString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new TypeError('A Sealed Magic entry is required.');
  }
  if (!nonBlankString(entry.key)) {
    throw new TypeError('A Sealed Magic entry requires a non-blank key.');
  }
  if (!nonBlankString(entry.name)) {
    throw new TypeError('A Sealed Magic entry requires a non-blank name.');
  }
  if (!SEALED_MAGIC_SUBCLASSES.has(entry.subclass)) {
    throw new TypeError('A Sealed Magic entry requires a valid Vessel subclass.');
  }
  if (!Number.isInteger(entry.vesselLevel) || entry.vesselLevel < 1 || entry.vesselLevel > 20) {
    throw new TypeError('A Sealed Magic entry requires a Vessel level from 1 to 20.');
  }
}

/**
 * Resolves a validated Sealed Magic manifest entry without granting it to an actor.
 *
 * Stage 4 progression reconciliation supplies content-free entries and consumes the
 * structured resolver result to decide whether an actor-owned spell can be created.
 * Provider UUIDs are resolved at runtime and must not be stored as fixed advancement
 * UUIDs. This boundary neither defines a spell manifest nor registers actor hooks.
 */
export async function resolveSealedMagicEntry(entry, dependencies = {}) {
  validateEntry(entry);
  Object.freeze(entry);

  const resolve = dependencies.resolve ?? resolveSpellSource;
  if (typeof resolve !== 'function') {
    throw new TypeError('The Sealed Magic resolver must be a function.');
  }

  return resolve(Object.freeze({ key: entry.key, name: entry.name }));
}
