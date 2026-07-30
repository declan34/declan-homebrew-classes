import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveSealedMagicEntry } from '../scripts/vessel/sealed-magic-provider.mjs';

test('forwards only the content-free spell identity to the resolver', async () => {
  const calls = [];
  const result = await resolveSealedMagicEntry({
    key: 'cursed-3-hellish-rebuke',
    name: 'Hellish Rebuke',
    subclass: 'the-cursed',
    vesselLevel: 3
  }, {
    resolve: async identity => {
      calls.push(identity);
      return { status: 'missing', spellKey: identity.key };
    }
  });

  assert.deepEqual(calls, [{
    key: 'cursed-3-hellish-rebuke',
    name: 'Hellish Rebuke'
  }]);
  assert.equal(result.status, 'missing');
});

test('rejects invalid entries before calling the resolver', async t => {
  const cases = [
    ['a missing key', {
      name: 'Hellish Rebuke', subclass: 'the-cursed', vesselLevel: 3
    }],
    ['a blank name', {
      key: 'cursed-3-hellish-rebuke', name: '  ', subclass: 'the-cursed', vesselLevel: 3
    }],
    ['an invalid subclass identifier', {
      key: 'cursed-3-hellish-rebuke', name: 'Hellish Rebuke', subclass: 'cursed', vesselLevel: 3
    }],
    ['a Vessel level below one', {
      key: 'cursed-3-hellish-rebuke', name: 'Hellish Rebuke', subclass: 'the-cursed', vesselLevel: 0
    }],
    ['a Vessel level above twenty', {
      key: 'cursed-3-hellish-rebuke', name: 'Hellish Rebuke', subclass: 'the-cursed', vesselLevel: 21
    }]
  ];

  for (const [description, entry] of cases) {
    await t.test(`rejects ${description}`, async () => {
      let calls = 0;

      await assert.rejects(
        resolveSealedMagicEntry(entry, {
          resolve: async () => {
            calls += 1;
            return { status: 'missing', spellKey: 'unexpected' };
          }
        }),
        TypeError
      );

      assert.equal(calls, 0);
    });
  }
});

test('passes an immutable identity and returns the resolver result unchanged', async () => {
  const expected = { status: 'resolved', spellKey: 'cursed-3-hellish-rebuke' };
  const entry = {
    key: 'cursed-3-hellish-rebuke',
    name: 'Hellish Rebuke',
    subclass: 'the-cursed',
    vesselLevel: 3
  };
  let received;

  const result = await resolveSealedMagicEntry(entry, {
    resolve: async identity => {
      received = identity;
      return expected;
    }
  });

  assert.equal(Object.isFrozen(entry), true);
  assert.equal(Object.isFrozen(received), true);
  assert.strictEqual(result, expected);
});
