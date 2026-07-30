import test from 'node:test';
import assert from 'node:assert/strict';

const {
  STAGE3_ACTIVITY_ROLES,
  getCataclysmAffinityDamageType,
  getDazzlingLanceDice,
  getDrainVitalityDice,
  getVesselTempHPCap,
  isArchonBoundStage3Role,
  isMantleBoundStage3Role
} = await import('../scripts/vessel/rules.mjs');

test('Stage 3 damage and temporary-hit-point scaling follows Vessel levels', () => {
  assert.deepEqual(
    [10, 12, 13, 16, 17, 20].map(getDazzlingLanceDice),
    [6, 6, 7, 7, 8, 8]
  );
  assert.deepEqual(
    [6, 8, 9, 12, 13, 16, 17, 19, 20].map(getDrainVitalityDice),
    [2, 2, 3, 3, 4, 4, 5, 5, 6]
  );
  assert.equal(getVesselTempHPCap(11), 22);
  assert.equal(getVesselTempHPCap({ classes: { vessel: { system: { levels: 7 } } } }), 14);
});

test('Stage 3 affinity damage reads the same saved Cataclysm affinity as Archon routing', () => {
  const actor = {
    flags: {
      'declan-homebrew-classes': {
        vessel: { elementalAffinity: 'earth' }
      }
    }
  };
  assert.equal(getCataclysmAffinityDamageType(actor), 'bludgeoning');
  actor.flags['declan-homebrew-classes'].vessel.elementalAffinity = 'void';
  assert.equal(getCataclysmAffinityDamageType(actor), undefined);
});

test('Stage 3 roles classify state-bound activities without overlap', () => {
  assert.equal(STAGE3_ACTIVITY_ROLES.size, 29);
  assert.equal(STAGE3_ACTIVITY_ROLES.has('arcane-blast'), true);
  assert.equal(STAGE3_ACTIVITY_ROLES.has('dazzling-eruption'), true);
  assert.equal(STAGE3_ACTIVITY_ROLES.has('vexing-strike'), true);

  assert.equal(isMantleBoundStage3Role('aether-wings'), true);
  assert.equal(isMantleBoundStage3Role('shimmering-lance'), true);
  assert.equal(isMantleBoundStage3Role('arcane-blast'), false);

  assert.equal(isArchonBoundStage3Role('arcane-blast'), true);
  assert.equal(isArchonBoundStage3Role('primordial-bulwark'), true);
  assert.equal(isArchonBoundStage3Role('shimmering-lance'), false);
});
