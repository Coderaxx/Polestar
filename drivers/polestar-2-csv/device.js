'use strict';

const { Device } = require('homey');
const moment = require('moment');
const axios = require('axios');

class PolestarBetaDevice extends Device {
    async onInit() {
        this.name = this.getName();

        this.homey.app.log(this.homey.__({
            en: `${this.name} has been initialized`,
            no: `${this.name} har blitt initialisert`
        }), this.name, 'DEBUG');

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
        webhook.on('message', async args => {
            this.homey.app.log(this.homey.__({
                en: 'Received webhook message for ' + this.name,
                no: 'Mottok webhook data med kjøretøydata for ' + this.name
            }), this.name, 'DEBUG');

            this.vehicleData = {
                ...args.body
            };

            await this.updateDeviceData();
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
        }), this.name, 'DEBUG');

        if (this.vehicleData) {
            const lastUpdated = moment(this.vehicleData.timestamp).fromNow();
            const soc = parseInt(this.vehicleData.stateOfCharge * 100);
            const range = `≈ ${parseInt((soc / 100) * 487, 10) / 1.5} km`;
            const batteryLevel = `${parseInt(this.vehicleData.batteryLevel / 1000)} kWh`;
            const alt = `${parseInt(this.vehicleData.alt)} m`;
            const speed = `${parseInt(this.vehicleData.speed * 3.6)} km/t`;
            const power = parseInt(this.vehicleData.power);
            const temp = `${this.vehicleData.ambientTemperature} °C`;
            const lat = this.vehicleData.lat;
            const lon = this.vehicleData.lon;
            const location = await this.reverseGeocode(lat, lon);
            let ignitionState = this.vehicleData.ignitionState;

            let powerString;
            if (power > 1000) {
                powerString = `${parseFloat(power / 1000).toFixed(2)} ${power / 1000 > 1000 ? ' kW' : ' W'}`;
            } else if (power < -1000) {
                powerString = `${parseFloat(power / 1000).toFixed(2)} ${power / 1000 > 1000 ? ' kW' : ' W'}`;
            }

            switch (ignitionState) {
                case 'Started':
                    ignitionState = this.homey.__({ "en": "Started", "no": "Startet" });
                    break;
                case 'On':
                    ignitionState = this.homey.__({ "en": "On", "no": "På" });
                    break;
                case 'Off':
                    ignitionState = this.homey.__({ "en": "Off", "no": "Av" });
                    break;
                case 'Accessory':
                    ignitionState = this.homey.__({ "en": "Accessory", "no": "Tilgjengelig" });
                default:
                    ignitionState = this.homey.__({ "en": "Unknown", "no": "Ukjent" });
                    break;
            }

            await this.setCapabilityValue('measure_battery', soc);
            await this.setCapabilityValue('measure_polestarBattery', soc);
            await this.setCapabilityValue('measure_polestarRange', range);
            await this.setCapabilityValue('measure_polestarBatteryLevel', batteryLevel);
            await this.setCapabilityValue('measure_polestarConnected', this.vehicleData.chargePortConnected === true ? true : false);
            await this.setCapabilityValue('measure_polestarIgnitionState', ignitionState);
            await this.setCapabilityValue('measure_polestarLocation', location);
            await this.setCapabilityValue('measure_polestarSpeed', speed);
            await this.setCapabilityValue('measure_polestarAlt', alt);
            await this.setCapabilityValue('measure_polestarPower', powerString);
            await this.setCapabilityValue('measure_polestarGear', this.vehicleData.selectedGear);
            await this.setCapabilityValue('measure_polestarTemp', temp);
            await this.setCapabilityValue('measure_polestarUpdated', lastUpdated);
        } else {
            this.homey.app.log(this.homey.__({
                en: 'Failed to update device data for ' + this.name,
                no: 'Klarte ikke å oppdatere enhetsdata for ' + this.name
            }), this.name, 'ERROR');
        }

        this.homey.app.log(this.homey.__({
            en: 'Device data updated successfully',
            no: 'Enhetsdata ble oppdatert vellykket'
        }), this.name, 'DEBUG');
    }

    async reverseGeocode(lat, lon) {
        const url = `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lon}&apiKey=398de38932c248a8b8e0544c79fc3f1c`;
        const response = await axios.get(url);
        if (response.data.features.length > 0) {
            const address = response.data.features[0].properties.formatted;
            return address;
        }
        return null;
    }

    async onAdded() {
        this.homey.app.log(this.homey.__({
            en: this.name + ' has been added',
            no: this.name + ' har blitt lagt til'
        }),
            this.name, 'DEBUG');
    }

    async onRenamed(name) {
        this.homey.app.log(this.homey.__({
            en: this.name + ' has been renamed to ' + name,
            no: 'Navnet på ' + this.name + ' har blitt endret til ' + name
        }), name, 'DEBUG');
    }

    async onDeleted() {
        if (this.interval) {
            this.homey.clearInterval(this.interval);
        }
        this.homey.app.log(this.homey.__({
            en: this.name + ' has been deleted',
            no: this.name + ' har blitt slettet'
        }), this.name, 'DEBUG');
    }

}

module.exports = PolestarBetaDevice;
