import test from 'node:test';
import assert from 'node:assert/strict';

import {
  invalidateSpellProviderCache,
  normalizeSpellName,
  resolveSpellSource
} from '../scripts/vessel/spell-provider.mjs';
import { registerPrivateSpellCompendiumSetting } from '../scripts/vessel/spell-settings.mjs';

const HOMEBREW_COLLECTION = 'declan-homebrew-classes.homebrew-spells';

function item(id, name, type = 'spell') {
  return {
    _id: id,
    name,
    type,
    uuid: `Compendium.test.${id}`
  };
}

function spellPack(collection, entries, metadata = {}) {
  const documents = new Map(entries.map(entry => [entry._id, {
    id: entry._id,
    name: entry.name,
    type: entry.type,
    uuid: entry.uuid
  }]));
  return {
    collection,
    documentName: 'Item',
    metadata,
    getIndexCalls: 0,
    getDocumentCalls: 0,
    async getIndex(options) {
      this.getIndexCalls += 1;
      assert.deepEqual(options, { fields: ['name', 'type'] });
      return entries;
    },
    async getDocument(id) {
      this.getDocumentCalls += 1;
      return documents.get(id) ?? null;
    }
  };
}

function dependencies(packs, selectedPrivateCollection = '') {
  return {
    packs: new Map(packs.map(pack => [pack.collection, pack])),
    getSetting: () => selectedPrivateCollection
  };
}

test('normalizes canonically equivalent spell names for exact matching', () => {
  const decomposed = '  CAFE\u0301   LIGHT  ';
  const composed = 'café light';

  assert.equal(normalizeSpellName(decomposed), composed);
  assert.equal(normalizeSpellName(composed), composed);
});

test('resolves the homebrew provider before private and SRD matches', async () => {
  invalidateSpellProviderCache();
  const homebrew = spellPack(HOMEBREW_COLLECTION, [item('homebrew', 'Moonbeam')]);
  const privatePack = spellPack('private.spells', [item('private', 'Moonbeam')]);
  const srd = spellPack('dnd5e.spells', [item('srd', 'Moonbeam')], {
    packageType: 'system', packageName: 'dnd5e'
  });

  const result = await resolveSpellSource({ name: ' moonbeam ' }, dependencies(
    [homebrew, privatePack, srd],
    privatePack.collection
  ));

  assert.equal(result.status, 'resolved');
  assert.equal(result.provider, 'homebrew');
  assert.equal(result.sourceUuid, 'Compendium.test.homebrew');
  assert.equal(privatePack.getIndexCalls, 0);
  assert.equal(srd.getIndexCalls, 0);
});

test('resolves the selected private provider before SRD matches', async () => {
  invalidateSpellProviderCache();
  const privatePack = spellPack('private.spells', [item('private', 'Moonbeam')]);
  const srd = spellPack('dnd5e.spells', [item('srd', 'Moonbeam')], {
    packageType: 'system', packageName: 'dnd5e'
  });

  const result = await resolveSpellSource({ name: 'Moonbeam' }, dependencies(
    [privatePack, srd], privatePack.collection
  ));

  assert.equal(result.status, 'resolved');
  assert.equal(result.provider, 'private');
  assert.equal(result.sourceUuid, 'Compendium.test.private');
  assert.equal(srd.getIndexCalls, 0);
});

test('resolves exactly one exact spell match from the first matching provider', async () => {
  invalidateSpellProviderCache();
  const homebrew = spellPack(HOMEBREW_COLLECTION, [item('shield', 'Shield')]);

  const result = await resolveSpellSource({ name: ' SHIELD ' }, dependencies([homebrew]));

  assert.deepEqual(result, {
    status: 'resolved',
    spellKey: 'shield',
    sourceUuid: 'Compendium.test.shield',
    provider: 'homebrew',
    candidates: [{ id: 'shield', name: 'Shield', uuid: 'Compendium.test.shield' }],
    diagnostics: []
  });
  assert.equal(homebrew.getDocumentCalls, 1);
});

test('reports ambiguity when the first matching provider has two normalized matches', async () => {
  invalidateSpellProviderCache();
  const homebrew = spellPack(HOMEBREW_COLLECTION, [
    item('one', 'Magic Missile'),
    item('two', 'magic   missile')
  ]);

  const result = await resolveSpellSource({ name: 'magic missile' }, dependencies([homebrew]));

  assert.equal(result.status, 'ambiguous');
  assert.equal(result.provider, 'homebrew');
  assert.deepEqual(result.candidates.map(candidate => candidate.id), ['one', 'two']);
  assert.equal(homebrew.getDocumentCalls, 0);
});

test('ignores non-spell index entries', async () => {
  invalidateSpellProviderCache();
  const homebrew = spellPack(HOMEBREW_COLLECTION, [
    item('feature', 'Shield', 'feat'),
    item('spell', 'Shield')
  ]);

  const result = await resolveSpellSource({ name: 'Shield' }, dependencies([homebrew]));

  assert.equal(result.status, 'resolved');
  assert.equal(result.sourceUuid, 'Compendium.test.spell');
});

test('does not resolve an index match whose loaded document is no longer a spell', async () => {
  invalidateSpellProviderCache();
  const homebrew = spellPack(HOMEBREW_COLLECTION, [item('shield', 'Shield')]);
  homebrew.getDocument = async () => ({
    id: 'shield', name: 'Shield', type: 'feat', uuid: 'Compendium.test.shield'
  });

  const result = await resolveSpellSource({ name: 'Shield' }, dependencies([homebrew]));

  assert.equal(result.status, 'unavailable');
  assert.equal(result.sourceUuid, null);
  assert.equal(result.diagnostics[0].code, 'document-unavailable');
});

test('matches spell names exactly after normalization and never fuzzily', async () => {
  invalidateSpellProviderCache();
  const homebrew = spellPack(HOMEBREW_COLLECTION, [item('fire-bolt', 'Fire Bolt')]);

  const result = await resolveSpellSource({ name: 'Fire' }, dependencies([homebrew]));

  assert.equal(result.status, 'missing');
  assert.equal(result.provider, null);
  assert.deepEqual(result.candidates, []);
});

test('silently skips private resolution when no private compendium is selected', async () => {
  invalidateSpellProviderCache();
  const privatePack = spellPack('private.spells', [item('private', 'Guidance')]);
  const srd = spellPack('dnd5e.spells', [item('srd', 'Guidance')], {
    packageType: 'system', packageName: 'dnd5e'
  });

  const result = await resolveSpellSource({ name: 'Guidance' }, dependencies([privatePack, srd]));

  assert.equal(result.status, 'resolved');
  assert.equal(result.provider, 'srd');
  assert.equal(privatePack.getIndexCalls, 0);
  assert.deepEqual(result.diagnostics, []);
});

test('reports an unavailable selected private pack and falls back to SRD', async () => {
  invalidateSpellProviderCache();
  const srd = spellPack('dnd5e.spells', [item('srd', 'Guidance')], {
    packageType: 'system', packageName: 'dnd5e'
  });

  const result = await resolveSpellSource({ name: 'Guidance' }, dependencies(
    [srd], 'private.missing'
  ));

  assert.equal(result.status, 'resolved');
  assert.equal(result.provider, 'srd');
  assert.deepEqual(result.diagnostics, [{
    provider: 'private',
    code: 'pack-unavailable',
    message: 'Configured private spell compendium "private.missing" is unavailable.'
  }]);
});

test('uses only dnd5e system item packs for SRD fallback', async () => {
  invalidateSpellProviderCache();
  const allowed = spellPack('dnd5e.allowed', [item('allowed', 'Guidance')], {
    packageType: 'system', packageName: 'dnd5e'
  });
  const wrongPackage = spellPack('other.spells', [item('other', 'Guidance')], {
    packageType: 'system', packageName: 'other'
  });
  const wrongType = spellPack('dnd5e.module', [item('module', 'Guidance')], {
    packageType: 'module', packageName: 'dnd5e'
  });

  const result = await resolveSpellSource({ name: 'Guidance' }, dependencies(
    [allowed, wrongPackage, wrongType]
  ));

  assert.equal(result.status, 'resolved');
  assert.equal(result.sourceUuid, 'Compendium.test.allowed');
  assert.equal(wrongPackage.getIndexCalls, 0);
  assert.equal(wrongType.getIndexCalls, 0);
});

test('invalidates cached pack indexes when the private setting changes', async () => {
  invalidateSpellProviderCache();
  const privatePack = spellPack('private.spells', [item('private', 'Guidance')]);
  const registrations = [];
  const settings = {
    register(module, key, configuration) {
      registrations.push({ module, key, ...configuration });
    }
  };
  const resolveDependencies = dependencies([privatePack], privatePack.collection);

  await resolveSpellSource({ name: 'Guidance' }, resolveDependencies);
  await resolveSpellSource({ name: 'Guidance' }, resolveDependencies);
  assert.equal(privatePack.getIndexCalls, 1);

  registerPrivateSpellCompendiumSetting({
    settings,
    packs: [privatePack],
    onChange: invalidateSpellProviderCache
  });
  registrations[0].onChange(privatePack.collection);

  await resolveSpellSource({ name: 'Guidance' }, resolveDependencies);
  assert.equal(privatePack.getIndexCalls, 2);
});
