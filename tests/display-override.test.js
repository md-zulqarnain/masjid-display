const assert = require('assert');
const server = require('../server.js');

assert.strictEqual(typeof server.normalizeDisplayPage, 'function', 'normalizeDisplayPage should exist');
assert.strictEqual(server.normalizeDisplayPage('normal'), 'normal');
assert.strictEqual(server.normalizeDisplayPage('index'), 'index');
assert.strictEqual(server.normalizeDisplayPage('surah-hadith'), 'surah-hadith');
assert.strictEqual(server.normalizeDisplayPage('not-a-page'), 'normal');

assert.strictEqual(typeof server.normalizeDisplayDialogType, 'function', 'normalizeDisplayDialogType should exist');
assert.strictEqual(server.normalizeDisplayDialogType('takbir'), 'takbir');
assert.strictEqual(server.normalizeDisplayDialogType('TASHRIK'), 'tashrik');
assert.strictEqual(server.normalizeDisplayDialogType('not-a-dialog'), 'message');

assert.deepStrictEqual(server.normalizeDisplayOverride({ mode: 'dialog', dialog: 'tashrik', message: 'Test message' }), {
  mode: 'dialog',
  page: null,
  dialog: 'tashrik',
  message: 'Test message'
});

console.log('display override tests passed');
