import test from 'node:test';
import assert from 'node:assert/strict';

const {
  loadWarlordExploitSourceItems,
  loadWarlordStyleSourceItems,
  loadWarlordSourceItems,
  migrateWarlordActor,
  reconcileWarlordActor
} = await import('../scripts/warlord/migration.mjs');

const MODULE_ID = 'declan-homebrew-classes';
const SOURCE_IDS = {
  leadership: 'RsYiNPYft9wtFUVC',
  inspiring: 'GIQLBRE51hb1RDXH',
  rallying: 'VYQXQblhCYLXLAiI',
  tactical: 'pYK8FOsD6alUcqIu',
  superiority: 'OT3zttV6GIbuCbPN'
};

function clone(value) {
  return structuredClone(value);
}

function warlordActivity(id, role, data = {}) {
  return {
    _id: id,
    id,
    type: 'utility',
    name: `Canonical ${role}`,
    activation: { type: 'action', value: 1 },
    consumption: { targets: [] },
    description: { chatFlavor: 'Canonical flavor' },
    duration: { units: 'inst', value: '' },
    range: { units: 'ft', value: '30' },
    target: { affects: { count: '1', type: 'creature' } },
    uses: { spent: 0, max: '' },
    roll: { formula: '@abilities.cha.mod' },
    flags: { [MODULE_ID]: { warlord: { role } } },
    ...clone(data)
  };
}

function canonicalItem(id, identifier, activities, uses = {}) {
  return {
    _id: id,
    id,
    name: `Canonical ${identifier}`,
    flags: { [MODULE_ID]: { warlord: { source: true } } },
    system: {
      identifier,
      description: { value: '<p>Canonical description.</p>' },
      uses: {
        max: 3,
        spent: 0,
        recovery: [
          { period: 'sr', type: 'recoverAll' },
          { period: 'initiative', type: 'recover', formula: '1' }
        ],
        ...clone(uses)
      },
      activities: Object.fromEntries(activities.map(entry => [entry.id, entry]))
    }
  };
}

function canonicalSources() {
  const sources = {
    leadership: canonicalItem(
      SOURCE_IDS.leadership,
      'leadership-style',
      [warlordActivity('LeadershipAct001', 'leadership-config')]
    ),
    inspiring: canonicalItem(
      SOURCE_IDS.inspiring,
      'inspiring-word',
      [
        warlordActivity('InspiringLaunch1', 'inspiring-word-launcher'),
        warlordActivity('InspiringHelp01', 'inspiring-word-helper', {
          type: 'heal',
          healing: { custom: { enabled: true, formula: '1d8 + @abilities.wis.mod' } },
          flags: {
            [MODULE_ID]: {
              warlord: {
                role: 'inspiring-word-helper',
                hitDie: 8,
                leadershipAbility: 'wis'
              }
            }
          }
        }),
        warlordActivity('InspiringHelp02', 'inspiring-word-helper', {
          type: 'heal',
          healing: { custom: { enabled: true, formula: '1d10 + @abilities.int.mod' } },
          flags: {
            [MODULE_ID]: {
              warlord: {
                role: 'inspiring-word-helper',
                hitDie: 10,
                leadershipAbility: 'int'
              }
            }
          }
        })
      ]
    ),
    rallying: canonicalItem(
      SOURCE_IDS.rallying,
      'rallying-cry',
      [warlordActivity('RallyingCryAct01', 'rallying-cry', {
        activation: { type: 'reaction', value: null }
      })]
    ),
    tactical: canonicalItem(
      SOURCE_IDS.tactical,
      'tactical-exploits',
      [warlordActivity('TacticalSkill001', 'tactical-skill', {
        range: { units: '', value: null }
      })],
      {
        max: 4,
        recovery: [{ period: 'sr', type: 'recoverAll' }]
      }
    ),
    superiority: canonicalItem(
      SOURCE_IDS.superiority,
      'tactical-superiority',
      []
    )
  };
  sources.inspiring.flags.dnd5e = {
    riders: { activity: ['InspiringHelp01', 'InspiringHelp02'] }
  };
  return sources;
}

function canonicalExploitSources() {
  const save = warlordActivity('DirtyHitAct01ABC', 'exploit-activity', {
    type: 'save',
    range: { units: 'ft', value: '15' },
    consumption: {
      targets: [{
        type: 'itemUses',
        target: 'tactical-exploits',
        value: '1'
      }]
    },
    damage: {
      onSave: 'none',
      parts: [{
        custom: {
          enabled: true,
          formula: '@scale.warlord.exploit-die'
        }
      }]
    },
    effects: [
      { _id: 'DirtyHitProne01A', onSave: false },
      { _id: 'DirtyNoReact01AB', onSave: false }
    ],
    save: { ability: ['con'], dc: { calculation: 'cha', formula: '' } },
    flags: {
      [MODULE_ID]: {
        warlord: {
          role: 'exploit-activity',
          exploit: 'dirty-hit',
          mechanic: 'save-damage-effect'
        }
      }
    }
  });
  const repeatSave = warlordActivity('DirtyRepeat01ABC', 'exploit-repeat-save', {
    type: 'save',
    range: { units: 'ft', value: '30' },
    save: { ability: ['con'], dc: { calculation: 'cha', formula: '' } },
    flags: {
      [MODULE_ID]: {
        warlord: {
          role: 'exploit-repeat-save',
          exploit: 'dirty-hit',
          mechanic: 'repeat-save'
        }
      }
    }
  });
  const resolution = warlordActivity('DirtyResolut01A', 'exploit-resolution', {
    range: { units: 'ft', value: '15' },
    flags: {
      [MODULE_ID]: {
        warlord: {
          role: 'exploit-resolution',
          exploit: 'dirty-hit',
          mechanic: 'damage'
        }
      }
    }
  });
  const dirtyHit = canonicalItem(
    'WIrrBN4l50nCgBdL',
    'dirty-hit',
    [save, repeatSave, resolution],
    { max: '', recovery: [] }
  );
  dirtyHit.effects = [
    {
      _id: 'DirtyHitProne01A',
      name: 'Dirty Hit — Prone',
      changes: [],
      statuses: ['prone'],
      duration: { rounds: null, seconds: null },
      flags: { dnd5e: { riders: { statuses: [] } } },
      _key: '!items.effects!WIrrBN4l50nCgBdL.DirtyHitProne01A'
    },
    {
      _id: 'DirtyNoReact01AB',
      name: 'Dirty Hit — No Reactions',
      changes: [],
      statuses: [],
      duration: { rounds: 1, seconds: 6 },
      flags: { dnd5e: { riders: { statuses: [] } } },
      _key: '!items.effects!WIrrBN4l50nCgBdL.DirtyNoReact01AB'
    }
  ];
  return {
    dirtyHit,
    parry: canonicalItem(
      'c31ADMDftmoKUKUV',
      'parry',
      [warlordActivity('ParryAct01ABCDEF', 'exploit-activity', {
        range: { units: 'ft', value: '30' },
        consumption: {
          targets: [{
            type: 'itemUses',
            target: 'tactical-exploits',
            value: '1'
          }]
        },
        flags: {
          [MODULE_ID]: {
            warlord: {
              role: 'exploit-activity',
              exploit: 'parry',
              mechanic: 'roll'
            }
          }
        }
      })],
      { max: '', recovery: [] }
    ),
    firstAid: canonicalItem(
      '5sQXJ2OOPZdfRKa7',
      'first-aid',
      [warlordActivity('FirstAidAct01ABC', 'exploit-activity', {
        range: { units: 'ft', value: '5' },
        flags: {
          [MODULE_ID]: {
            warlord: {
              role: 'exploit-activity',
              exploit: 'first-aid',
              mechanic: 'heal'
            }
          }
        }
      })],
      { max: '', recovery: [] }
    ),
    attackOrder: canonicalItem(
      'RBFxIvOXz9johjAJ',
      'attack-order',
      [],
      { max: '', recovery: [] }
    )
  };
}

function styleMetadata(style, mechanic, role = 'fighting-style-effect') {
  return {
    [MODULE_ID]: {
      warlord: { role, style, mechanic }
    }
  };
}

function canonicalStyleEffect(id, style, mechanic, {
  disabled = false,
  type = 'base',
  transfer = false,
  changes = [{ key: 'system.attributes.ac.bonus', mode: 2, value: '1', priority: 20 }]
} = {}) {
  return {
    _id: id,
    id,
    name: `Canonical ${style} effect`,
    type,
    transfer,
    system: type === 'enchantment' ? { schema: 'canonical' } : {},
    changes: clone(changes),
    disabled,
    duration: { rounds: null, seconds: null },
    description: '<p>Canonical effect description.</p>',
    flags: {
      otherCanonicalFlag: { replace: false },
      ...styleMetadata(style, mechanic)
    },
    _key: `!items.effects!canonical.${id}`
  };
}

function canonicalStyleSources() {
  const balancedActivity = warlordActivity(
    'BalFightEnchant1',
    'fighting-style-activity',
    {
      type: 'enchant',
      flags: styleMetadata(
        'balanced-fighting',
        'weapon-damage-enchantment',
        'fighting-style-activity'
      )
    }
  );
  const mountedActivity = warlordActivity(
    'MountedUseAct001',
    'fighting-style-activity',
    {
      type: 'utility',
      flags: styleMetadata(
        'mounted-warrior',
        'mounted-ac',
        'fighting-style-activity'
      )
    }
  );
  const balanced = canonicalItem(
    'hbrcInmfAaXPMRVr',
    'balanced-fighting',
    [balancedActivity],
    { max: '', recovery: [] }
  );
  balanced.effects = [canonicalStyleEffect(
    'BalFightDmgEff01',
    'balanced-fighting',
    'weapon-damage-bonus',
    {
      type: 'enchantment',
      changes: [{
        key: 'system.damage.base.bonus',
        mode: 2,
        value: '2',
        priority: 20
      }]
    }
  )];
  const defensive = canonicalItem(
    'ZhP7bFygnQsXTIqz',
    'defensive-fighting',
    [],
    { max: '', recovery: [] }
  );
  defensive.effects = [canonicalStyleEffect(
    'DefensiveACEff01',
    'defensive-fighting',
    'conditional-ac',
    { disabled: true, transfer: true }
  )];
  const mounted = canonicalItem(
    'H7BeSma1Jfb3xK5s',
    'mounted-warrior',
    [mountedActivity],
    { max: '', recovery: [] }
  );
  mounted.effects = [canonicalStyleEffect(
    'MountedACEff0001',
    'mounted-warrior',
    'mounted-ac'
  )];
  return { balanced, defensive, mounted };
}

function setPath(target, path, value) {
  const keys = path.split('.');
  let current = target;
  for (const key of keys.slice(0, -1)) {
    if (current instanceof Map) {
      if (!current.has(key)) current.set(key, {});
      current = current.get(key);
    } else {
      current = current[key] ??= {};
    }
  }
  const last = keys.at(-1);
  if (current instanceof Map) current.set(last, clone(value));
  else current[last] = clone(value);
}

function ownedItem({
  id,
  identifier,
  name = `My ${identifier}`,
  description = '<p>My description.</p>',
  spent = 2,
  max = 99,
  activities = [],
  effects = [{ id: 'user-effect', name: 'Keep me' }],
  failUpdates = 0,
  failEffectUpdates = 0,
  failEffectCreates = 0
}) {
  const item = {
    id,
    type: 'feat',
    name,
    flags: {
      otherModule: { keep: true },
      [MODULE_ID]: { userMetadata: { keep: true } }
    },
    effects: clone(effects),
    system: {
      identifier,
      description: { value: description },
      uses: {
        max,
        spent,
        recovery: [{ period: 'lr', type: 'recoverAll' }]
      },
      activities: Object.fromEntries(activities.map(entry => [entry.id, entry]))
    },
    updateCalls: [],
    embeddedUpdateCalls: [],
    embeddedCreateCalls: [],
    remainingFailures: failUpdates,
    remainingEffectUpdateFailures: failEffectUpdates,
    remainingEffectCreateFailures: failEffectCreates,
    async update(changes) {
      this.updateCalls.push(clone(changes));
      if (this.remainingFailures > 0) {
        this.remainingFailures -= 1;
        throw new Error(`forced ${identifier} update failure`);
      }
      for (const [path, value] of Object.entries(changes)) setPath(this, path, value);
    },
    async updateEmbeddedDocuments(type, updates) {
      this.embeddedUpdateCalls.push({ type, updates: clone(updates) });
      if (this.remainingEffectUpdateFailures > 0) {
        this.remainingEffectUpdateFailures -= 1;
        throw new Error(`forced ${identifier} effect update failure`);
      }
      for (const update of updates) {
        const effect = this.effects.find(entry => (entry._id ?? entry.id) === update._id);
        if (!effect) continue;
        Object.assign(effect, clone(update));
      }
    },
    async createEmbeddedDocuments(type, creates, options) {
      this.embeddedCreateCalls.push({
        type,
        creates: clone(creates),
        options: clone(options)
      });
      if (this.remainingEffectCreateFailures > 0) {
        this.remainingEffectCreateFailures -= 1;
        throw new Error(`forced ${identifier} effect create failure`);
      }
      this.effects.push(...clone(creates));
    }
  };
  return item;
}

function warlordClass(level = 5) {
  return {
    id: 'owned-warlord-class',
    type: 'class',
    system: { identifier: 'warlord', levels: level }
  };
}

function actorFixture({ items, leadershipAbility = 'wis', isOwner = true }) {
  const actor = {
    isOwner,
    items,
    flags: leadershipAbility ? {
      [MODULE_ID]: { warlord: { leadershipAbility } }
    } : {},
    setFlagCalls: [],
    getFlag(scope, key) {
      return key.split('.').reduce((value, segment) => value?.[segment], this.flags[scope]);
    },
    async setFlag(scope, key, value) {
      this.setFlagCalls.push({ scope, key, value });
      let current = this.flags[scope] ??= {};
      const keys = key.split('.');
      for (const segment of keys.slice(0, -1)) current = current[segment] ??= {};
      current[keys.at(-1)] = value;
    }
  };
  actor.inspiring = items.find(item => item.system?.identifier === 'inspiring-word');
  return actor;
}

function staleActivity(source, data = {}) {
  return {
    ...clone(source),
    type: 'legacy',
    name: `My ${source.name}`,
    description: { chatFlavor: 'My activity flavor' },
    activation: { type: 'legacy', value: 9 },
    range: { units: 'mi', value: '999' },
    flags: {
      otherModule: { keep: true },
      [MODULE_ID]: { warlord: clone(source.flags[MODULE_ID].warlord) }
    },
    ...clone(data)
  };
}

test('loads all five canonical Warlord items from the homebrew class pack by stable id', async () => {
  const requested = [];
  const sources = canonicalSources();
  const byId = new Map(Object.values(sources).map(item => [item.id, item]));
  const pack = {
    async getDocument(id) {
      requested.push(id);
      return byId.get(id);
    }
  };

  const loaded = await loadWarlordSourceItems({
    packs: new Map([[`${MODULE_ID}.homebrew-classes`, pack]])
  });

  assert.deepEqual(requested.sort(), Object.values(SOURCE_IDS).sort());
  assert.deepEqual(
    Object.values(loaded).map(item => item.id).sort(),
    Object.values(SOURCE_IDS).sort()
  );
});

test('retries canonical source loading after a transient pack failure', async () => {
  const { loadWarlordSourceItems: loadFreshSources } = await import(
    '../scripts/warlord/migration.mjs?transient-source-retry'
  );
  const sources = canonicalSources();
  const byId = new Map(Object.values(sources).map(item => [item.id, item]));
  let transientFailure = true;
  let requests = 0;
  const packs = new Map([[`${MODULE_ID}.homebrew-classes`, {
    async getDocument(id) {
      requests += 1;
      if (transientFailure && id === SOURCE_IDS.leadership) {
        throw new Error('temporary pack read failure');
      }
      return byId.get(id);
    }
  }]]);

  await assert.rejects(
    loadFreshSources({ packs }),
    /temporary pack read failure/
  );
  const failedRequests = requests;
  transientFailure = false;

  const loaded = await loadFreshSources({ packs });

  assert.ok(requests > failedRequests);
  assert.equal(loaded.leadership.id, SOURCE_IDS.leadership);
});

test('loads canonical Exploit documents only for identifiers the actor owns', async () => {
  const sources = canonicalExploitSources();
  const index = Object.values(sources).map(item => ({
    _id: item.id,
    system: { identifier: item.system.identifier }
  }));
  const byId = new Map(Object.values(sources).map(item => [item.id, item]));
  const requested = [];
  const pack = {
    async getIndex() {
      return index;
    },
    async getDocument(id) {
      requested.push(id);
      return byId.get(id);
    }
  };
  const actor = actorFixture({
    items: [
      warlordClass(),
      ownedItem({ id: 'owned-dirty', identifier: 'dirty-hit' }),
      ownedItem({ id: 'owned-attack', identifier: 'attack-order' })
    ]
  });

  const loaded = await loadWarlordExploitSourceItems(actor, {
    packs: new Map([[`${MODULE_ID}.warlord-exploits`, pack]])
  });

  assert.deepEqual(requested.sort(), [
    sources.attackOrder.id,
    sources.dirtyHit.id
  ].sort());
  assert.deepEqual(
    Object.values(loaded).map(item => item.system.identifier).sort(),
    ['attack-order', 'dirty-hit']
  );
});

test('loads canonical Fighting Style documents only for identifiers the actor owns', async () => {
  const sources = canonicalStyleSources();
  const index = Object.values(sources).map(item => ({
    _id: item.id,
    system: { identifier: item.system.identifier }
  }));
  const byId = new Map(Object.values(sources).map(item => [item.id, item]));
  const requested = [];
  const pack = {
    async getIndex() {
      return index;
    },
    async getDocument(id) {
      requested.push(id);
      return byId.get(id);
    }
  };
  const actor = actorFixture({
    items: [
      warlordClass(),
      ownedItem({ id: 'owned-balanced', identifier: 'balanced-fighting' }),
      ownedItem({ id: 'owned-mounted', identifier: 'mounted-warrior' }),
      ownedItem({ id: 'owned-dirty', identifier: 'dirty-hit' })
    ]
  });

  const loaded = await loadWarlordStyleSourceItems(actor, {
    packs: new Map([[`${MODULE_ID}.warlord-fighting-styles`, pack]])
  });

  assert.deepEqual(requested.sort(), [
    sources.balanced.id,
    sources.mounted.id
  ].sort());
  assert.deepEqual(
    Object.values(loaded).map(item => item.system.identifier).sort(),
    ['balanced-fighting', 'mounted-warrior']
  );
});

test('does not look up the Fighting Style pack when the actor owns no styles', async () => {
  const actor = actorFixture({
    items: [
      warlordClass(),
      ownedItem({ id: 'owned-dirty', identifier: 'dirty-hit' })
    ]
  });

  const loaded = await loadWarlordStyleSourceItems(actor, {
    packs: {
      get() {
        throw new Error('style pack must not be read');
      }
    }
  });

  assert.deepEqual(loaded, {});
});

test('rejects an incomplete Fighting Style index so migration can retry', async () => {
  const sources = canonicalStyleSources();
  const actor = actorFixture({
    items: [
      warlordClass(),
      ownedItem({ id: 'owned-balanced', identifier: 'balanced-fighting' }),
      ownedItem({ id: 'owned-mounted', identifier: 'mounted-warrior' })
    ]
  });
  const pack = {
    async getIndex() {
      return [{
        _id: sources.balanced.id,
        system: { identifier: 'balanced-fighting' }
      }];
    },
    async getDocument() {
      return sources.balanced;
    }
  };

  await assert.rejects(
    loadWarlordStyleSourceItems(actor, {
      packs: new Map([[`${MODULE_ID}.warlord-fighting-styles`, pack]])
    }),
    /missing a migration source/
  );
});

test('selectively migrates Fighting Style activities and effects while preserving player data', async () => {
  const coreSources = canonicalSources();
  const styleSources = canonicalStyleSources();
  const userActivity = {
    id: 'userActivityId',
    name: 'My custom style activity',
    type: 'attack',
    flags: { otherModule: { keep: true } }
  };
  const balancedEffect = {
    _id: 'BalFightDmgEff01',
    id: 'BalFightDmgEff01',
    name: 'My renamed damage effect',
    type: 'legacy',
    transfer: true,
    system: { stale: true },
    changes: [],
    disabled: true,
    duration: { rounds: 99 },
    description: '<p>Keep my effect notes.</p>',
    flags: {
      otherModule: { keep: 'balanced-effect' },
      [MODULE_ID]: {
        warlord: { role: 'fighting-style-effect' }
      }
    }
  };
  const balanced = ownedItem({
    id: 'owned-balanced',
    identifier: 'balanced-fighting',
    activities: [
      staleActivity(styleSources.balanced.system.activities.BalFightEnchant1),
      userActivity
    ],
    effects: [balancedEffect]
  });
  const userAcEffect = {
    _id: 'user-ac-effect',
    id: 'user-ac-effect',
    name: 'My other AC effect',
    changes: [{
      key: 'system.attributes.ac.bonus',
      mode: 2,
      value: '3',
      priority: 20
    }],
    disabled: false,
    flags: { otherModule: { keep: true } }
  };
  const defensive = ownedItem({
    id: 'owned-defensive',
    identifier: 'defensive-fighting',
    effects: [userAcEffect]
  });
  const mountedEffect = {
    ...clone(styleSources.mounted.effects[0]),
    name: 'My mounted effect',
    disabled: false,
    description: '<p>Keep mounted effect notes.</p>',
    flags: {
      otherModule: { keep: 'mounted-effect' },
      ...styleMetadata('mounted-warrior', 'mounted-ac')
    },
    changes: []
  };
  const customMountedName = 'My Cavalry Training';
  const customMountedDescription = '<p>Keep my mounted prose.</p>';
  const mounted = ownedItem({
    id: 'owned-mounted',
    identifier: 'mounted-warrior',
    name: customMountedName,
    description: customMountedDescription,
    activities: [],
    effects: [mountedEffect]
  });
  const actor = actorFixture({
    items: [warlordClass(), balanced, defensive, mounted],
    leadershipAbility: undefined
  });

  assert.equal(await migrateWarlordActor(actor, {
    loadSourceItems: async () => coreSources,
    loadExploitSourceItems: async () => ({}),
    loadStyleSourceItems: async () => styleSources
  }), true);

  assert.ok(balanced.system.activities.BalFightEnchant1);
  assert.ok(balanced.system.activities.userActivityId);
  assert.ok(mounted.system.activities.MountedUseAct001);
  assert.ok(defensive.effects.some(effect => effect._id === 'user-ac-effect'));
  const defensiveCanonical = defensive.effects.find(effect => (
    effect.flags?.[MODULE_ID]?.warlord?.role === 'fighting-style-effect'
  ));
  assert.equal(defensiveCanonical._id, 'DefensiveACEff01');
  assert.equal(defensiveCanonical.disabled, true);
  assert.deepEqual(defensive.embeddedCreateCalls[0].options, { keepId: true });

  const migratedBalancedEffect = balanced.effects.find(effect => (
    effect._id === 'BalFightDmgEff01'
  ));
  assert.equal(migratedBalancedEffect.name, 'My renamed damage effect');
  assert.equal(
    migratedBalancedEffect.description,
    '<p>Keep my effect notes.</p>'
  );
  assert.deepEqual(
    migratedBalancedEffect.flags.otherModule,
    { keep: 'balanced-effect' }
  );
  assert.deepEqual(
    migratedBalancedEffect.flags[MODULE_ID].warlord,
    styleSources.balanced.effects[0].flags[MODULE_ID].warlord
  );
  assert.equal(migratedBalancedEffect.disabled, true);
  assert.deepEqual(
    migratedBalancedEffect.changes,
    styleSources.balanced.effects[0].changes
  );
  assert.equal(migratedBalancedEffect.type, 'enchantment');
  assert.deepEqual(
    migratedBalancedEffect.system,
    styleSources.balanced.effects[0].system
  );
  const migratedMountedEffect = mounted.effects.find(effect => (
    effect._id === 'MountedACEff0001'
  ));
  assert.equal(migratedMountedEffect.disabled, false);
  assert.deepEqual(
    migratedMountedEffect.changes,
    styleSources.mounted.effects[0].changes
  );
  assert.equal(mounted.name, customMountedName);
  assert.equal(mounted.system.description.value, customMountedDescription);
  assert.deepEqual(mounted.flags.otherModule, { keep: true });
  assert.equal(actor.flags[MODULE_ID].warlord.migrationVersion, 3);

  assert.equal(await migrateWarlordActor(actor, {
    loadSourceItems: async () => {
      throw new Error('an idempotent style migration must not reload core');
    },
    loadExploitSourceItems: async () => {
      throw new Error('an idempotent style migration must not reload exploits');
    },
    loadStyleSourceItems: async () => {
      throw new Error('an idempotent style migration must not reload styles');
    }
  }), false);
});

test('preserves enabled and disabled state on existing eligibility effects', async () => {
  const coreSources = canonicalSources();
  const styleSources = canonicalStyleSources();
  const options = {
    loadSourceItems: async () => coreSources,
    loadExploitSourceItems: async () => ({}),
    loadStyleSourceItems: async () => ({ defensive: styleSources.defensive })
  };
  for (const disabled of [false, true]) {
    const effect = {
      ...clone(styleSources.defensive.effects[0]),
      changes: [],
      disabled
    };
    const defensive = ownedItem({
      id: `owned-defensive-${disabled}`,
      identifier: 'defensive-fighting',
      effects: [effect]
    });
    const actor = actorFixture({
      items: [warlordClass(), defensive],
      leadershipAbility: undefined
    });

    assert.equal(await migrateWarlordActor(actor, options), true);
    assert.equal(
      defensive.effects.find(entry => entry._id === 'DefensiveACEff01').disabled,
      disabled
    );
    assert.deepEqual(
      defensive.effects.find(entry => entry._id === 'DefensiveACEff01').changes,
      styleSources.defensive.effects[0].changes
    );
  }
});

test('leaves the migration flag absent until Fighting Style effects succeed and retries safely', async () => {
  const coreSources = canonicalSources();
  const styleSources = canonicalStyleSources();
  const defensive = ownedItem({
    id: 'owned-defensive',
    identifier: 'defensive-fighting',
    effects: [],
    failEffectCreates: 1
  });
  const actor = actorFixture({
    items: [warlordClass(), defensive],
    leadershipAbility: undefined
  });
  const options = {
    loadSourceItems: async () => coreSources,
    loadExploitSourceItems: async () => ({}),
    loadStyleSourceItems: async () => styleSources
  };

  await assert.rejects(
    migrateWarlordActor(actor, options),
    /forced defensive-fighting effect create failure/
  );
  assert.equal(actor.flags[MODULE_ID].warlord.migrationVersion, undefined);
  assert.deepEqual(defensive.effects, []);

  assert.equal(await migrateWarlordActor(actor, options), true);
  assert.ok(defensive.effects.some(effect => effect._id === 'DefensiveACEff01'));
  assert.equal(actor.flags[MODULE_ID].warlord.migrationVersion, 3);
});

test('selectively migrates owned Tier A, B, and C Exploits and configures every canonical save', async () => {
  const coreSources = canonicalSources();
  const exploitSources = canonicalExploitSources();
  const dirtySource = exploitSources.dirtyHit.system.activities;
  const customDescription = '<p>Keep my custom Dirty Hit prose.</p>';
  const originalSpent = 2;
  const originalUserActivity = {
    id: 'userActivityId',
    name: 'My custom Exploit activity',
    type: 'attack',
    range: { units: 'ft', value: 45 },
    flags: { otherModule: { keep: true } }
  };
  const dirtyHit = ownedItem({
    id: 'owned-dirty',
    identifier: 'dirty-hit',
    description: customDescription,
    spent: originalSpent,
    activities: [
      staleActivity(dirtySource.DirtyHitAct01ABC, {
        damage: { onSave: 'half', parts: [] },
        effects: [{ _id: 'StaleEffectRef01', onSave: true }]
      }),
      originalUserActivity
    ],
    effects: [
      {
        _id: 'DirtyHitProne01A',
        id: 'DirtyHitProne01A',
        name: 'Stale prone effect',
        statuses: [],
        duration: { rounds: 99 }
      },
      { _id: 'user-effect', id: 'user-effect', name: 'Keep me' }
    ]
  });
  const parry = ownedItem({
    id: 'owned-parry',
    identifier: 'parry',
    activities: [originalUserActivity]
  });
  const attackOrder = ownedItem({
    id: 'owned-attack',
    identifier: 'attack-order',
    activities: [originalUserActivity]
  });
  const actor = actorFixture({
    items: [warlordClass(10), dirtyHit, parry, attackOrder],
    leadershipAbility: 'int'
  });

  assert.equal(await migrateWarlordActor(actor, {
    loadSourceItems: async () => coreSources,
    loadExploitSourceItems: async () => exploitSources
  }), true);

  assert.ok(dirtyHit.system.activities.DirtyHitAct01ABC);
  assert.ok(dirtyHit.system.activities.DirtyRepeat01ABC);
  assert.ok(dirtyHit.system.activities.DirtyResolut01A);
  assert.ok(parry.system.activities.ParryAct01ABCDEF);
  assert.deepEqual(attackOrder.system.activities, {
    userActivityId: originalUserActivity
  });
  assert.deepEqual(attackOrder.effects, [{ id: 'user-effect', name: 'Keep me' }]);
  assert.equal(dirtyHit.system.uses.spent, originalSpent);
  assert.equal(dirtyHit.system.description.value, customDescription);
  assert.equal(dirtyHit.system.activities.userActivityId.range.value, 45);
  assert.equal(
    dirtyHit.system.activities.DirtyHitAct01ABC.save.dc.calculation,
    'int'
  );
  assert.equal(
    dirtyHit.system.activities.DirtyRepeat01ABC.save.dc.calculation,
    'int'
  );
  assert.equal(
    dirtyHit.system.activities.DirtyHitAct01ABC.consumption.targets[0].target,
    'tactical-exploits'
  );
  assert.deepEqual(
    dirtyHit.system.activities.DirtyHitAct01ABC.damage,
    dirtySource.DirtyHitAct01ABC.damage
  );
  assert.deepEqual(
    dirtyHit.system.activities.DirtyHitAct01ABC.effects,
    dirtySource.DirtyHitAct01ABC.effects
  );
  assert.equal(
    dirtyHit.effects.find(effect => effect._id === 'DirtyHitProne01A').name,
    'Dirty Hit — Prone'
  );
  assert.ok(dirtyHit.effects.some(effect => effect._id === 'DirtyNoReact01AB'));
  assert.equal(
    dirtyHit.effects.find(effect => effect._id === 'user-effect').name,
    'Keep me'
  );
  assert.equal(
    dirtyHit.embeddedUpdateCalls[0].updates[0]._key,
    undefined
  );
  assert.equal(
    dirtyHit.embeddedCreateCalls[0].creates[0]._key,
    undefined
  );
  assert.deepEqual(dirtyHit.embeddedCreateCalls[0].options, { keepId: true });
  for (const reference of dirtyHit.system.activities.DirtyHitAct01ABC.effects) {
    assert.ok(dirtyHit.effects.some(effect => effect._id === reference._id));
  }
  assert.equal(actor.flags[MODULE_ID].warlord.migrationVersion, 3);
});

test('Tactical Superiority doubles only canonical 15 and 30 foot Exploit ranges', async () => {
  const coreSources = canonicalSources();
  const exploitSources = canonicalExploitSources();
  const warlord = warlordClass(10);
  const dirtyHit = ownedItem({
    id: 'owned-dirty',
    identifier: 'dirty-hit',
    activities: [
      staleActivity(exploitSources.dirtyHit.system.activities.DirtyHitAct01ABC),
      staleActivity(exploitSources.dirtyHit.system.activities.DirtyRepeat01ABC),
      staleActivity(exploitSources.dirtyHit.system.activities.DirtyResolut01A),
      {
        id: 'userActivityId',
        type: 'utility',
        range: { units: 'ft', value: 25 }
      }
    ]
  });
  const firstAid = ownedItem({
    id: 'owned-first-aid',
    identifier: 'first-aid',
    activities: [
      staleActivity(exploitSources.firstAid.system.activities.FirstAidAct01ABC)
    ]
  });
  const actor = actorFixture({
    items: [warlord, dirtyHit, firstAid],
    leadershipAbility: undefined
  });
  let exploitLoads = 0;
  const loadExploitSourceItems = async () => {
    exploitLoads += 1;
    return clone(exploitSources);
  };

  await reconcileWarlordActor(actor, {
    loadSourceItems: async () => coreSources,
    loadExploitSourceItems
  });
  assert.equal(dirtyHit.system.activities.DirtyHitAct01ABC.range.value, 15);
  assert.equal(dirtyHit.system.activities.DirtyRepeat01ABC.range.value, 30);
  assert.equal(dirtyHit.system.activities.DirtyResolut01A.range.value, 15);
  assert.equal(firstAid.system.activities.FirstAidAct01ABC.range.value, 5);

  warlord.system.levels = 11;
  await reconcileWarlordActor(actor, {
    loadSourceItems: async () => coreSources,
    loadExploitSourceItems
  });
  assert.equal(dirtyHit.system.activities.DirtyHitAct01ABC.range.value, 30);
  assert.equal(dirtyHit.system.activities.DirtyRepeat01ABC.range.value, 60);
  assert.equal(dirtyHit.system.activities.DirtyResolut01A.range.value, 30);
  assert.equal(firstAid.system.activities.FirstAidAct01ABC.range.value, 5);
  assert.equal(dirtyHit.system.activities.userActivityId.range.value, 25);

  warlord.system.levels = 10;
  await reconcileWarlordActor(actor, {
    loadSourceItems: async () => coreSources,
    loadExploitSourceItems
  });
  assert.equal(dirtyHit.system.activities.DirtyHitAct01ABC.range.value, 15);
  assert.equal(dirtyHit.system.activities.DirtyRepeat01ABC.range.value, 30);
  assert.equal(dirtyHit.system.activities.DirtyResolut01A.range.value, 15);
  assert.equal(firstAid.system.activities.FirstAidAct01ABC.range.value, 5);
  assert.equal(dirtyHit.system.activities.userActivityId.range.value, 25);
  assert.equal(exploitLoads, 3);
});

test('selectively migrates Warlord structures while preserving presentation and user data', async () => {
  const sources = canonicalSources();
  const inspiringSource = sources.inspiring.system.activities;
  const customLauncher = staleActivity(inspiringSource.InspiringLaunch1);
  const customHelper = staleActivity(inspiringSource.InspiringHelp01);
  const userActivity = {
    id: 'userActivityId',
    name: 'My custom action',
    type: 'attack',
    flags: { otherModule: { keep: true } }
  };
  const inspiring = ownedItem({
    id: 'owned-inspiring',
    identifier: 'inspiring-word',
    name: 'My Rallying Words',
    description: '<p>Keep my prose.</p>',
    spent: 2,
    activities: [customLauncher, customHelper, userActivity]
  });
  inspiring.flags.dnd5e = {
    riders: { activity: ['foreignRider001', 'InspiringHelp01'] }
  };
  const rally = ownedItem({
    id: 'owned-rally',
    identifier: 'rallying-cry',
    activities: [staleActivity(sources.rallying.system.activities.RallyingCryAct01)]
  });
  const actor = actorFixture({ items: [warlordClass(5), inspiring, rally] });

  assert.equal(await migrateWarlordActor(actor, {
    loadSourceItems: async () => sources
  }), true);
  assert.equal(actor.flags[MODULE_ID].warlord.migrationVersion, 3);
  assert.equal(actor.inspiring.system.uses.spent, 2);
  assert.equal(actor.inspiring.name, 'My Rallying Words');
  assert.equal(actor.inspiring.system.description.value, '<p>Keep my prose.</p>');
  assert.ok(actor.inspiring.system.activities.userActivityId);
  assert.deepEqual(actor.inspiring.flags.otherModule, { keep: true });
  assert.deepEqual(actor.inspiring.flags.dnd5e.riders.activity, [
    'foreignRider001',
    'InspiringHelp01',
    'InspiringHelp02'
  ]);
  assert.deepEqual(actor.inspiring.effects, [{ id: 'user-effect', name: 'Keep me' }]);

  const launcher = actor.inspiring.system.activities.InspiringLaunch1;
  assert.equal(launcher.type, 'utility');
  assert.deepEqual(launcher.activation, inspiringSource.InspiringLaunch1.activation);
  assert.equal(launcher.name, 'My Canonical inspiring-word-launcher');
  assert.equal(launcher.description.chatFlavor, 'My activity flavor');
  assert.deepEqual(launcher.flags.otherModule, { keep: true });
  assert.ok(actor.inspiring.system.activities.InspiringHelp01);
  assert.ok(actor.inspiring.system.activities.InspiringHelp02);
  assert.equal(
    actor.inspiring.system.activities.InspiringHelp01
      .flags[MODULE_ID].warlord.hitDie,
    8
  );
  assert.equal(
    actor.inspiring.system.activities.InspiringHelp02
      .flags[MODULE_ID].warlord.hitDie,
    10
  );
  assert.equal(
    inspiring.updateCalls.some(changes => (
      Object.hasOwn(changes, 'system.activities.InspiringLaunch1')
    )),
    false,
    'an existing activity must be patched only through the allowed field paths'
  );
  assert.equal(rally.system.uses.recovery.length, 1);
  assert.equal(rally.system.activities.RallyingCryAct01.range.value, 30);
  assert.equal(rally.system.activities.RallyingCryAct01.roll.formula, '@abilities.wis.mod');

  assert.equal(await migrateWarlordActor(actor, {
    loadSourceItems: async () => {
      throw new Error('an idempotent migration must not reload the pack');
    }
  }), false);
});

test('clamps spent uses only when the resolved numeric maximum is lower', async () => {
  const sources = canonicalSources();
  sources.tactical.system.uses.max = 2;
  const tactical = ownedItem({
    id: 'owned-tactical',
    identifier: 'tactical-exploits',
    spent: 5,
    activities: [staleActivity(sources.tactical.system.activities.TacticalSkill001)]
  });
  const actor = actorFixture({ items: [warlordClass(), tactical] });

  await migrateWarlordActor(actor, { loadSourceItems: async () => sources });

  assert.equal(tactical.system.uses.spent, 2);
});

test('leaves the migration flag absent after a partial failure and repairs the remainder on retry', async () => {
  const sources = canonicalSources();
  const inspiring = ownedItem({
    id: 'owned-inspiring',
    identifier: 'inspiring-word',
    activities: [staleActivity(sources.inspiring.system.activities.InspiringLaunch1)]
  });
  const rally = ownedItem({
    id: 'owned-rally',
    identifier: 'rallying-cry',
    failUpdates: 1,
    activities: [staleActivity(sources.rallying.system.activities.RallyingCryAct01)]
  });
  const actor = actorFixture({ items: [warlordClass(), inspiring, rally] });

  await assert.rejects(
    migrateWarlordActor(actor, { loadSourceItems: async () => sources }),
    /forced rallying-cry update failure/
  );
  assert.equal(actor.flags[MODULE_ID].warlord.migrationVersion, undefined);
  assert.equal(inspiring.system.activities.InspiringLaunch1.type, 'utility');
  assert.equal(rally.system.activities.RallyingCryAct01.type, 'legacy');
  const completedInspiringUpdates = inspiring.updateCalls.length;

  assert.equal(await migrateWarlordActor(actor, {
    loadSourceItems: async () => sources
  }), true);
  assert.equal(actor.flags[MODULE_ID].warlord.migrationVersion, 3);
  assert.equal(rally.system.activities.RallyingCryAct01.type, 'utility');
  assert.ok(inspiring.updateCalls.length >= completedInspiringUpdates);
  assert.equal(
    inspiring.system.activities.InspiringLaunch1.name,
    'My Canonical inspiring-word-launcher'
  );
});

test('sets no migration flag until Exploit repair succeeds and retries safely', async () => {
  const sources = canonicalSources();
  const exploitSources = canonicalExploitSources();
  const dirtyHit = ownedItem({
    id: 'owned-dirty',
    identifier: 'dirty-hit',
    failUpdates: 1,
    activities: []
  });
  const actor = actorFixture({
    items: [warlordClass(), dirtyHit],
    leadershipAbility: undefined
  });

  await assert.rejects(
    migrateWarlordActor(actor, {
      loadSourceItems: async () => sources,
      loadExploitSourceItems: async () => exploitSources
    }),
    /forced dirty-hit update failure/
  );
  assert.equal(actor.flags[MODULE_ID].warlord.migrationVersion, undefined);
  assert.equal(dirtyHit.system.activities.DirtyHitAct01ABC, undefined);

  assert.equal(await migrateWarlordActor(actor, {
    loadSourceItems: async () => sources,
    loadExploitSourceItems: async () => exploitSources
  }), true);
  assert.ok(dirtyHit.system.activities.DirtyHitAct01ABC);
  assert.equal(actor.flags[MODULE_ID].warlord.migrationVersion, 3);
});

test('sets no migration flag until embedded Exploit effects succeed and retries safely', async () => {
  const sources = canonicalSources();
  const exploitSources = canonicalExploitSources();
  const dirtyHit = ownedItem({
    id: 'owned-dirty',
    identifier: 'dirty-hit',
    activities: [],
    effects: [],
    failEffectCreates: 1
  });
  const actor = actorFixture({
    items: [warlordClass(), dirtyHit],
    leadershipAbility: undefined
  });

  await assert.rejects(
    migrateWarlordActor(actor, {
      loadSourceItems: async () => sources,
      loadExploitSourceItems: async () => exploitSources
    }),
    /forced dirty-hit effect create failure/
  );
  assert.equal(actor.flags[MODULE_ID].warlord.migrationVersion, undefined);
  assert.deepEqual(dirtyHit.effects, []);

  assert.equal(await migrateWarlordActor(actor, {
    loadSourceItems: async () => sources,
    loadExploitSourceItems: async () => exploitSources
  }), true);
  assert.deepEqual(
    dirtyHit.effects.map(effect => effect._id).sort(),
    ['DirtyHitProne01A', 'DirtyNoReact01AB'].sort()
  );
  assert.equal(actor.flags[MODULE_ID].warlord.migrationVersion, 3);
});

test('reconciliation reapplies canonical base values after a level reduction', async () => {
  const sources = canonicalSources();
  const warlord = warlordClass(11);
  const inspiring = ownedItem({
    id: 'owned-inspiring',
    identifier: 'inspiring-word',
    activities: [
      staleActivity(sources.inspiring.system.activities.InspiringHelp01, {
        range: { units: 'ft', value: 30 }
      })
    ]
  });
  const rally = ownedItem({
    id: 'owned-rally',
    identifier: 'rallying-cry',
    activities: [
      staleActivity(sources.rallying.system.activities.RallyingCryAct01, {
        range: { units: 'ft', value: 30 }
      })
    ]
  });
  inspiring.system.uses.recovery = [{ period: 'sr', type: 'recoverAll' }];
  rally.system.uses.recovery = [{ period: 'sr', type: 'recoverAll' }];
  const actor = actorFixture({ items: [warlord, inspiring, rally], leadershipAbility: 'int' });

  await reconcileWarlordActor(actor, { loadSourceItems: async () => sources });
  assert.equal(inspiring.system.activities.InspiringHelp01.range.value, 60);
  assert.equal(rally.system.activities.RallyingCryAct01.range.value, 60);
  assert.deepEqual(inspiring.system.uses.recovery, sources.inspiring.system.uses.recovery);
  assert.deepEqual(rally.system.uses.recovery, sources.rallying.system.uses.recovery);

  warlord.system.levels = 5;
  await reconcileWarlordActor(actor, { loadSourceItems: async () => sources });

  assert.equal(inspiring.system.activities.InspiringHelp01.range.value, 30);
  assert.equal(rally.system.activities.RallyingCryAct01.range.value, 30);
  assert.deepEqual(inspiring.system.uses.recovery, [
    { period: 'sr', type: 'recoverAll' }
  ]);
  assert.deepEqual(rally.system.uses.recovery, [
    { period: 'sr', type: 'recoverAll' }
  ]);
  assert.equal(rally.system.activities.RallyingCryAct01.roll.formula, '@abilities.int.mod');
  assert.equal(
    inspiring.system.activities.InspiringHelp01.description.chatFlavor,
    'My activity flavor'
  );
});

test('reconciliation does not coerce a canonical null range to zero', async () => {
  const sources = canonicalSources();
  const tactical = ownedItem({
    id: 'owned-tactical',
    identifier: 'tactical-exploits',
    activities: [clone(sources.tactical.system.activities.TacticalSkill001)]
  });
  const actor = actorFixture({ items: [warlordClass(11), tactical] });

  await reconcileWarlordActor(actor, { loadSourceItems: async () => sources });

  assert.equal(tactical.system.activities.TacticalSkill001.range.value, null);
  assert.equal(tactical.updateCalls.length, 0);
});

test('concurrent reconciliations finish at the latest Warlord level', async () => {
  const sources = canonicalSources();
  const warlord = warlordClass(11);
  const inspiring = ownedItem({
    id: 'owned-inspiring',
    identifier: 'inspiring-word',
    activities: [staleActivity(sources.inspiring.system.activities.InspiringHelp01, {
      range: { units: 'ft', value: 30 }
    })]
  });
  inspiring.system.uses.recovery = [{ period: 'sr', type: 'recoverAll' }];
  const applyUpdate = inspiring.update.bind(inspiring);
  let updateAttempts = 0;
  let releaseOlder;
  let signalOlderStarted;
  const olderStarted = new Promise(resolve => { signalOlderStarted = resolve; });
  const olderRelease = new Promise(resolve => { releaseOlder = resolve; });
  inspiring.update = async changes => {
    updateAttempts += 1;
    if (updateAttempts === 1) {
      signalOlderStarted();
      await olderRelease;
    }
    await applyUpdate(changes);
  };
  const actor = actorFixture({ items: [warlord, inspiring], leadershipAbility: undefined });

  const older = reconcileWarlordActor(actor, {
    loadSourceItems: async () => sources
  });
  await olderStarted;
  warlord.system.levels = 5;
  const newer = reconcileWarlordActor(actor, {
    loadSourceItems: async () => sources
  });
  await Promise.resolve();
  releaseOlder();
  await Promise.all([older, newer]);

  assert.equal(inspiring.system.activities.InspiringHelp01.range.value, 30);
  assert.deepEqual(inspiring.system.uses.recovery, [
    { period: 'sr', type: 'recoverAll' }
  ]);
});
