import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(
  new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url)
);
const yaml = require('js-yaml');
const cliEntry = require.resolve('@foundryvtt/foundryvtt-cli');
const { extractPack } = await import(pathToFileURL(cliEntry));

const compiledPack = fileURLToPath(
  new URL('../packs/warlord-fighting-styles/', import.meta.url)
);
const sourceDirectory = fileURLToPath(
  new URL('../fighting-styles-src/', import.meta.url)
);
const parityPaths = [
  '_id',
  'system.identifier',
  'system.prerequisites',
  'system.activities',
  'system.enchant',
  'effects',
  'flags'
];

function loadYamlFile(path) {
  return yaml.load(readFileSync(path, 'utf8'));
}

function findYamlFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...findYamlFiles(path));
    else if (entry.isFile() && /\.ya?ml$/.test(entry.name)) files.push(path);
  }
  return files;
}

function valueAt(document, path) {
  return path.split('.').reduce((value, key) => value?.[key], document);
}

function assertClosedPack(sources, compiled) {
  assert.equal(sources.length, 7, 'expected seven source Fighting Style items');
  assert.equal(compiled.length, 7, 'expected seven compiled Fighting Style items');

  const sourceIds = sources.map(source => source?._id);
  const compiledIds = compiled.map(document => document?._id);
  assert.equal(
    new Set(sourceIds).size,
    7,
    'source Fighting Style IDs must be unique'
  );
  assert.equal(
    new Set(compiledIds).size,
    7,
    'compiled Fighting Style IDs must be unique'
  );
  assert.deepEqual(
    [...compiledIds].sort(),
    [...sourceIds].sort(),
    'source and compiled Fighting Style ID sets must match'
  );
}

test('pack closure rejects extra and duplicate documents before ID mapping', () => {
  const sources = Array.from({ length: 7 }, (_, index) => ({
    _id: `source-${index}`
  }));
  const compiled = structuredClone(sources);

  assert.doesNotThrow(() => assertClosedPack(sources, compiled));
  assert.throws(
    () => assertClosedPack([...sources, { _id: 'extra-source' }], compiled),
    /seven source/
  );
  assert.throws(
    () => assertClosedPack(sources, [...compiled, { _id: 'extra-compiled' }]),
    /seven compiled/
  );
  assert.throws(
    () => assertClosedPack(sources, [
      ...compiled.slice(0, -1),
      { _id: compiled[0]._id }
    ]),
    /compiled Fighting Style IDs must be unique/
  );
});

test('committed Fighting Style pack preserves all seven source documents', async () => {
  const sources = readdirSync(sourceDirectory, { withFileTypes: true })
    .filter(entry =>
      entry.isFile()
      && /\.ya?ml$/.test(entry.name)
      && entry.name !== '_folder.yml'
    )
    .map(entry => loadYamlFile(join(sourceDirectory, entry.name)));
  const temporary = mkdtempSync(join(
    tmpdir(),
    'warlord-fighting-styles-compiled-pack-'
  ));
  const pack = join(temporary, 'pack');
  const extracted = join(temporary, 'extracted');

  try {
    cpSync(compiledPack, pack, { recursive: true });
    await extractPack(pack, extracted, { yaml: true, recursive: true });

    const compiledItems = findYamlFiles(extracted)
      .map(loadYamlFile)
      .filter(document => document?._key?.startsWith('!items!'));

    assertClosedPack(sources, compiledItems);

    const compiledById = new Map(compiledItems.map(document => [
      document?._id,
      document
    ]));

    for (const source of sources) {
      const compiled = compiledById.get(source._id);
      for (const path of parityPaths) {
        assert.deepEqual(
          valueAt(compiled, path),
          valueAt(source, path),
          `${source.system.identifier}: ${path}`
        );
      }
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
