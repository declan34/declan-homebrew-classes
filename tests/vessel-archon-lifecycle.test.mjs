import test from 'node:test';
import assert from 'node:assert/strict';

import {
  activateArchonForm,
  extendArchonForm,
  finalizeArchonTransformation,
  getArchonState,
  isArchonFormActive,
  prepareArchonTransformData,
  reconcileArchonForm,
  revertArchonForm
} from '../scripts/vessel/archon-lifecycle.mjs';
import { activateSpiritMantle } from '../scripts/vessel/mantle.mjs';
import { serializeActorOperation } from '../scripts/vessel/operations.mjs';

const MODULE_ID = 'declan-homebrew-classes';

function effect(data) {
  return {
    ...structuredClone(data),
    toObject() {
      const { toObject, ...source } = this;
      return structuredClone(source);
    }
  };
}

function spiritMantleItem() {
  return {
    id: 'owned-spirit-mantle',
    uuid: 'Actor.formactor0000001.Item.owned-spirit-mantle',
    type: 'feat',
    system: { identifier: 'spirit-mantle' },
    effects: [effect({
      _id: 'mantle-template',
      transfer: false,
      disabled: true,
      changes: [{
        key: 'system.attributes.ac.min',
        mode: 4,
        value: '10 + @abilities.con.mod + @abilities.cha.mod',
        priority: 20
      }],
      flags: {
        [MODULE_ID]: { vessel: { role: 'mantle-ac' } }
      }
    })]
  };
}

function direStatureItem() {
  return {
    id: 'owned-dire-stature',
    uuid: 'Actor.formactor0000001.Item.owned-dire-stature',
    type: 'feat',
    system: {identifier: 'dire-stature'},
    effects: [effect({
      _id: 'dire-stature-template',
      name: 'Dire Stature',
      disabled: true,
      transfer: false,
      changes: [{
        key: 'system.attributes.ac.bonus', mode: 2, value: '1', priority: 20
      }, {
        key: 'system.bonuses.mwak.damage', mode: 2, value: '1d4', priority: 20
      }, {
        key: 'system.bonuses.msak.damage', mode: 2, value: '1d4', priority: 20
      }],
      description: '<p>Increase your melee reach while grown.</p>',
      flags: {
        [MODULE_ID]: {
          vessel: {
            role: 'dire-stature-effect',
            stage3Binding: 'archon',
            stage3Source: 'dire-stature'
          }
        }
      }
    })]
  };
}

function mockActor({
  id = 'formactor0000001',
  level = 6,
  languages = new Set(['common']),
  customLanguages = '',
  temp = 0,
  owner = true,
  state,
  effects = [],
  items,
  isToken = false
} = {}) {
  let nextEffect = 0;
  let nextItem = 0;
  const target = {
    id,
    uuid: isToken ? `Scene.scene0000000001.Token.${id}` : `Actor.${id}`,
    documentName: 'Actor',
    type: 'character',
    img: 'icons/original-portrait.webp',
    prototypeToken: { texture: { src: 'icons/original-token.webp' } },
    isOwner: owner,
    isToken,
    flags: state ? {
      [MODULE_ID]: { vessel: { archon: { state: structuredClone(state) } } }
    } : {},
    effects: effects.map(effect),
    items: items ?? [],
    itemTypes: { equipment: [] },
    classes: {
      vessel: { system: { levels: level } }
    },
    system: {
      traits: {
        languages: {
          value: new Set(languages),
          custom: customLanguages
        },
        weaponProf: { value: new Set(['simpleM']), custom: 'Moonblade' }
      },
      attributes: {
        ac: { calc: 'default' },
        hp: { value: 20, max: 20, temp },
        movement: { walk: 30, fly: null, units: 'ft', hover: false },
        senses: { units: 'ft', ranges: { darkvision: 60 } }
      }
    },
    operations: [],
    getFlag(scope, key) {
      if (scope !== MODULE_ID) return undefined;
      return key.split('.').reduce(
        (value, segment) => value?.[segment],
        this.flags?.[scope]
      );
    },
    async setFlag(scope, key, value) {
      this.operations.push(['setFlag', key, structuredClone(value)]);
      this.flags[scope] ??= {};
      const path = key.split('.');
      let current = this.flags[scope];
      for (const segment of path.slice(0, -1)) current = current[segment] ??= {};
      current[path.at(-1)] = structuredClone(value);
    },
    async unsetFlag(scope, key) {
      this.operations.push(['unsetFlag', key]);
      const path = key.split('.');
      let current = this.flags?.[scope];
      for (const segment of path.slice(0, -1)) current = current?.[segment];
      if (current) delete current[path.at(-1)];
    },
    toObject() {
      return {
        img: this.img,
        prototypeToken: structuredClone(this.prototypeToken),
        system: structuredClone(this.system)
      };
    },
    async update(changes) {
      this.operations.push(['update', structuredClone(changes)]);
      for (const [path, value] of Object.entries(changes)) {
        const segments = path.split('.');
        let current = this;
        for (const segment of segments.slice(0, -1)) {
          current = current[segment] ??= {};
        }
        current[segments.at(-1)] = structuredClone(value);
      }
    },
    async createEmbeddedDocuments(type, rows) {
      this.operations.push(['createEmbeddedDocuments', structuredClone(rows)]);
      const created = rows.map(row => {
        const createdRow = {
          ...structuredClone(row),
          _id: type === 'ActiveEffect'
            ? `created-effect-${++nextEffect}`
            : `created-item-${++nextItem}`
        };
        createdRow.id = createdRow._id;
        createdRow.toObject = effect(createdRow).toObject;
        return createdRow;
      });
      if (type === 'ActiveEffect') this.effects.push(...created);
      else if (type === 'Item') this.items.push(...created);
      else assert.fail(`Unexpected embedded document type ${type}`);
      return created;
    },
    async updateEmbeddedDocuments(type, rows) {
      assert.equal(type, 'ActiveEffect');
      this.operations.push(['updateEmbeddedDocuments', structuredClone(rows)]);
      for (const row of rows) {
        Object.assign(
          this.effects.find(candidate => candidate._id === row._id),
          structuredClone(row)
        );
      }
    },
    async deleteEmbeddedDocuments(type, ids) {
      this.operations.push(['deleteEmbeddedDocuments', structuredClone(ids)]);
      if (type === 'ActiveEffect') {
        this.effects = this.effects.filter(candidate => !ids.includes(candidate._id));
      } else if (type === 'Item') {
        this.items = this.items.filter(candidate => !ids.includes(candidate._id));
      } else assert.fail(`Unexpected embedded document type ${type}`);
    }
  };
  if (!target.items.length) target.items.push(spiritMantleItem());
  return target;
}

function switchProfile() {
  return {
    uuid: 'Compendium.test.Actor.cursed',
    img: 'systems/dnd5e/tokens/fiend/PitFiend.webp',
    flags: {
      [MODULE_ID]: {
        vessel: { archon: { profile: 'cursed', acBonus: 1 } }
      }
    },
    system: {
      attributes: {
        movement: { walk: 40, fly: 40, units: 'ft', hover: false },
        senses: { units: 'ft', ranges: { darkvision: 120 } }
      },
      traits: {
        languages: { value: new Set(['infernal']), custom: '' },
        dr: { value: new Set(['fire']), custom: '' }
      }
    },
    items: [{
      _id: 'profile-attack-id',
      name: 'Infernal Drain',
      type: 'feat',
      system: { identifier: 'infernal-drain', activities: {} },
      flags: {}
    }],
    effects: [{
      _id: 'profile-effect-id',
      name: 'Cursed Aura',
      disabled: false,
      changes: [],
      flags: {}
    }]
  };
}

test('in-place activation keeps the original Actor and tags copied profile documents', async () => {
  const target = mockActor({ level: 6, temp: 3 });
  const token = {
    uuid: 'Scene.scene.Token.vessel',
    texture: { src: 'icons/live-token.webp' },
    updates: [],
    async update(changes) {
      this.updates.push(structuredClone(changes));
      this.texture.src = changes['texture.src'];
    }
  };
  target.getActiveTokens = () => [{ document: token }];
  target.transformInto = async () => assert.fail('native transform must not run');
  const pending = {
    payment: 'slot',
    profile: 'cursed',
    profileUuid: 'Compendium.test.Actor.cursed',
    transformationId: 'chat-message-one'
  };

  const result = await activateArchonForm(target, switchProfile(), pending, {
    now: 100
  });

  assert.equal(result, target);
  assert.equal(target.img, 'systems/dnd5e/tokens/fiend/PitFiend.webp');
  assert.equal(
    target.prototypeToken.texture.src,
    'systems/dnd5e/tokens/fiend/PitFiend.webp'
  );
  assert.equal(token.texture.src, 'systems/dnd5e/tokens/fiend/PitFiend.webp');
  assert.equal(target.system.attributes.movement.fly, 40);
  assert.equal(target.system.attributes.hp.temp, 12);
  assert.deepEqual(
    target.system.traits.weaponProf,
    { value: new Set(['simpleM']), custom: 'Moonblade' }
  );

  const temporaryItem = target.items.find(item =>
    item.system?.identifier === 'infernal-drain'
  );
  const temporaryEffect = target.effects.find(effect => effect.name === 'Cursed Aura');
  for (const document of [temporaryItem, temporaryEffect]) {
    assert.deepEqual(
      document.flags[MODULE_ID].vessel.archon.temporary,
      { transformationId: 'chat-message-one', profile: 'cursed' }
    );
  }
  const state = getArchonState(target);
  assert.equal(state.active, true);
  assert.equal(state.sourceActorUuid, target.uuid);
  assert.deepEqual(state.temporaryItemIds, [temporaryItem.id]);
  assert.deepEqual(state.temporaryEffectIds, [temporaryEffect.id]);
  assert.equal(state.snapshot.actor.img, 'icons/original-portrait.webp');
  assert.equal(state.snapshot.tokens[0].textureSrc, 'icons/live-token.webp');
});

test('reactivation preserves an activating or cleanup-pending transformation exactly', async () => {
  for (const phase of ['activating', 'cleanupPending']) {
    const transformationId = `original-${phase}`;
    const temporaryItem = {
      _id: `temporary-item-${phase}`,
      id: `temporary-item-${phase}`,
      type: 'feat',
      system: {identifier: `temporary-${phase}`},
      flags: {
        [MODULE_ID]: {
          vessel: {archon: {temporary: {transformationId, profile: 'cursed'}}}
        }
      }
    };
    const temporaryEffect = {
      _id: `temporary-effect-${phase}`,
      id: `temporary-effect-${phase}`,
      flags: {
        [MODULE_ID]: {
          vessel: {archon: {temporary: {transformationId, profile: 'cursed'}}}
        }
      }
    };
    const state = {
      active: false,
      [phase]: true,
      profile: 'cursed',
      profileUuid: 'Compendium.test.Actor.cursed',
      transformationId,
      temporaryItemIds: [temporaryItem.id],
      temporaryEffectIds: [temporaryEffect.id],
      snapshot: {
        actor: {img: 'icons/original-portrait.webp'},
        tokens: [{uuid: 'Scene.scene.Token.original'}]
      }
    };
    const target = mockActor({
      state,
      items: [spiritMantleItem(), temporaryItem],
      effects: [temporaryEffect]
    });

    await assert.rejects(
      activateArchonForm(target, switchProfile(), {
        payment: 'slot',
        profile: 'cursed',
        profileUuid: 'Compendium.test.Actor.cursed',
        transformationId: `attempted-${phase}`
      }),
      /Archon Form/u
    );

    assert.deepEqual(getArchonState(target), state);
    assert.deepEqual(target.items.map(item => item.id), [
      'owned-spirit-mantle',
      temporaryItem.id
    ]);
    assert.deepEqual(target.effects.map(effect => effect.id), [temporaryEffect.id]);
    assert.equal(target.operations.length, 0);
  }
});

test('in-place reversion restores snapshots and removes only matching temporary documents', async () => {
  const unrelatedItem = {
    _id: 'unrelated-item',
    id: 'unrelated-item',
    name: 'Keep Me',
    type: 'feat',
    system: { identifier: 'keep-me' },
    flags: { other: { keep: true } }
  };
  const target = mockActor({ level: 6, temp: 4, items: [
    spiritMantleItem(),
    unrelatedItem
  ], effects: [{
    _id: 'unrelated-effect',
    name: 'Keep This Effect',
    flags: { other: { keep: true } }
  }] });
  const token = {
    uuid: 'Scene.scene.Token.vessel',
    texture: { src: 'icons/live-token.webp' },
    async update(changes) { this.texture.src = changes['texture.src']; }
  };
  target.getActiveTokens = () => [{ document: token }];
  await activateArchonForm(target, switchProfile(), {
    payment: 'free',
    profile: 'cursed',
    profileUuid: 'Compendium.test.Actor.cursed',
    transformationId: 'chat-message-two'
  }, { now: 200 });

  const result = await revertArchonForm(target);

  assert.equal(result, target);
  assert.equal(getArchonState(target), undefined);
  assert.equal(target.img, 'icons/original-portrait.webp');
  assert.equal(target.prototypeToken.texture.src, 'icons/original-token.webp');
  assert.equal(token.texture.src, 'icons/live-token.webp');
  assert.equal(target.system.attributes.movement.walk, 30);
  assert.equal(target.system.attributes.movement.fly, null);
  assert.equal(target.system.attributes.hp.temp, 4);
  assert.ok(target.items.includes(unrelatedItem));
  assert.equal(target.items.some(item => item.system?.identifier === 'infernal-drain'), false);
  assert.equal(
    target.effects.some(effect => effect.name === 'Keep This Effect'),
    true
  );
  assert.equal(target.effects.some(effect => effect.name === 'Cursed Aura'), false);
});

test('JSON round-tripped snapshots restore traits and token geometry', async () => {
  const target = mockActor({
    level: 6,
    languages: new Set(['common', 'celestial']),
    customLanguages: 'Trade Cant',
    temp: 0
  });
  target.system.traits.dr = {
    value: new Set(['cold']),
    custom: 'Moon-touched'
  };
  const token = {
    uuid: 'Scene.scene.Token.nonstandard',
    texture: { src: 'icons/original-live-token.webp' },
    width: 2,
    height: 3,
    async update(changes) {
      if (changes['texture.src'] !== undefined) {
        this.texture.src = changes['texture.src'];
      }
      if (changes.width !== undefined) this.width = changes.width;
      if (changes.height !== undefined) this.height = changes.height;
    }
  };
  target.getActiveTokens = () => [{ document: token }];

  await activateArchonForm(target, switchProfile(), {
    payment: 'free',
    profile: 'cursed',
    profileUuid: 'Compendium.test.Actor.cursed',
    transformationId: 'round-trip-snapshot'
  }, { now: 300 });

  target.flags = JSON.parse(JSON.stringify(target.flags));
  token.texture.src = 'icons/changed-live-token.webp';
  token.width = 1;
  token.height = 1;

  await revertArchonForm(target);

  assert.deepEqual(target.system.traits.languages, {
    value: ['common', 'celestial'],
    custom: 'Trade Cant'
  });
  assert.deepEqual(target.system.traits.weaponProf, {
    value: ['simpleM'],
    custom: 'Moonblade'
  });
  assert.deepEqual(target.system.traits.dr, {
    value: ['cold'],
    custom: 'Moon-touched'
  });
  assert.equal(target.system.attributes.hp.temp, 0);
  assert.equal(token.texture.src, 'icons/original-live-token.webp');
  assert.equal(token.width, 2);
  assert.equal(token.height, 3);
});

test('reversion restores temporary HP from 0 through Archon Form back to 0', async () => {
  const target = mockActor({ level: 6, temp: 0 });

  await activateArchonForm(target, switchProfile(), {
    payment: 'free',
    profile: 'cursed',
    profileUuid: 'Compendium.test.Actor.cursed',
    transformationId: 'restore-zero-temp-hp'
  }, { now: 400 });

  assert.equal(target.system.attributes.hp.temp, 12);
  await revertArchonForm(target);
  assert.equal(target.system.attributes.hp.temp, 0);
});

test('reversion restores temporary HP from 4 through Archon Form back to 4', async () => {
  const target = mockActor({ level: 6, temp: 4 });

  await activateArchonForm(target, switchProfile(), {
    payment: 'free',
    profile: 'cursed',
    profileUuid: 'Compendium.test.Actor.cursed',
    transformationId: 'restore-four-temp-hp'
  }, { now: 500 });

  assert.equal(target.system.attributes.hp.temp, 12);
  await revertArchonForm(target);
  assert.equal(target.system.attributes.hp.temp, 4);
});

test('Dire Stature grows only temporary Archon attacks and restores its exact effect and geometry', async () => {
  const unrelatedItem = {
    _id: 'unrelated-ranged-item',
    id: 'unrelated-ranged-item',
    type: 'feat',
    system: {
      identifier: 'unrelated-ranged-item',
      activities: {
        RangedAttack: {
          _id: 'RangedAttack',
          type: 'attack',
          attack: {type: {value: 'ranged'}},
          range: {value: '30', units: 'ft'}
        }
      }
    }
  };
  const foreignDireEffect = {
    _id: 'foreign-dire-effect',
    flags: {
      [MODULE_ID]: {
        vessel: {
          archon: {temporary: {transformationId: 'another-transformation'}}
        }
      }
    }
  };
  const target = mockActor({
    items: [spiritMantleItem(), direStatureItem(), unrelatedItem],
    effects: [foreignDireEffect]
  });
  const token = {
    uuid: 'Scene.scene.Token.dire',
    texture: {src: 'icons/original-live-token.webp'},
    width: 1,
    height: 1,
    async update(changes) {
      if (changes['texture.src'] !== undefined) this.texture.src = changes['texture.src'];
      if (changes.width !== undefined) this.width = changes.width;
      if (changes.height !== undefined) this.height = changes.height;
    }
  };
  target.getActiveTokens = () => [{document: token}];
  const profile = switchProfile();
  profile.items = [{
    _id: 'profile-melee-attack',
    type: 'feat',
    system: {
      identifier: 'profile-melee-attack',
      activities: {
        MeleeAttack: {
          _id: 'MeleeAttack',
          type: 'attack',
          attack: {type: {value: 'melee'}},
          range: {value: '5', units: 'ft'}
        }
      }
    },
    flags: {}
  }];

  await activateArchonForm(target, profile, {
    payment: 'free',
    profile: 'cursed',
    profileUuid: profile.uuid,
    growthCategories: 1,
    transformationId: 'dire-large-transform'
  });

  const temporaryAttack = target.items.find(item =>
    item.system?.identifier === 'profile-melee-attack'
  );
  const direEffect = target.effects.find(candidate =>
    candidate.flags?.[MODULE_ID]?.vessel?.role === 'dire-stature-effect'
  );
  assert.equal(target.system.traits.size, 'lg');
  assert.equal(token.width, 2);
  assert.equal(token.height, 2);
  assert.equal(temporaryAttack.system.activities.MeleeAttack.range.value, '10');
  assert.equal(unrelatedItem.system.activities.RangedAttack.range.value, '30');
  assert.ok(direEffect);
  assert.deepEqual(direEffect.changes, [{
    key: 'system.attributes.ac.bonus', mode: 2, value: '1', priority: 20
  }, {
    key: 'system.bonuses.mwak.damage', mode: 2, value: '1d4', priority: 20
  }, {
    key: 'system.bonuses.msak.damage', mode: 2, value: '1d4', priority: 20
  }]);

  await revertArchonForm(target);

  assert.equal(target.system.traits.size, undefined);
  assert.equal(token.width, 1);
  assert.equal(token.height, 1);
  assert.equal(target.effects.some(candidate =>
    candidate._id === foreignDireEffect._id
  ), true);
  assert.equal(target.effects.some(candidate =>
    candidate.flags?.[MODULE_ID]?.vessel?.archon?.temporary?.transformationId
      === 'dire-large-transform'
  ), false);
});

test('a failed Dire Stature activation rolls back its exact effect and geometry', async () => {
  const target = mockActor({items: [direStatureItem()]});
  const token = {
    uuid: 'Scene.scene.Token.failed-dire',
    texture: {src: 'icons/original-live-token.webp'},
    width: 1,
    height: 1,
    async update(changes) {
      if (changes['texture.src'] !== undefined) this.texture.src = changes['texture.src'];
      if (changes.width !== undefined) this.width = changes.width;
      if (changes.height !== undefined) this.height = changes.height;
    }
  };
  target.getActiveTokens = () => [{document: token}];

  await assert.rejects(activateArchonForm(target, switchProfile(), {
    payment: 'free',
    profile: 'cursed',
    profileUuid: 'Compendium.test.Actor.cursed',
    growthCategories: 2,
    transformationId: 'failed-dire-transform'
  }), /Spirit Mantle/);

  assert.equal(target.system.traits.size, undefined);
  assert.equal(token.width, 1);
  assert.equal(token.height, 1);
  assert.equal(target.effects.some(candidate =>
    candidate.flags?.[MODULE_ID]?.vessel?.archon?.temporary?.transformationId
      === 'failed-dire-transform'
  ), false);
});

function profile({
  profile = 'cursed',
  uuid = 'Compendium.declan-homebrew-classes.vessel-archon-forms.Actor.hbrCurArchon0001',
  languages = new Set(['abyssal']),
  customLanguages = '',
  acBonus = 1
} = {}) {
  return {
    uuid,
    documentName: 'Actor',
    type: 'npc',
    system: {
      traits: {
        languages: {
          value: new Set(languages),
          custom: customLanguages
        }
      }
    },
    flags: {
      [MODULE_ID]: {
        vessel: { archon: { profile, subclass: 'the-cursed', acBonus } }
      }
    }
  };
}

function transformedSource() {
  return {
    flags: {},
    system: {
      traits: {
        languages: {
          value: new Set(['abyssal']),
          custom: 'Deep Speech'
        }
      },
      attributes: { hp: { temp: 0 } }
    }
  };
}

function mantleEffect(actor) {
  return actor.effects.find(candidate =>
    candidate.flags?.[MODULE_ID]?.vessel?.role === 'mantle-ac'
  );
}

test('transform preparation stamps lifecycle state and unions languages', () => {
  const original = mockActor({
    level: 6,
    languages: new Set(['common', 'celestial']),
    customLanguages: 'Trade Cant',
    temp: 7
  });
  const source = transformedSource();
  const selected = profile({ customLanguages: 'Primordial; Deep Speech' });

  const state = prepareArchonTransformData(original, selected, source, {
    now: 100,
    payment: 'free'
  });

  assert.deepEqual(state, {
    active: true,
    startedAt: 100,
    expiresAt: 700,
    profile: 'cursed',
    profileUuid: selected.uuid,
    sourceActorUuid: original.uuid,
    payment: 'free',
    acBonus: 1,
    tempHPBeforeTransform: 7
  });
  assert.deepEqual(
    [...source.system.traits.languages.value].sort(),
    ['abyssal', 'celestial', 'common']
  );
  assert.equal(
    source.system.traits.languages.custom,
    'Deep Speech; Primordial; Trade Cant'
  );
  assert.deepEqual(
    source.flags[MODULE_ID].vessel.archon.state,
    state
  );
  assert.equal(source.system.attributes.hp.temp, 12);
});

test('controlled transformation receives a one-hour expiry', () => {
  const original = mockActor({ level: 7 });
  const source = transformedSource();
  const state = prepareArchonTransformData(original, profile(), source, {
    now: 250,
    payment: 'slot'
  });
  assert.equal(state.expiresAt, 3850);
});

test('transform preparation never replaces higher pre-existing temporary HP', () => {
  const original = mockActor({ level: 6, temp: 30 });
  const source = transformedSource();
  source.system.attributes.hp.temp = 12;

  prepareArchonTransformData(original, profile(), source, { now: 100 });

  assert.equal(source.system.attributes.hp.temp, 30);
});

test('finalization activates Mantle, applies profile AC, and raises temp HP to its floor', async () => {
  const pending = {
    active: true,
    startedAt: 100,
    expiresAt: 700,
    profile: 'cursed',
    profileUuid: profile().uuid,
    sourceActorUuid: 'Actor.original0000001',
    payment: 'free',
    acBonus: 1,
    tempHPBeforeTransform: 0
  };
  const form = mockActor({ level: 6, temp: 3, state: pending });

  const result = await finalizeArchonTransformation(form);

  assert.equal(result.handled, true);
  assert.equal(isArchonFormActive(form), true);
  assert.deepEqual(getArchonState(form), pending);
  assert.equal(form.system.attributes.hp.temp, 12);
  assert.equal(
    mantleEffect(form).changes.find(change =>
      change.key === 'system.attributes.ac.min'
    ).value,
    '10 + @abilities.con.mod + @abilities.cha.mod + 1'
  );
  assert.deepEqual(form.system.attributes.ac, { calc: 'default' });
});

test('finalization never lowers higher unrelated temp HP and supports +0/+1/+2 AC', async () => {
  for (const [acBonus, expected] of [
    [0, '10 + @abilities.con.mod + @abilities.cha.mod'],
    [1, '10 + @abilities.con.mod + @abilities.cha.mod + 1'],
    [2, '10 + @abilities.con.mod + @abilities.cha.mod + 2']
  ]) {
    const state = {
      active: true,
      startedAt: 10,
      expiresAt: 610,
      profile: 'test',
      profileUuid: `Actor.profile-${acBonus}`,
      sourceActorUuid: 'Actor.original0000001',
      payment: 'slot',
      acBonus,
      tempHPBeforeTransform: 0
    };
    const form = mockActor({ level: 4, temp: 30, state });
    await finalizeArchonTransformation(form);
    assert.equal(form.system.attributes.hp.temp, 30);
    assert.equal(
      mantleEffect(form).changes.find(change =>
        change.key === 'system.attributes.ac.min'
      ).value,
      expected
    );
  }
});

test('extension adds exactly 600 seconds and requires an active form', async () => {
  const form = mockActor({
    state: {
      active: true,
      startedAt: 100,
      expiresAt: 700,
      profile: 'fallen',
      profileUuid: 'Actor.profile',
      sourceActorUuid: 'Actor.original',
      payment: 'slot',
      acBonus: 2,
      tempHPBeforeTransform: 0
    }
  });

  const extended = await extendArchonForm(form);
  assert.equal(extended.expiresAt, 1300);
  assert.equal(getArchonState(form).expiresAt, 1300);

  const inactive = mockActor();
  await assert.rejects(extendArchonForm(inactive), /not active/i);
});

test('native reversion cleans only module form state/effects and preserves unrelated effects', async () => {
  const state = {
    active: true,
    startedAt: 100,
    expiresAt: 700,
    profile: 'formless',
    profileUuid: 'Actor.profile',
    sourceActorUuid: 'Actor.original',
    payment: 'free',
    acBonus: 1,
    tempHPBeforeTransform: 4
  };
  const restored = mockActor({
    id: 'original',
    temp: 12,
    state,
    effects: [{
      _id: 'module-form-only',
      flags: { [MODULE_ID]: { vessel: { role: 'archon-form-effect' } } }
    }, {
      _id: 'unrelated',
      flags: { other: { role: 'keep-me' } }
    }]
  });
  const transformed = mockActor({ state });
  transformed.revertOriginalForm = async () => restored;

  const result = await revertArchonForm(transformed);

  assert.equal(result, restored);
  assert.equal(isArchonFormActive(restored), false);
  assert.equal(restored.system.attributes.hp.temp, 4);
  assert.deepEqual(restored.effects.map(candidate => candidate._id), ['unrelated']);
});

test('failed native reversion leaves lifecycle state and module effects untouched', async () => {
  const state = {
    active: true,
    startedAt: 100,
    expiresAt: 700,
    profile: 'ascended',
    profileUuid: 'Actor.profile',
    sourceActorUuid: 'Actor.original',
    payment: 'free',
    acBonus: 0,
    tempHPBeforeTransform: 0
  };
  const transformed = mockActor({
    state,
    effects: [{
      _id: 'module-form-only',
      flags: { [MODULE_ID]: { vessel: { role: 'archon-form-effect' } } }
    }]
  });
  transformed.revertOriginalForm = async () => {
    throw new Error('native revert failed');
  };

  await assert.rejects(revertArchonForm(transformed), /native revert failed/);
  assert.equal(isArchonFormActive(transformed), true);
  assert.equal(transformed.effects.length, 1);
});

test('failed restored temp-HP cleanup records a retryable cleanup phase', async () => {
  const state = {
    active: true,
    startedAt: 100,
    expiresAt: 700,
    profile: 'cursed',
    profileUuid: 'Actor.profile',
    sourceActorUuid: 'Actor.original',
    payment: 'free',
    acBonus: 1,
    tempHPBeforeTransform: 2
  };
  const restored = mockActor({ state, temp: 12 });
  const originalUpdate = restored.update.bind(restored);
  restored.update = async () => {
    throw new Error('temp update failed');
  };
  const transformed = mockActor({ state });
  transformed.revertOriginalForm = async () => restored;

  await assert.rejects(revertArchonForm(transformed), /temp update failed/);
  assert.equal(isArchonFormActive(restored), false);
  assert.equal(getArchonState(restored).cleanupPending, true);

  restored.update = originalUpdate;
  const retry = await reconcileArchonForm(restored);
  assert.equal(retry.cleaned, true);
  assert.equal(getArchonState(restored), undefined);
  assert.equal(restored.system.attributes.hp.temp, 2);
});

test('post-reversion cleanup joins the restored Actor operation queue', async () => {
  const state = {
    active: true,
    startedAt: 100,
    expiresAt: 700,
    profile: 'fallen',
    profileUuid: 'Actor.profile',
    sourceActorUuid: 'Actor.original',
    payment: 'free',
    acBonus: 2,
    tempHPBeforeTransform: 0
  };
  const restored = mockActor({ id: 'original', state, temp: 12 });
  const transformed = mockActor({ state });
  transformed.revertOriginalForm = async () => restored;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const holding = serializeActorOperation(restored, () => gate);

  const reverting = revertArchonForm(transformed);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(restored.operations.length, 0);

  release();
  await Promise.all([holding, reverting]);
  assert.equal(getArchonState(restored), undefined);
  assert.equal(restored.system.attributes.hp.temp, 0);
});

test('reconciliation accepts token and synthetic actor shapes and is idempotent', async () => {
  const state = {
    active: true,
    startedAt: 100,
    expiresAt: 700,
    profile: 'earth',
    profileUuid: 'Actor.profile',
    sourceActorUuid: 'Actor.original',
    payment: 'slot',
    acBonus: 2,
    tempHPBeforeTransform: 0
  };
  const synthetic = mockActor({ isToken: true, level: 5, temp: 0, state });
  const token = { documentName: 'Token', actor: synthetic };

  await reconcileArchonForm(token);
  await reconcileArchonForm(token);

  assert.equal(synthetic.system.attributes.hp.temp, 10);
  assert.equal(synthetic.effects.filter(candidate =>
    candidate.flags?.[MODULE_ID]?.vessel?.role === 'mantle-ac'
  ).length, 1);
});

test('lifecycle and Mantle operations share one actor serializer', async () => {
  const state = {
    active: true,
    startedAt: 100,
    expiresAt: 700,
    profile: 'ascended',
    profileUuid: 'Actor.profile',
    sourceActorUuid: 'Actor.original',
    payment: 'free',
    acBonus: 0,
    tempHPBeforeTransform: 0
  };
  const form = mockActor({ state });
  let release;
  const gate = new Promise(resolve => {
    release = resolve;
  });
  const originalSetFlag = form.setFlag.bind(form);
  let first = true;
  form.setFlag = async (...args) => {
    if (first) {
      first = false;
      await gate;
    }
    return originalSetFlag(...args);
  };

  const extending = extendArchonForm(form);
  const activating = activateSpiritMantle(form, {
    sourceItem: spiritMantleItem()
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(form.operations.length, 0);
  release();
  await Promise.all([extending, activating]);

  assert.equal(getArchonState(form).expiresAt, 1300);
  assert.equal(mantleEffect(form) !== undefined, true);
});

test('non-owner reconciliation fails safely without mutations', async () => {
  const actor = mockActor({
    owner: false,
    state: {
      active: true,
      startedAt: 0,
      expiresAt: 600,
      profile: 'test',
      profileUuid: 'Actor.profile',
      sourceActorUuid: 'Actor.original',
      payment: 'free',
      acBonus: 0,
      tempHPBeforeTransform: 0
    }
  });
  await assert.rejects(reconcileArchonForm(actor), /permission/i);
  assert.deepEqual(actor.operations, []);
});
