'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const codec = require('../clone_modules/polestar-c3/codec');
const { PolestarC3 } = require('../clone_modules/polestar-c3/client');
const PolestarCompat = require('../clone_modules/polestar-c3/compat');
const {
    BatterySchema,
    GetBatteryResponseSchema,
    ManualPreconditioningSchema,
} = require('../clone_modules/polestar-c3/messages');
const {
    normalizeManualPreconditioning,
    transitionPreconditioningState,
} = require('../clone_modules/polestar-c3/preconditioning');

const CAPABILITY_ID = 'measure_polestarBatteryPreconditioningStatus';
const STATE_IDS = [
    'in_progress',
    'on',
    'off',
    'finished',
    'optimal',
    'planned',
    'fault',
    'charging',
    'low_energy',
    'unavailable',
    'unknown',
];
const SUPPORTED_LOCALES = ['en', 'nl', 'de', 'fr', 'it', 'sv', 'no', 'es', 'da', 'ru', 'pl', 'ko', 'ja'];

function loadHomeyModule(relativePath) {
    const resolved = require.resolve(relativePath);
    const originalLoad = Module._load;
    delete require.cache[resolved];
    Module._load = function load(request, parent, isMain) {
        if (request === 'homey') return { Device: class {}, Driver: class {} };
        if (request === '../../clone_modules/polestar.js') return class {};
        return originalLoad.call(this, request, parent, isMain);
    };
    try {
        return require(relativePath);
    } finally {
        Module._load = originalLoad;
        delete require.cache[resolved];
    }
}

function batteryResponse(status, unavailableReason = 0) {
    return codec.encode(GetBatteryResponseSchema, {
        battery: codec.encode(BatterySchema, {
            charge_level: 42,
            manual_preconditioning: codec.encode(ManualPreconditioningSchema, {
                status,
                unavailable_reason: unavailableReason,
                started_at: { seconds: 100 },
                ending_at: { seconds: 200 },
            }),
        }),
    });
}

test('C3 battery field 29 decodes status and unavailable-reason labels', async () => {
    const client = new PolestarC3('test@example.com', 'unused');
    client._vin = 'test-vin';
    client._call = async () => batteryResponse(5, 5);

    const manual = (await client.getLatestBattery()).battery.manual_preconditioning;
    assert.equal(manual.status_label, 'UNAVAILABLE');
    assert.equal(manual.unavailable_reason_label, 'PRECONDITIONING_IN_PROGRESS');
    assert.equal(manual.started_at.seconds, 100);
    assert.equal(manual.ending_at.seconds, 200);
});

test('preconditioning-in-progress and charging-in-progress remain distinct states', () => {
    assert.deepEqual(normalizeManualPreconditioning({
        status_label: 'UNAVAILABLE',
        unavailable_reason_label: 'PRECONDITIONING_IN_PROGRESS',
    }), {
        reported: true,
        key: 'in_progress',
        label: 'In progress',
    });

    assert.deepEqual(normalizeManualPreconditioning({
        status_label: 'UNAVAILABLE',
        unavailable_reason_label: 'CHARGING_IN_PROGRESS',
    }), {
        reported: true,
        key: 'charging',
        label: 'Unavailable: charging',
    });
});

test('compat exposes normalized preconditioning state to the Homey driver', async () => {
    const compat = new PolestarCompat('test@example.com', 'unused');
    compat._fetchBattery = async () => ({
        battery: {
            charge_level: 42,
            manual_preconditioning: {
                status_label: 'ON',
                unavailable_reason_label: 'UNSPECIFIED',
                started_at: { seconds: 100 },
            },
        },
    });

    const battery = await compat.getBattery();
    assert.equal(battery.batteryPreconditioningReported, true);
    assert.equal(battery.batteryPreconditioningStatusKey, 'on');
    assert.equal(battery.batteryPreconditioningStatusLabel, 'On');
});

test('first observation is silent and reported state changes fire once', () => {
    assert.deepEqual(transitionPreconditioningState(null, 'in_progress'), {
        key: 'in_progress',
        changed: false,
    });
    assert.deepEqual(transitionPreconditioningState('off', 'in_progress'), {
        key: 'in_progress',
        changed: true,
    });
    assert.deepEqual(transitionPreconditioningState('in_progress', 'in_progress'), {
        key: 'in_progress',
        changed: false,
    });
    assert.deepEqual(transitionPreconditioningState('in_progress', 'charging'), {
        key: 'charging',
        changed: true,
    });
});

test('missing field 29 remains unknown and does not fabricate a transition', () => {
    assert.deepEqual(normalizeManualPreconditioning(undefined), {
        reported: false,
        key: null,
        label: 'Not reported',
    });
});

test('missing field 29 preserves the last reported state', () => {
    let transition = transitionPreconditioningState(null, 'off');
    assert.deepEqual(transition, { key: 'off', changed: false });

    transition = transitionPreconditioningState(transition.key, null);
    assert.deepEqual(transition, { key: 'off', changed: false });

    transition = transitionPreconditioningState(transition.key, 'on');
    assert.deepEqual(transition, { key: 'on', changed: true });
});

test('Flow contract uses one generic trigger and an enum condition', () => {
    const flow = JSON.parse(fs.readFileSync(
        path.join(__dirname, '../drivers/vehicle/driver.flow.compose.json'),
        'utf8',
    ));
    const trigger = flow.triggers.find((card) => card.id === 'battery_preconditioning_changed');
    assert.ok(trigger);
    assert.equal(trigger.args, undefined);
    assert.equal(trigger.$filter, 'capabilities=measure_polestarBatteryPreconditioningStatus');
    assert.deepEqual(trigger.tokens.map((token) => token.name), ['state']);
    for (const locale of SUPPORTED_LOCALES) {
        assert.ok(trigger.title[locale], `trigger title missing ${locale}`);
        assert.ok(trigger.hint[locale], `trigger hint missing ${locale}`);
        assert.ok(trigger.tokens[0].title[locale], `trigger token title missing ${locale}`);
    }
    assert.equal(flow.triggers.some((card) => card.id.startsWith('battery_preconditioning_')
        && card.id !== 'battery_preconditioning_changed'), false);

    const condition = flow.conditions.find((card) => card.id === 'battery_preconditioning_state_is');
    assert.ok(condition);
    assert.equal(condition.$filter, 'capabilities=measure_polestarBatteryPreconditioningStatus');
    const stateArg = condition.args.find((arg) => arg.name === 'state');
    assert.deepEqual(stateArg.values.map((value) => value.id), STATE_IDS);
    for (const locale of SUPPORTED_LOCALES) {
        assert.ok(condition.title[locale], `condition title missing ${locale}`);
        assert.ok(condition.titleFormatted[locale], `formatted condition title missing ${locale}`);
        for (const value of stateArg.values) {
            assert.ok(value.label[locale], `${value.id} dropdown label missing ${locale}`);
        }
    }

    const capability = JSON.parse(fs.readFileSync(
        path.join(__dirname, `../.homeycompose/capabilities/${CAPABILITY_ID}.json`),
        'utf8',
    ));
    assert.equal(capability.type, 'enum');
    assert.equal(capability.uiComponent, 'sensor');
    assert.equal(capability.getable, true);
    assert.equal(capability.setable, false);
    assert.equal(capability.insights, true);
    assert.deepEqual(capability.values.map((value) => value.id), STATE_IDS);
    for (const value of capability.values) {
        for (const locale of SUPPORTED_LOCALES) {
            assert.ok(value.title[locale], `${value.id} capability title missing ${locale}`);
        }
    }

    const driver = JSON.parse(fs.readFileSync(
        path.join(__dirname, '../drivers/vehicle/driver.compose.json'),
        'utf8',
    ));
    assert.equal(
        driver.capabilities.includes(CAPABILITY_ID),
        false,
        'support capability must be added only after field 29 is observed',
    );
});

test('capability persistence drives transitions and survives missing reports', async () => {
    const PolestarVehicle = loadHomeyModule('../drivers/vehicle/device');
    let hasCapability = false;
    let value = null;
    const triggerCalls = [];
    const cardLookups = [];
    const translated = [];
    const device = Object.create(PolestarVehicle.prototype);
    Object.assign(device, {
        name: 'Test vehicle',
        hasCapability: (capability) => capability === CAPABILITY_ID && hasCapability,
        addCapability: async (capability) => {
            assert.equal(capability, CAPABILITY_ID);
            hasCapability = true;
        },
        getCapabilityValue: (capability) => {
            assert.equal(capability, CAPABILITY_ID);
            return value;
        },
        setCapabilityValue: async (capability, nextValue) => {
            assert.equal(capability, CAPABILITY_ID);
            value = nextValue;
        },
        homey: {
            app: { log: () => {} },
            // The trigger token is localized, so the mock has to model __() the
            // way Homey resolves it: pick the active language out of the map.
            __: (map) => { translated.push(map); return map.en; },
            flow: {
                getDeviceTriggerCard: (id) => {
                    cardLookups.push(id);
                    return { trigger: async (...args) => triggerCalls.push(args) };
                },
            },
        },
    });

    await device._updateBatteryPreconditioningState({
        batteryPreconditioningReported: true,
        batteryPreconditioningStatusKey: 'off',
        batteryPreconditioningStatusLabel: 'Off',
    });
    assert.equal(value, 'off');
    assert.equal(triggerCalls.length, 0, 'first observation must remain silent');

    await device._updateBatteryPreconditioningState({
        batteryPreconditioningReported: true,
        batteryPreconditioningStatusKey: 'off',
        batteryPreconditioningStatusLabel: 'Off',
    });
    assert.equal(triggerCalls.length, 0, 'unchanged observations must remain silent');

    await device._updateBatteryPreconditioningState({
        batteryPreconditioningReported: true,
        batteryPreconditioningStatusKey: 'on',
        batteryPreconditioningStatusLabel: 'On',
    });
    assert.equal(value, 'on');
    assert.deepEqual(cardLookups, ['battery_preconditioning_changed']);
    assert.equal(triggerCalls.length, 1);
    assert.deepEqual(triggerCalls[0][1], { state: 'On' });

    // The token must be handed to __() as a full language map, not a bare
    // English string — the capability tile and the flow token have to agree in
    // every locale, not just the default one.
    assert.equal(translated.length, 1);
    assert.equal(translated[0].en, 'On');
    for (const lang of ['nl', 'no', 'de', 'da', 'sv']) {
        assert.ok(translated[0][lang], `trigger token is missing the ${lang} translation`);
    }

    await device._updateBatteryPreconditioningState({ batteryPreconditioningReported: false });
    assert.equal(value, 'on', 'missing field 29 must preserve the persisted value');
    assert.equal(triggerCalls.length, 1);
});

test('a persisted capability value is reused as the previous state after restart', async () => {
    const PolestarVehicle = loadHomeyModule('../drivers/vehicle/device');
    let value = 'off';
    const triggerCalls = [];
    const device = Object.create(PolestarVehicle.prototype);
    Object.assign(device, {
        name: 'Restarted vehicle',
        hasCapability: (capability) => capability === CAPABILITY_ID,
        getCapabilityValue: (capability) => {
            assert.equal(capability, CAPABILITY_ID);
            return value;
        },
        setCapabilityValue: async (capability, nextValue) => {
            assert.equal(capability, CAPABILITY_ID);
            value = nextValue;
        },
        homey: {
            app: { log: () => {} },
            __: (map) => map.en,
            flow: {
                getDeviceTriggerCard: () => ({ trigger: async (...args) => triggerCalls.push(args) }),
            },
        },
    });

    await device._updateBatteryPreconditioningState({
        batteryPreconditioningReported: true,
        batteryPreconditioningStatusKey: 'on',
        batteryPreconditioningStatusLabel: 'On',
    });
    assert.equal(value, 'on');
    assert.equal(triggerCalls.length, 1);
});

test('condition card reads the persisted capability instead of driver memory', async () => {
    const VehicleDriver = loadHomeyModule('../drivers/vehicle/driver');
    const cards = new Map();
    const getCard = (type, id) => {
        const key = `${type}:${id}`;
        if (!cards.has(key)) {
            cards.set(key, {
                registerRunListener(listener) {
                    this.listener = listener;
                    return this;
                },
            });
        }
        return cards.get(key);
    };
    const driver = Object.create(VehicleDriver.prototype);
    driver.homey = {
        app: { log: () => {} },
        flow: {
            getActionCard: (id) => getCard('action', id),
            getConditionCard: (id) => getCard('condition', id),
            getDeviceTriggerCard: (id) => getCard('trigger', id),
        },
    };
    driver._registerFlowCards();

    const condition = cards.get('condition:battery_preconditioning_state_is');
    const device = {
        getCapabilityValue: (capability) => {
            assert.equal(capability, CAPABILITY_ID);
            return 'planned';
        },
    };
    assert.equal(await condition.listener({ device, state: 'planned' }), true);
    assert.equal(await condition.listener({ device, state: 'on' }), false);
    assert.equal(driver._batteryPreconditioningChangedTrigger, undefined);
});
