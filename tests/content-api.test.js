const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { app, getHijriDateParts, readSettings } = require('../server.js');

async function run() {
    const suffix = `${process.pid}-${Date.now()}`;
    const monthTopic = `test-${suffix}`;
    const dayTopic = `test-edited-${suffix}`;
    const monthFile = path.join(__dirname, '..', 'content', 'months', `${monthTopic}.json`);
    const monthFileExisted = fs.existsSync(monthFile);
    const dayFile = path.join(__dirname, '..', 'content', 'days', `${dayTopic}.json`);
    const server = app.listen(0);

    try {
        await new Promise(resolve => server.once('listening', resolve));
        const baseUrl = `http://127.0.0.1:${server.address().port}`;
        const originalResponse = await fetch(`${baseUrl}/api/verses`);
        const originalVerses = await originalResponse.json();
        const root = path.join(__dirname, '..');
        const legacyVerses = JSON.parse(fs.readFileSync(path.join(root, 'verses.json'), 'utf8'));
        assert.ok(legacyVerses.every(legacyVerse => originalVerses.some(verse =>
            verse.topicType === 'general' && verse.reference === legacyVerse.reference && verse.type === legacyVerse.type
        )), 'Legacy verses should remain available as general content');
        assert.ok(originalVerses.some(verse => verse.topicType === 'month' && verse.topicKey === 'ramadan'));
        const activeResponse = await fetch(`${baseUrl}/api/verses/active`);
        const activeVerses = await activeResponse.json();
        const hijriToday = getHijriDateParts(new Date(), readSettings().hijriOffset);
        if (hijriToday.month !== 9) {
            assert.ok(!activeVerses.some(verse => verse.topicType === 'month' && verse.topicKey === 'ramadan'));
        }
        const legacyShortVerses = JSON.parse(fs.readFileSync(path.join(root, 'short-verses.json'), 'utf8'));
        const migratedShortVerses = JSON.parse(fs.readFileSync(path.join(root, 'content', 'general-short.json'), 'utf8'));
        assert.strictEqual(migratedShortVerses.length, legacyShortVerses.length, 'All legacy short verses should remain available');
        assert.ok(migratedShortVerses.every(verse => typeof verse.text === 'string' && verse.text.trim()), 'Every short verse should contain text');

        const createResponse = await fetch(`${baseUrl}/api/verses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                reference: 'Test source',
                text: 'Test full text',
                shortText: 'Scheduled short text',
                type: 'sunnah',
                topicType: 'month',
                topicKey: monthTopic,
                schedule: { hijriMonth: 9 }
            })
        });
        assert.strictEqual(createResponse.status, 200);

        let verses = await (await fetch(`${baseUrl}/api/verses`)).json();
        let testVerse = verses.find(verse => verse.topicKey === monthTopic && verse.reference === 'Test source');
        assert.strictEqual(testVerse.schedule.hijriMonth, 9, 'Month topics should schedule to their Hijri month');

        const today = getHijriDateParts(new Date(), readSettings().hijriOffset);
        const editResponse = await fetch(`${baseUrl}/api/verses/${verses.indexOf(testVerse)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                reference: testVerse.reference,
                text: 'Updated full text',
                shortText: 'Scheduled short text',
                type: testVerse.type,
                topicType: 'day',
                topicKey: dayTopic,
                schedule: { daysOfMonth: [today.day] }
            })
        });
        assert.strictEqual(editResponse.status, 200);

        verses = await (await fetch(`${baseUrl}/api/verses`)).json();
        testVerse = verses.find(verse => verse.topicKey === dayTopic);
        assert.ok(testVerse, 'Editing should move an entry to the selected topic file');
        const shortVerses = await (await fetch(`${baseUrl}/api/short-verses`)).json();
        assert.ok(shortVerses.some(verse => verse.text === 'Scheduled short text'));

        const deleteResponse = await fetch(`${baseUrl}/api/verses/${verses.indexOf(testVerse)}`, { method: 'DELETE' });
        assert.strictEqual(deleteResponse.status, 200);
        verses = await (await fetch(`${baseUrl}/api/verses`)).json();
        assert.ok(!verses.some(verse => verse.topicKey === dayTopic));

        console.log('content API tests passed');
    } finally {
        server.close();
        if (!monthFileExisted) fs.rmSync(monthFile, { force: true });
        fs.rmSync(dayFile, { force: true });
    }
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});