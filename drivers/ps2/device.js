'use strict';

const { Device } = require('homey');
const moment = require('moment');
const Polestar = require('@andysmithfal/polestar.js');
const HomeyCrypt = require('../../lib/homeycrypt');

class PS2Device extends Device {
    async onInit() {
        this.name = this.getName();

        this.homey.app.log(this.homey.__({
            en: `${this.name} has been initialized`,
            no: `${this.name} har blitt initialisert`
        }), this.name, 'DEBUG');

        moment.locale(this.homey.i18n.getLanguage() == 'no' ? 'nb' : 'en');

        this.settings = await this.getSettings();
        await this.fixCapabilities();
        this.update_loop_timers();
    }

    update_loop_timers() {
        this.updateVehicleState();
        let interval = 60000;
        this._timerTimers = setInterval(() => {
            this.updateVehicleState();
        }, interval);
    }

    async fixCapabilities() {
        if (!this.hasCapability('measure_battery'))
            await this.addCapability('measure_battery');
        // if(!this.hasCapability('measure_current'))
        //   await this.addCapability('measure_current');
        // if(!this.hasCapability('measure_power'))
        //   await this.addCapability('measure_power');
        if (!this.hasCapability('measure_polestarChargeTimeRemaining'))
            await this.addCapability('measure_polestarChargeTimeRemaining');
        if (!this.hasCapability('measure_polestarOdometer'))
            await this.addCapability('measure_polestarOdometer');
        if (!this.hasCapability('measure_polestarRange'))
            await this.addCapability('measure_polestarRange');
        if (!this.hasCapability('measure_polestarChargeState'))
            await this.addCapability('measure_polestarChargeState');
        if (!this.hasCapability('measure_polestarConnected'))
            await this.addCapability('measure_polestarConnected');

    }

    async updateDeviceData() {
        this.homey.app.log(this.homey.__({
            en: 'Updating device data for ' + this.name,
            no: 'Oppdaterer enhetsdata for ' + this.name
        }), this.name, 'DEBUG');

        if (this.polestar == null) {
            let PolestarUser = this.homey.settings.get('user_email');
            let PolestarPwd = await HomeyCrypt.decrypt(this.homey.settings.get('user_password'), PolestarUser);
            this.polestar = new Polestar(PolestarUser, PolestarPwd);
            await this.polestar.login();
            await this.polestar.setVehicle(this.getData().vin);
        }
        var odometer = await this.polestar.getOdometer();
        console.log(JSON.stringify(odometer));
        var odo = odometer.odometerMeters;
        try {
            odo = odo / 1000; //Convert to KM instead of M
        } catch {
            odo = null;
        }
        console.log('KM:' + odo)
        var batteryInfo = await this.polestar.getBattery();
        console.log(JSON.stringify(batteryInfo));

        this.setCapabilityValue('measure_battery', batteryInfo.batteryChargeLevelPercentage);
        // this.setCapabilityValue('measure_current', batteryInfo.chargingCurrentAmps);
        // this.setCapabilityValue('measure_power', batteryInfo.chargingPowerWatts);
        this.setCapabilityValue('measure_polestarOdometer', odo);

        this.setCapabilityValue('measure_polestarRange', batteryInfo.estimatedDistanceToEmptyKm);
        if (batteryInfo.chargingStatus == 'CHARGING_STATUS_CHARGING') {
            this.setCapabilityValue('measure_polestarChargeState', true);
            this.setCapabilityValue('measure_polestarChargeTimeRemaining', batteryInfo.estimatedChargingTimeToFullMinutes);
        } else {
            this.setCapabilityValue('measure_polestarChargeState', false);
            this.setCapabilityValue('measure_polestarChargeTimeRemaining', null);
        }
        if (batteryInfo.chargerConnectionStatus == 'CHARGER_CONNECTION_STATUS_CONNECTED') {
            this.setCapabilityValue('measure_polestarConnected', true);
        } else {
            this.setCapabilityValue('measure_polestarConnected', false);
        }
    }

    async onAdded() {
        this.homey.app.log(this.homey.__({
            en: this.name + ' has been added',
            no: this.name + ' har blitt lagt til'
        }),
            this.name, 'DEBUG');
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        this.homey.app.log(this.homey.__({
            en: this.name + ' settings has been changed',
            no: this.name + ' innstillinger har blitt endret'
        }),
            this.name, 'DEBUG');
        if (changedKeys.includes('refresh_interval')) {
            this.refreshInterval = newSettings.refresh_interval * 60 * 1000;
            this.homey.clearInterval(this.interval);
            this.interval = this.homey.setInterval(async () => {
                await this.updateDeviceData();
            }, this.refreshInterval);
        }
    }

    async onRenamed(name) {
        this.homey.app.log(this.homey.__({
            en: this.name + ' has been renamed to ' + name,
            no: 'Navnet på ' + this.name + ' har blitt endret til ' + name
        }),
            name, 'DEBUG');
    }

    async onDeleted() {
        if (this.interval) {
            this.homey.clearInterval(this.interval);
        }
        this.homey.app.log(this.homey.__({
            en: this.name + ' has been deleted',
            no: this.name + ' har blitt slettet'
        }),
            this.name, 'DEBUG');
    }

}

module.exports = PS2Device;
