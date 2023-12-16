'use strict';

const { Device } = require('homey');
const moment = require('moment');

class PolestarBetaDevice extends Device {
    async onInit() {
        this.name = this.getName();

        this.homey.app.log(this.homey.__({
            en: `${this.name} has been initialized`,
            no: `${this.name} har blitt initialisert`
        }),
            this.name, 'DEBUG');

        moment.locale(this.homey.i18n.getLanguage() == 'no' ? 'nb' : 'en');

        this.settings = await this.getSettings();
        this.vehicleId = this.getData().id;
        this.vehicleData = null;

        const id = '657d642cd640090bb9b88226';
        const secret = 'ccf90ffd93f0110158c7c79e37861245';
        const data = {
            deviceId: 'Polestar2CSV',
        }
        const webhook = await this.homey.cloud.createWebhook(id, secret, data);
        const webhookUrl = `https://webhooks.athom.com/webhook/${webhook.id}/?homey=${this.homeyId}`;
        webhook.on('message', args => {
            this.log('body:', args.body);
            this.vehicleData = {
                ...args.body
            };

            this.log('vehicleData:', this.vehicleData);

            //await this.updateDeviceData();
        });
    }

    async updateDeviceData() {
        if (!this.vehicleData) {
            this.homey.app.log(this.homey.__({
                en: 'No data available for ' + this.name,
                no: 'Ingen data tilgjengelig for ' + this.name
            }), this.name, 'DEBUG');
            return;
        }
        this.homey.app.log(this.homey.__({
            en: 'Updating device data for ' + this.name,
            no: 'Oppdaterer enhetsdata for ' + this.name
        }),
            this.name, 'DEBUG');

        if (this.vehicleData) {
            const lastUpdated = moment(this.vehicleData.batteryChargeLevel.timestamp).fromNow();
            const soc = parseInt(this.vehicleData.batteryChargeLevel.value);
            const range = this.vehicleData.electricRange.value;

            await this.setCapabilityValue('measure_battery', soc);
            await this.setCapabilityValue('measure_polestarBattery', soc);
            await this.setCapabilityValue('measure_polestarRange', `${range} km`);
            await this.setCapabilityValue('measure_polestarChargeState', this.vehicleData.chargingConnectionStatus.value === null
                ? this.homey.__('Polestar2.device.unknownChargingState')
                : this.vehicleData.chargingConnectionStatus.value !== 'CONNECTION_STATUS_DISCONNECTED'
                    ? this.homey.__('Polestar2.device.isCharging')
                    : this.homey.__('Polestar2.device.isNotCharging'));
            await this.setCapabilityValue('measure_polestarUpdated', lastUpdated);
        } else {
            this.homey.app.log(this.homey.__({
                en: 'Failed to update device data for ' + this.name,
                no: 'Klarte ikke å oppdatere enhetsdata for ' + this.name
            }),
                this.name, 'ERROR');
        }

        this.homey.app.log(this.homey.__({
            en: 'Device data updated successfully',
            no: 'Enhetsdata ble oppdatert vellykket'
        }),
            this.name, 'DEBUG');
        this.homey.app.log(this.homey.__({
            en: 'Next update in ' + moment.duration(this.refreshInterval).humanize(),
            no: 'Neste oppdatering om ' + moment.duration(this.refreshInterval).humanize()
        }),
            this.name, 'DEBUG');
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

module.exports = PolestarBetaDevice;
