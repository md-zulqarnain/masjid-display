const assert = require('assert');
const { getHijriDateParts, matchesContentSchedule } = require('../server.js');

const date = new Date(2024, 2, 27, 12);
const hijriDate = getHijriDateParts(date);

assert.ok(hijriDate, 'Hijri date should be available from Intl');
assert.strictEqual(matchesContentSchedule({ hijriMonth: hijriDate.month }, date), true);
assert.strictEqual(matchesContentSchedule({ hijriMonth: hijriDate.month === 12 ? 1 : hijriDate.month + 1 }, date), false);
assert.strictEqual(matchesContentSchedule({ daysOfMonth: [hijriDate.day] }, date), true);
assert.strictEqual(matchesContentSchedule({ daysOfMonth: [hijriDate.day === 30 ? 1 : hijriDate.day + 1] }, date), false);
assert.strictEqual(matchesContentSchedule({ weekdays: [date.getDay()] }, date), true);
assert.strictEqual(matchesContentSchedule({ weekdays: [(date.getDay() + 1) % 7] }, date), false);
assert.strictEqual(matchesContentSchedule(null, date), true);

console.log('content schedule tests passed');