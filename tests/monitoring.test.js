const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeMikroTikStatus, parseMikroTikResponse } = require('../monitoring');

test('normalizeMikroTikStatus recognizes active and inactive states', () => {
  assert.equal(normalizeMikroTikStatus({ status: 'up' }), 'up');
  assert.equal(normalizeMikroTikStatus({ status: 'down' }), 'down');
  assert.equal(normalizeMikroTikStatus({ disabled: true }), 'down');
  assert.equal(normalizeMikroTikStatus({ link: 'yes' }), 'up');
  assert.equal(normalizeMikroTikStatus({ link: 'no' }), 'down');
});

test('parseMikroTikResponse reads interface state from RouterOS output', () => {
  const raw = [
    '!re .id=*A',
    'name=ether1',
    'status=up',
    'disabled=no',
    'mtu=1500',
    '!done'
  ];

  const parsed = parseMikroTikResponse(raw);
  assert.equal(parsed.name, 'ether1');
  assert.equal(parsed.status, 'up');
  assert.equal(parsed.disabled, false);
});
