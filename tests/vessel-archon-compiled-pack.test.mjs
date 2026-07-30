import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
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

const sourceDirectory = new URL('../archon-src/', import.meta.url);
const compiledPack = fileURLToPath(
  new URL('../packs/vessel-archon-forms/', import.meta.url)
);

function yamlFiles(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...yamlFiles(path));
    else if (entry.isFile() && /\.ya?ml$/.test(entry.name)) files.push(path);
  }
  return files;
}

test('the committed Actor pack preserves all nine Archon YAML sources', async () => {
  assert.ok(existsSync(compiledPack), 'compiled vessel-archon-forms pack is missing');
  const temporary = mkdtempSync(join(tmpdir(), 'vessel-archon-pack-'));
  const pack = join(temporary, 'pack');
  const extracted = join(temporary, 'extracted');

  try {
    cpSync(compiledPack, pack, { recursive: true });
    await extractPack(pack, extracted, { yaml: true, recursive: true });

    const sourceActors = yamlFiles(fileURLToPath(sourceDirectory))
      .map(path => yaml.load(readFileSync(path, 'utf8')))
      .filter(document => document?._key?.startsWith('!actors!'));
    const compiledActors = yamlFiles(extracted)
      .map(path => yaml.load(readFileSync(path, 'utf8')))
      .filter(document => document?._key?.startsWith('!actors!'));

    assert.equal(sourceActors.length, 9);
    assert.equal(compiledActors.length, 9);
    const compiledById = new Map(compiledActors.map(actor => [actor._id, actor]));
    for (const source of sourceActors) {
      assert.deepEqual(compiledById.get(source._id), source, source.name);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
