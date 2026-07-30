import {
  MODULE_ID,
  PRIVATE_SPELL_COMPENDIUM_SETTING
} from './constants.mjs';

const HOMEBREW_SPELL_COLLECTION = 'declan-homebrew-classes.homebrew-spells';
const indexCache = new Map();

export function normalizeSpellName(name) {
  return String(name ?? '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('en-US');
}

export function invalidateSpellProviderCache() {
  indexCache.clear();
}

function valuesOf(collection) {
  return Array.from(collection?.values?.() ?? collection ?? []);
}

function itemPack(pack) {
  return (pack?.documentName ?? pack?.metadata?.type) === 'Item';
}

function getPack(packs, collection) {
  if (!collection) return null;
  if (typeof packs?.get === 'function') return packs.get(collection) ?? null;
  return valuesOf(packs).find(pack => pack?.collection === collection) ?? null;
}

function getSettingsValue(dependencies) {
  if (typeof dependencies?.getSetting === 'function') {
    return dependencies.getSetting();
  }
  const settings = dependencies?.settings ?? globalThis.game?.settings;
  return settings?.get?.(MODULE_ID, PRIVATE_SPELL_COMPENDIUM_SETTING) ?? '';
}

function candidateFrom(entry, collection) {
  const id = entry?._id ?? entry?.id;
  return {
    id,
    name: entry?.name ?? '',
    uuid: entry?.uuid ?? `Compendium.${collection}.${id}`
  };
}

function result({
  status,
  spellKey,
  sourceUuid = null,
  provider = null,
  candidates = [],
  diagnostics = []
}) {
  return { status, spellKey, sourceUuid, provider, candidates, diagnostics };
}

async function getCachedIndex(pack) {
  const collection = pack.collection;
  if (!indexCache.has(collection)) {
    const index = Promise.resolve(pack.getIndex({ fields: ['name', 'type'] }))
      .then(valuesOf)
      .catch(error => {
        indexCache.delete(collection);
        throw error;
      });
    indexCache.set(collection, index);
  }
  return indexCache.get(collection);
}

function providers(packs, selectedPrivateCollection) {
  const dnd5eSystemItemPackCollections = valuesOf(packs)
    .filter(pack => itemPack(pack)
      && pack.metadata?.packageType === 'system'
      && pack.metadata?.packageName === 'dnd5e')
    .map(pack => pack.collection)
    .filter(Boolean)
    .sort((first, second) => first.localeCompare(second));

  return [
    {
      provider: 'homebrew',
      collections: [HOMEBREW_SPELL_COLLECTION]
    },
    {
      provider: 'private',
      collections: selectedPrivateCollection ? [selectedPrivateCollection] : []
    },
    {
      provider: 'srd',
      collections: dnd5eSystemItemPackCollections
    }
  ];
}

export async function resolveSpellSource(spell, dependencies = {}) {
  const normalizedName = normalizeSpellName(spell?.name ?? spell);
  const spellKey = typeof spell?.key === 'string' && spell.key.trim().length > 0
    ? spell.key
    : normalizedName;
  const packs = dependencies.packs ?? globalThis.game?.packs;
  const selectedPrivateCollection = getSettingsValue(dependencies);
  const diagnostics = [];

  for (const descriptor of providers(packs, selectedPrivateCollection)) {
    const candidates = [];

    for (const collection of descriptor.collections) {
      const pack = getPack(packs, collection);
      if (!pack) {
        if (descriptor.provider === 'private') {
          diagnostics.push({
            provider: 'private',
            code: 'pack-unavailable',
            message: `Configured private spell compendium "${collection}" is unavailable.`
          });
        }
        continue;
      }

      if (descriptor.provider === 'private' && !itemPack(pack)) {
        diagnostics.push({
          provider: 'private',
          code: 'pack-invalid',
          message: `Configured private spell compendium "${collection}" must contain Item documents.`
        });
        continue;
      }

      try {
        const index = await getCachedIndex(pack);
        candidates.push(...index
          .filter(entry => entry?.type === 'spell'
            && normalizeSpellName(entry.name) === normalizedName)
          .map(entry => ({
            pack,
            candidate: candidateFrom(entry, collection)
          })));
      } catch (error) {
        diagnostics.push({
          provider: descriptor.provider,
          code: 'index-unavailable',
          message: `Spell index for "${collection}" is unavailable.`
        });
      }
    }

    candidates.sort((first, second) => first.candidate.id.localeCompare(second.candidate.id));
    if (candidates.length === 0) continue;

    const publicCandidates = candidates.map(({ candidate }) => candidate);

    if (candidates.length > 1) {
      return result({
        status: 'ambiguous',
        spellKey,
        provider: descriptor.provider,
        candidates: publicCandidates,
        diagnostics
      });
    }

    const { candidate, pack } = candidates[0];
    try {
      const source = await pack?.getDocument(candidate.id);
      if (source?.type !== 'spell') {
        diagnostics.push({
          provider: descriptor.provider,
          code: 'document-unavailable',
          message: `Spell document "${candidate.id}" is unavailable.`
        });
        return result({
          status: 'unavailable',
          spellKey,
          provider: descriptor.provider,
          candidates: publicCandidates,
          diagnostics
        });
      }
      return result({
        status: 'resolved',
        spellKey,
        sourceUuid: source.uuid ?? candidate.uuid,
        provider: descriptor.provider,
        candidates: publicCandidates,
        diagnostics
      });
    } catch (error) {
      diagnostics.push({
        provider: descriptor.provider,
        code: 'document-unavailable',
        message: `Spell document "${candidate.id}" is unavailable.`
      });
      return result({
        status: 'unavailable',
        spellKey,
        provider: descriptor.provider,
        candidates: publicCandidates,
        diagnostics
      });
    }
  }

  return result({
    status: diagnostics.length > 0 ? 'unavailable' : 'missing',
    spellKey,
    diagnostics
  });
}
