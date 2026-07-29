import test from 'node:test';
import assert from 'node:assert/strict';

const {
  registerVesselArmorClass
} = await import('../scripts/vessel/armor-class.mjs');

test('registers the Spirit Mantle AC calculation', () => {
  const config = { armorClasses: {} };
  assert.equal(registerVesselArmorClass(config), true);
  assert.deepEqual(config.armorClasses.vesselMantle, {
    label: 'Spirit Mantle',
    formula: '10 + @abilities.con.mod + @abilities.cha.mod'
  });
});

test('registering the same AC calculation is idempotent', () => {
  const config = { armorClasses: {} };
  assert.equal(registerVesselArmorClass(config), true);
  const registered = config.armorClasses.vesselMantle;
  assert.equal(registerVesselArmorClass(config), true);
  assert.equal(config.armorClasses.vesselMantle, registered);
});

test('does not overwrite another module AC calculation', () => {
  const existing = { label: 'Another Module', formula: '99' };
  const config = { armorClasses: { vesselMantle: existing } };
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(registerVesselArmorClass(config), false);
    assert.equal(config.armorClasses.vesselMantle, existing);
  } finally {
    console.error = originalError;
  }
});

test('returns false when armor configuration is unavailable', () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(registerVesselArmorClass(undefined), false);
  } finally {
    console.error = originalError;
  }
});
