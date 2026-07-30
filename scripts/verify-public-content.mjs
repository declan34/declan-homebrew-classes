import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ALLOWED_HOMEBREW_SOURCES = new Set(['Laser Llama Original']);
export const ALLOWED_SRD_SOURCES = new Set(['SRD 5.1', 'SRD 5.2.1']);
export const FORBIDDEN_PUBLIC_SEGMENTS = new Set([
  'declan-private-spells',
  'private-spells',
  'private-spell-content'
]);

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = resolve(scriptDirectory, '..');
const require = createRequire(
  new URL('../../dnd5e-pdf-importer/emit/package.json', import.meta.url)
);

function defaultLoadYaml(path) {
  return require('js-yaml').load(readFileSync(path, 'utf8'));
}

function findYamlFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...findYamlFiles(path));
    else if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) files.push(path);
  }
  return files;
}

function findForbiddenPaths(repositoryRoot) {
  const paths = [];
  const excludedDirectories = new Set(['.git', '.worktrees', 'packs']);

  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (excludedDirectories.has(entry.name)) continue;
      const path = join(directory, entry.name);
      const segments = relative(repositoryRoot, path).split(/[\\/]/);
      if (segments.some(segment => FORBIDDEN_PUBLIC_SEGMENTS.has(segment))) {
        paths.push(relative(repositoryRoot, path));
      }
      if (entry.isDirectory()) walk(path);
    }
  }

  walk(repositoryRoot);
  return paths;
}

function validateSource(document, relativePath, errors) {
  if (document?.type !== 'spell') {
    errors.push(`${relativePath} must be an Item with type spell.`);
    return;
  }

  const source = document?.system?.source;
  if (!source || typeof source !== 'object') {
    errors.push(`${relativePath} is missing required system.source metadata.`);
    return;
  }

  if (source.license === 'proprietary') {
    if (!ALLOWED_HOMEBREW_SOURCES.has(source.custom)) {
      errors.push(`${relativePath} must use an approved homebrew source for proprietary content.`);
    }
    return;
  }

  if (source.license === 'CC-BY-4.0') {
    if (!ALLOWED_SRD_SOURCES.has(source.custom)) {
      errors.push(`${relativePath} must use an approved SRD source for CC-BY-4.0 content.`);
    }
    return;
  }

  errors.push(`${relativePath} has unsupported license ${JSON.stringify(source.license)}.`);
}

/** Validate public spell sources and private-path policy. */
export async function verifyPublicContent({
  repositoryRoot = defaultRepositoryRoot,
  loadYaml = defaultLoadYaml
} = {}) {
  const errors = [];
  const sourceDirectory = join(repositoryRoot, 'spells-src');
  let spellCount = 0;

  for (const path of findForbiddenPaths(repositoryRoot)) {
    errors.push(`Forbidden private-content path: ${path}`);
  }

  const sourceFiles = existsSync(sourceDirectory)
    ? findYamlFiles(sourceDirectory)
    : [];
  for (const path of sourceFiles) {
    if (path.endsWith('_folder.yml')) continue;
    const relativePath = relative(repositoryRoot, path);
    let document;
    try {
      document = loadYaml(path);
    } catch (error) {
      errors.push(`${relativePath} contains malformed YAML: ${error.message}`);
      continue;
    }
    validateSource(document, relativePath, errors);
    if (document?.type === 'spell') spellCount += 1;
  }

  return { ok: errors.length === 0, errors, spellCount };
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;

if (invokedPath === import.meta.url) {
  try {
    const result = await verifyPublicContent();
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
