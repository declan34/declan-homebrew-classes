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

const requiredSetupSteps = [
  "Install and enable Declan's Homebrew Classes and the private spell module.",
  'Open Game Settings → Configure Settings → Module Settings.',
  "Under Declan's Homebrew Classes, find Private Spell Compendium.",
  "Select the private module's Item compendium.",
  'Save and reload if Foundry requests it.',
  'If the pack is missing, verify that the private module is enabled and declares a dnd5e Item pack.'
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

test('the setup guide preserves the required six ordered GM steps', async () => {
  const guide = await readFile('docs/private-spell-compendium.md', 'utf8');

  const orderedSteps = requiredSetupSteps.map((step, index) =>
    `${index + 1}. ${step}`
  ).join('\n');

  assert.match(guide, new RegExp(orderedSteps.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
