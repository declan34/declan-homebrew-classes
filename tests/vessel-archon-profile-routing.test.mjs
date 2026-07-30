import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ArchonPreparationError,
  findArchonFormItem,
  prepareArchonActivityUse,
  requestArchonActivityPreparation,
  resolveArchonProfileSources
} from '../scripts/vessel/archon-profiles.mjs';
import { ARCHON_PROFILES } from '../scripts/vessel/rules.mjs';

const MODULE_ID = 'declan-homebrew-classes';

function item(identifier, type = 'feat', system = {}) {
  return {
    id: `${identifier}-owned`,
    type,
    identifier,
    system: { identifier, ...system }
  };
}

function actor({
  subclass = 'the-ascended',
  affinity,
  freeSpent = 0,
  slots = 1,
  owner = true
} = {}) {
  const resource = item('archon-form', 'feat', {
    uses: { max: '1', spent: freeSpent, recovery: [] }
  });
  return {
    isOwner: owner,
    items: [
      item(subclass, 'subclass'),
      resource
    ],
    system: { spells: { vessel: { value: slots, max: 2 } } },
    flags: affinity ? {
      [MODULE_ID]: { vessel: { elementalAffinity: affinity } }
    } : {}
  };
}

function profileDocument(uuid) {
  return {
    uuid,
    documentName: 'Actor',
    type: 'npc'
  };
}

function activity(role, host, profiles = []) {
  const source = {
    id: 'test-activity-id',
    _id: 'test-activity-id',
    item: {
      id: 'test-control-id',
      actor: host,
      isOwner: host.isOwner
    },
    flags: {
      [MODULE_ID]: { vessel: { role } }
    },
    profiles: profiles.map(({ profile, uuid }, index) => ({
      _id: `hbrTestProfile${String(index).padStart(2, '0')}`,
      name: profile,
      uuid,
      cr: '',
      sizes: [],
      types: [],
      movement: [],
      level: { min: null, max: null }
    })),
    consumption: {
      targets: role === 'archon-transform-free'
        ? [{ type: 'itemUses', target: '', value: '1', scaling: {} }]
        : role === 'archon-revert'
          ? []
          : [{
              type: 'attribute',
              target: 'spells.vessel.value',
              value: '1',
              scaling: {}
            }]
    }
  };
  source.updateSource = changes => {
    if (changes.profiles) source.profiles = structuredClone(changes.profiles);
    if (changes.consumption) {
      source.consumption = structuredClone(changes.consumption);
    }
  };
  return source;
}

function profilesFor(subclass) {
  return Object.values(ARCHON_PROFILES)
    .filter(profile => profile.subclass === subclass);
}

const ownerUser = {
  isGM: true,
  can: permission => permission === 'ACTOR_CREATE'
};

async function prepare(subject, usageConfig = {}, options = {}) {
  return prepareArchonActivityUse(subject, usageConfig, {
    user: ownerUser,
    resolveUuid: async uuid => profileDocument(uuid),
    ...options
  });
}

test('finds the generic Archon Form resource by identifier or module role', () => {
  const byIdentifier = actor();
  assert.equal(findArchonFormItem(byIdentifier).identifier, 'archon-form');

  const byRole = {
    items: [{
      id: 'resource-id',
      flags: {
        [MODULE_ID]: {
          vessel: { archon: { role: 'archon-resource' } }
        }
      }
    }]
  };
  assert.equal(findArchonFormItem(byRole).id, 'resource-id');
});

test('injects the owned Archon Form item ID into free-use consumption', async () => {
  const host = actor();
  const subject = activity(
    'archon-transform-free',
    host,
    profilesFor('the-ascended')
  );

  const result = await prepare(subject, { transform: {} });

  assert.equal(result.handled, true);
  assert.equal(result.resourceItem.identifier, 'archon-form');
  assert.equal(
    subject.consumption.targets[0].target,
    'archon-form-owned'
  );
});

test('rejects exhausted free uses without touching Vessel slots', async () => {
  const host = actor({ freeSpent: 1, slots: 2 });
  const subject = activity(
    'archon-transform-free',
    host,
    profilesFor('the-ascended')
  );

  await assert.rejects(
    prepare(subject, { transform: {} }),
    error => error instanceof ArchonPreparationError
      && error.code === 'free-use-exhausted'
  );
  assert.equal(host.system.spells.vessel.value, 2);
  assert.equal(subject.consumption.targets[0].target, '');
});

test('slot Transform and Extend preflight the Vessel pool without spending it', async () => {
  for (const role of ['archon-transform-slot', 'archon-extend']) {
    const host = actor({ slots: 1 });
    const subject = activity(
      role,
      host,
      role === 'archon-transform-slot' ? profilesFor('the-ascended') : []
    );
    await prepare(subject, { transform: {} });
    assert.equal(host.system.spells.vessel.value, 1, role);
    assert.equal(subject.consumption.targets[0].target, 'spells.vessel.value');
  }
});

test('slot-backed activities reject a missing or exhausted Vessel pool', async () => {
  for (const slots of [0, undefined]) {
    const host = actor({ slots });
    if (slots === undefined) delete host.system.spells.vessel;
    const subject = activity('archon-extend', host);
    await assert.rejects(
      prepare(subject),
      error => error instanceof ArchonPreparationError
        && ['missing-vessel-slots', 'vessel-slots-exhausted'].includes(error.code)
    );
  }
});

test('routes each non-Cataclysm subclass to exactly its own profile', async () => {
  for (const subclass of [
    'the-ascended',
    'the-cursed',
    'the-fallen',
    'the-formless',
    'the-trickster'
  ]) {
    const host = actor({ subclass });
    const allowed = profilesFor(subclass);
    const subject = activity('archon-transform-slot', host, [
      ...allowed,
      ARCHON_PROFILES['cataclysm-air']
    ]);
    const usageConfig = { transform: { profile: subject.profiles[0]._id } };

    const result = await prepare(subject, usageConfig);

    assert.deepEqual(subject.profiles.map(profile => profile.uuid), [allowed[0].uuid]);
    assert.equal(usageConfig.transform.profile, subject.profiles[0]._id);
    assert.deepEqual(result.profileSources.map(source => source.uuid), [allowed[0].uuid]);
  }
});

test('Cataclysm affinity keeps four choices and rewrites the early native default', async () => {
  const cataclysmProfiles = profilesFor('the-cataclysm');
  for (const affinity of ['air', 'earth', 'fire', 'water']) {
    const host = actor({ subclass: 'the-cataclysm', affinity });
    const subject = activity(
      'archon-transform-slot',
      host,
      cataclysmProfiles
    );
    const earlyDefault = subject.profiles[0]._id;
    const usageConfig = { transform: { profile: earlyDefault } };

    await prepare(subject, usageConfig);

    assert.equal(subject.profiles.length, 4);
    const preferred = subject.profiles.find(profile =>
      profile.uuid === ARCHON_PROFILES[`cataclysm-${affinity}`].uuid
    );
    assert.equal(
      usageConfig.transform.profile,
      preferred._id
    );
  }
});

test('Cataclysm without a saved affinity keeps four profiles for the native dialog', async () => {
  const host = actor({ subclass: 'the-cataclysm' });
  const subject = activity(
    'archon-transform-slot',
    host,
    profilesFor('the-cataclysm')
  );
  const selected = subject.profiles[2]._id;
  const usageConfig = { transform: { profile: selected } };

  await prepare(subject, usageConfig);

  assert.equal(subject.profiles.length, 4);
  assert.equal(usageConfig.transform.profile, selected);
});

test('rejects cross-subclass selections and missing profile Actors', async () => {
  const host = actor({ subclass: 'the-fallen' });
  const subject = activity('archon-transform-slot', host, [
    ARCHON_PROFILES.fallen,
    ARCHON_PROFILES.cursed
  ]);
  const cursedId = subject.profiles[1]._id;

  await assert.rejects(
    prepare(subject, { transform: { profile: cursedId } }),
    error => error.code === 'invalid-profile-selection'
  );

  const valid = activity(
    'archon-transform-slot',
    host,
    profilesFor('the-fallen')
  );
  await assert.rejects(
    prepare(valid, { transform: {} }, {
      resolveUuid: async () => null
    }),
    error => error.code === 'missing-profile-actor'
  );
});

test('saved Cataclysm affinity does not permit a cross-subclass selection', async () => {
  const host = actor({
    subclass: 'the-cataclysm',
    affinity: 'earth'
  });
  const subject = activity('archon-transform-slot', host, [
    ...profilesFor('the-cataclysm'),
    ARCHON_PROFILES.cursed
  ]);
  const cursedId = subject.profiles.at(-1)._id;

  await assert.rejects(
    prepare(subject, { transform: { profile: cursedId } }),
    error => error.code === 'invalid-profile-selection'
  );
});

test('rejects non-owners and users without native transform permission', async () => {
  const nonOwner = actor({ owner: false });
  await assert.rejects(
    prepare(
      activity(
        'archon-transform-slot',
        nonOwner,
        profilesFor('the-ascended')
      ),
      { transform: {} }
    ),
    error => error.code === 'not-owner'
  );

  const host = actor();
  await assert.rejects(
    prepare(
      activity(
        'archon-transform-slot',
        host,
        profilesFor('the-ascended')
      ),
      { transform: {} },
      {
        user: { isGM: false, can: () => false },
        allowPolymorphing: false
      }
    ),
    error => error.code === 'transform-permission'
  );
});

test('reports missing profile packs and evicts failed cache entries for retry', async () => {
  const cache = new Map();
  let attempts = 0;
  const source = ARCHON_PROFILES.ascended;
  const resolver = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('pack unavailable');
    return profileDocument(source.uuid);
  };

  await assert.rejects(
    resolveArchonProfileSources([source], { resolveUuid: resolver, cache }),
    error => error.code === 'profile-pack-unavailable'
  );
  const resolved = await resolveArchonProfileSources(
    [source],
    { resolveUuid: resolver, cache }
  );
  assert.equal(resolved[0].uuid, source.uuid);
  assert.equal(attempts, 2);
});

test('ignores unrelated activities without mutating their data', async () => {
  const host = actor();
  const subject = activity(
    'iridescent-strike',
    host,
    profilesFor('the-ascended')
  );
  const before = structuredClone({
    profiles: subject.profiles,
    consumption: subject.consumption
  });

  const result = await prepare(subject, { transform: {} });

  assert.deepEqual(result, { handled: false });
  assert.deepEqual(subject.profiles, before.profiles);
  assert.deepEqual(subject.consumption, before.consumption);
});

test('two-phase preparation cancels once, resolves asynchronously, then applies on retry', async () => {
  const host = actor({
    subclass: 'the-cataclysm',
    affinity: 'water'
  });
  const firstClone = activity(
    'archon-transform-free',
    host,
    profilesFor('the-cataclysm')
  );
  const firstUsage = {
    transform: { profile: firstClone.profiles[0]._id }
  };
  const state = new WeakMap();
  let retryCount = 0;
  let retryClone;
  let retryUsage;
  let retryResult;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const prepareUse = async (subject, usageConfig) => {
    await gate;
    return prepare(subject, usageConfig);
  };

  const options = {
    state,
    prepareUse,
    retry: async () => {
      retryCount += 1;
      retryClone = activity(
        'archon-transform-free',
        host,
        profilesFor('the-cataclysm')
      );
      retryUsage = {
        transform: { profile: retryClone.profiles[0]._id }
      };
      retryResult = requestArchonActivityPreparation(
        retryClone,
        retryUsage,
        options
      );
    },
    onError: assert.fail
  };
  const firstResult = requestArchonActivityPreparation(
    firstClone,
    firstUsage,
    options
  );
  const duplicateResult = requestArchonActivityPreparation(
    firstClone,
    firstUsage,
    options
  );
  assert.equal(firstResult, false);
  assert.equal(duplicateResult, false);
  assert.equal(retryCount, 0);

  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(retryCount, 1);

  assert.equal(retryResult, undefined);
  assert.equal(retryClone.consumption.targets[0].target, 'archon-form-owned');
  assert.equal(retryClone.profiles.length, 4);
  assert.equal(
    retryUsage.transform.profile,
    retryClone.profiles.find(profile =>
      profile.uuid === ARCHON_PROFILES['cataclysm-water'].uuid
    )._id
  );
});

test('two-phase preparation reports failure without retrying or leaving a guard', async () => {
  const host = actor();
  const subject = activity(
    'archon-transform-slot',
    host,
    profilesFor('the-ascended')
  );
  const state = new WeakMap();
  const errors = [];
  let retries = 0;
  const options = {
    state,
    prepareUse: async () => {
      throw new ArchonPreparationError('missing-profile-actor', 'missing');
    },
    retry: async () => { retries += 1; },
    onError: error => errors.push(error)
  };

  assert.equal(
    requestArchonActivityPreparation(subject, { transform: {} }, options),
    false
  );
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(retries, 0);
  assert.equal(errors[0].code, 'missing-profile-actor');

  assert.equal(
    requestArchonActivityPreparation(subject, { transform: {} }, options),
    false
  );
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(errors.length, 2);
});
