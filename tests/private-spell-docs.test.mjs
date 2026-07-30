import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const publicDocuments = [
  'README.md',
  'docs/private-spell-compendium.md'
];

const requiredPhrases = [
  'Private Spell Compendium',
  'Game Settings',
  'Configure Settings',
  'Module Settings',
  'Item compendium',
  'None'
];

const forbiddenPrivateReferences = [
  /declan-private-spells/i,
  /https?:\/\/github\.com\/[^\s)]+private[^\s)]*/i,
  /copy[^\n]*private[^\n]*files?[^\n]*public module/i
];

test('public private-spell documentation provides safe GM setup guidance', async () => {
  for (const documentPath of publicDocuments) {
    const document = await readFile(documentPath, 'utf8');

    for (const phrase of requiredPhrases) {
      assert.match(document, new RegExp(phrase), `${documentPath} should mention ${phrase}`);
    }

    for (const privateReference of forbiddenPrivateReferences) {
      assert.doesNotMatch(
        document,
        privateReference,
        `${documentPath} must not expose private repository details or copy instructions`
      );
    }
  }
});
