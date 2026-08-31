'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// `homey app validate` checks app.json and the assets — it never reads the app's
// JavaScript. A card id that exists in the code but not in the built app.json
// therefore passes validation at publish level and only throws on a real Homey,
// inside onInit. Because the registrations run in sequence with no per-card
// isolation, one bad id takes down every card registered after it.
//
// Verified: renaming a single getConditionCard() id to something nonexistent
// still produced "App validated successfully against level `publish`".
//
// This test is the missing link. It catches a typo, a card renamed on one side
// only, a card deleted from the compose sources while the code still registers
// it, and a card looked up through the wrong getter family.

const ROOT = path.join(__dirname, '..');

// Getter → the app.json flow section it must resolve against. Trigger cards come
// in a device-scoped and an app-scoped flavour, but both live under `triggers`.
const GETTERS = {
    getTriggerCard: 'triggers',
    getDeviceTriggerCard: 'triggers',
    getConditionCard: 'conditions',
    getActionCard: 'actions',
};

function collectSourceFiles(dir, found = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) collectSourceFiles(full, found);
        else if (entry.name.endsWith('.js')) found.push(full);
    }
    return found;
}

function findCardLookups() {
    const files = [
        path.join(ROOT, 'app.js'),
        ...collectSourceFiles(path.join(ROOT, 'drivers')),
    ].filter(file => fs.existsSync(file));

    const pattern = new RegExp(`\\b(${Object.keys(GETTERS).join('|')})\\(\\s*'([^']+)'`, 'g');
    const lookups = [];

    for (const file of files) {
        const source = fs.readFileSync(file, 'utf8');
        for (const [, getter, id] of source.matchAll(pattern)) {
            lookups.push({ getter, id, file: path.relative(ROOT, file) });
        }
    }
    return lookups;
}

test('every flow card the code registers exists in the built app.json', () => {
    const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
    const flow = appJson.flow || {};

    const declared = {};
    for (const section of new Set(Object.values(GETTERS))) {
        declared[section] = new Set((flow[section] || []).map(card => card.id));
    }

    const lookups = findCardLookups();
    assert.ok(lookups.length > 0, 'found no flow-card lookups to check — has the scan pattern gone stale?');

    const missing = lookups
        .filter(({ getter, id }) => !declared[GETTERS[getter]].has(id))
        .map(({ getter, id, file }) => {
            const elsewhere = Object.entries(declared)
                .filter(([section, ids]) => section !== GETTERS[getter] && ids.has(id))
                .map(([section]) => section);
            const hint = elsewhere.length
                ? ` — but it is declared under "${elsewhere.join('/')}", so this is the wrong getter`
                : ' — run `homey app build`, or fix the id in the compose source';
            return `${file}: ${getter}('${id}') has no match in app.json flow.${GETTERS[getter]}${hint}`;
        });

    assert.deepEqual(missing, [], `\n${missing.join('\n')}\n`);
});
