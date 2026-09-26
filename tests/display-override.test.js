const assert = require('assert');
const server = require('../server.js');

assert.strictEqual(typeof server.normalizeDisplayPage, 'function', 'normalizeDisplayPage should exist');
assert.strictEqual(server.normalizeDisplayPage('normal'), 'normal');
assert.strictEqual(server.normalizeDisplayPage('index'), 'index');
assert.strictEqual(server.normalizeDisplayPage('surah-hadith'), 'surah-hadith');
assert.strictEqual(server.normalizeDisplayPage('not-a-page'), 'normal');

console.log('display override tests passed');
