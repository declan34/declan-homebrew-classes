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

const compiledPack = fileURLToPath(new URL('../packs/vessel-aspects/', import.meta.url));
const aspectPaths = [
  'aether-wings',
  'opalescent-armor',
  'perilous-visage',
  'otherworldly-maw',
  'primordial-bulwark',
  'twilight-steps',
  'shimmering-lance',
  'dazzling-lance',
  'sundering-strike',
  'vexing-strike'
];
const sources = aspectPaths.map(name => yaml.load(readFileSync(
  new URL(`../aspects-src/${name}.yml`, import.meta.url),
  'utf8'
)));

function findYamlFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...findYamlFiles(path));
    else if (entry.isFile() && /\.ya?ml$/.test(entry.name)) files.push(path);
  }
  return files;
}

test('committed Vessel Aspect pack preserves every Stage 3 automation source', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'vessel-aspects-pack-'));
  const pack = join(temporary, 'pack');
  const extracted = join(temporary, 'extracted');

  try {
    cpSync(compiledPack, pack, {recursive: true});
    await extractPack(pack, extracted, {yaml: true, recursive: true});

    const documents = findYamlFiles(extracted)
      .map(path => yaml.load(readFileSync(path, 'utf8')));
    const compiledById = new Map(documents.map(document => [document?._id, document]));

    for (const source of sources) {
      const compiled = compiledById.get(source._id);
      assert.ok(compiled, source.system.identifier);
      assert.deepEqual(
        compiled.system.activities,
        source.system.activities,
        `${source.system.identifier} activities`
      );
      assert.deepEqual(compiled.effects, source.effects, `${source.system.identifier} effects`);
      assert.deepEqual(
        compiled.flags?.['declan-homebrew-classes'],
        source.flags?.['declan-homebrew-classes'],
        `${source.system.identifier} module flags`
      );
    }
  } finally {
    rmSync(temporary, {recursive: true, force: true});
  }
});
