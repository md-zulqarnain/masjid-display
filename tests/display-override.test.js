const assert = require('assert');
const server = require('../server.js');

assert.strictEqual(typeof server.normalizeDisplayPage, 'function', 'normalizeDisplayPage should exist');
assert.strictEqual(server.normalizeDisplayPage('normal'), 'normal');
assert.strictEqual(server.normalizeDisplayPage('index'), 'index');
assert.strictEqual(server.normalizeDisplayPage('surah-hadith'), 'surah-hadith');
assert.strictEqual(server.normalizeDisplayPage('theme-6'), 'theme-6');
assert.strictEqual(server.normalizeDisplayPage('not-a-page'), 'normal');

assert.strictEqual(typeof server.normalizeDisplayDialogType, 'function', 'normalizeDisplayDialogType should exist');
assert.strictEqual(server.normalizeDisplayDialogType('takbir'), 'takbir');
assert.strictEqual(server.normalizeDisplayDialogType('TASHRIK'), 'tashrik');
assert.strictEqual(server.normalizeDisplayDialogType('not-a-dialog'), 'message');
assert.strictEqual(server.normalizeTheme('theme-6'), 'theme-6');
assert.strictEqual(server.normalizeTheme('unsupported-theme'), 'index');
assert.strictEqual(server.normalizeDisplayResolution('1920x1080@60Hz'), '1920x1080@60Hz');
assert.strictEqual(server.normalizeDisplayResolution('3840x2160@30Hz'), '3840x2160@30Hz');
assert.strictEqual(server.normalizeDisplayResolution('unsupported-mode'), '1920x1080@60Hz');
assert.deepStrictEqual(server.getSamsungDisplayPowerArgs(true), ['-d', '1', '--playback', '-o', 'Raspberry Pi', '-t', '0', '--image-view-on']);
assert.deepStrictEqual(server.getSamsungDisplayPowerArgs(false), ['-d', '1', '--standby', '-t', '0']);
assert.deepStrictEqual(server.getSamsungDisplayCommandArgs(true), ['-n', '/usr/bin/cec-ctl', '-d', '1', '--playback', '-o', 'Raspberry Pi', '-t', '0', '--image-view-on']);
assert.deepStrictEqual(server.getSamsungDisplayCommandArgs(false), ['-n', '/usr/bin/cec-ctl', '-d', '1', '--standby', '-t', '0']);
assert.deepStrictEqual(server.normalizeDisplayPowerSlots([
    { on: '12:00', off: '13:00' },
    { on: '25:00', off: '13:00' },
    { on: '14:00', off: '14:00' }
]), [{ on: '12:00', off: '13:00' }]);
assert.strictEqual(server.parseTimeToMinutes('7:30 AM'), 450);
assert.strictEqual(server.parseTimeToMinutes('19:30'), 1170);

const quickTimes = { isha: { useCustomTime: true, azan: '07:30 PM', jamahAfterAzan: 15 } };
const timingDayReader = () => ({ Isha: '19:00', Sahri: '04:30' });
assert.strictEqual(server.shouldSamsungDisplayBeOn(new Date(2026, 9, 2, 7, 29), quickTimes, timingDayReader), true);
assert.strictEqual(server.shouldSamsungDisplayBeOn(new Date(2026, 9, 2, 7, 30), quickTimes, timingDayReader), true);
assert.strictEqual(server.shouldSamsungDisplayBeOn(new Date(2026, 9, 2, 11, 29), quickTimes, timingDayReader), true);
assert.strictEqual(server.shouldSamsungDisplayBeOn(new Date(2026, 9, 2, 11, 30), quickTimes, timingDayReader), false);
assert.strictEqual(server.shouldSamsungDisplayBeOn(new Date(2026, 9, 2, 19, 44), quickTimes, timingDayReader), false);
assert.strictEqual(server.shouldSamsungDisplayBeOn(new Date(2026, 9, 2, 19, 45), quickTimes, timingDayReader), true);
assert.strictEqual(server.shouldSamsungDisplayBeOn(new Date(2026, 9, 2, 20, 44), quickTimes, timingDayReader), true);
assert.strictEqual(server.shouldSamsungDisplayBeOn(new Date(2026, 9, 2, 20, 45), quickTimes, timingDayReader), false);
assert.strictEqual(server.shouldSamsungDisplayBeOn(new Date(2026, 9, 3, 3, 44), quickTimes, timingDayReader), false);
assert.strictEqual(server.shouldSamsungDisplayBeOn(new Date(2026, 9, 3, 3, 45), quickTimes, timingDayReader), true);
assert.strictEqual(server.shouldSamsungDisplayBeOn(new Date(2026, 9, 3, 11, 29), quickTimes, timingDayReader), true);
assert.strictEqual(server.shouldSamsungDisplayBeOn(new Date(2026, 9, 3, 11, 30), quickTimes, timingDayReader), false);
const additionalPowerSlots = [{ on: '12:00', off: '13:00' }, { on: '22:00', off: '03:00' }];
assert.strictEqual(server.shouldSamsungDisplayBeOn(new Date(2026, 9, 2, 12, 59), quickTimes, timingDayReader, additionalPowerSlots), true);
assert.strictEqual(server.shouldSamsungDisplayBeOn(new Date(2026, 9, 2, 13, 0), quickTimes, timingDayReader, additionalPowerSlots), false);
assert.strictEqual(server.shouldSamsungDisplayBeOn(new Date(2026, 9, 3, 2, 59), quickTimes, timingDayReader, additionalPowerSlots), true);
assert.strictEqual(server.shouldSamsungDisplayBeOn(new Date(2026, 9, 3, 3, 0), quickTimes, timingDayReader, additionalPowerSlots), false);

assert.deepStrictEqual(server.normalizeDisplayOverride({ mode: 'dialog', dialog: 'tashrik', message: 'Test message' }), {
    mode: 'dialog',
    page: null,
    dialog: 'tashrik',
    message: 'Test message'
});

console.log('display override tests passed');
