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
const identifiers = [
  'balanced-fighting',
  'classical-swordplay',
  'defensive-fighting',
  'mounted-warrior',
  'protection',
  'standard-bearer',
  'tactical-fighting'
];
const parityPaths = [
  '_id',
  'system.identifier',
  'system.activities',
  'system.enchant',
  'effects',
  'flags'
];

function loadYaml(path) {
  return yaml.load(readFileSync(new URL(path, import.meta.url), 'utf8'));
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

test('committed Fighting Style pack preserves all seven source documents', async () => {
  const sources = identifiers.map(identifier => loadYaml(
    `../fighting-styles-src/${identifier}.yml`
  ));
  const temporary = mkdtempSync(join(
    tmpdir(),
    'warlord-fighting-styles-compiled-pack-'
  ));
  const pack = join(temporary, 'pack');
  const extracted = join(temporary, 'extracted');

  try {
    assert.equal(sources.length, 7, 'expected seven source Fighting Styles');
    assert.equal(
      new Set(sources.map(source => source._id)).size,
      7,
      'source Fighting Style IDs must be unique'
    );

    cpSync(compiledPack, pack, { recursive: true });
    await extractPack(pack, extracted, { yaml: true, recursive: true });

    const documents = findYamlFiles(extracted)
      .map(path => yaml.load(readFileSync(path, 'utf8')));
    const compiledById = new Map(documents.map(document => [
      document?._id,
      document
    ]));
    const compiledStyles = sources.map(source => {
      const compiled = compiledById.get(source._id);
      assert.ok(compiled, `expected compiled ${source.name}`);
      return compiled;
    });

    assert.equal(
      compiledStyles.length,
      7,
      'expected seven compiled Fighting Styles'
    );
    assert.equal(
      new Set(compiledStyles.map(style => style._id)).size,
      7,
      'compiled Fighting Style IDs must be unique'
    );

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
