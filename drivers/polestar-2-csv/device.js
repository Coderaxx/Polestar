'use strict';

const { Device } = require('homey');
const moment = require('moment');
const axios = require('axios');
const geolib = require('geolib');

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
        this.updatedInterval = null;
        this.previousLat = null;
        this.previousLon = null;
        this.threshold = 10; // Threshold in meters for distance updates

        const id = this.settings.webhook_id || null;
        const secret = this.settings.webhook_secret || null;
        const data = {

        };
        const webhook = await this.homey.cloud.createWebhook(id, secret, data);
        webhook.on('message', async args => {
            const fields = ['ambientTemperature', 'batteryLevel', 'chargePortConnected', 'ignitionState', 'lat', 'lon', 'power', 'selectedGear', 'speed', 'stateOfCharge'];
            const isDataMissing = fields.some(field => args.body[field] === undefined || args.body[field] === null);

            if (!args.body || isDataMissing) {
                this.homey.app.log(this.homey.__({
                    en: 'Received webhook message for ' + this.name + ' but data is missing.',
                    no: 'Mottok webhook data med kjøretøydata for ' + this.name + ' men mangler data.'
                }), this.name, 'WARNING', args.body);

                return;
            }
            this.homey.app.log(this.homey.__({
                en: 'Received webhook message for ' + this.name,
                no: 'Mottok webhook data med kjøretøydata for ' + this.name
            }), this.name, 'DEBUG', args.body);

            this.vehicleData = {
                ...args.body
            };

            await this.updateDeviceData();
        });

        this.updatedInterval = this.homey.setInterval(async () => {
            await this.updateLastUpdated();
        }, 60 * 1000);

        this.homey.app.log(this.homey.__({
            en: 'Interval for ' + this.name + ' has been set',
            no: 'Intervall for ' + this.name + ' har blitt satt'
        }), this.name, 'DEBUG');
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
            let range = parseInt((soc / 100) * 487, 10) / 1.5;
            range = `≈ ${parseInt(range).toFixed(0)} km`;
            const batteryLevel = parseFloat((this.vehicleData.batteryLevel / 1000).toFixed(2));
            let connected = this.vehicleData.chargePortConnected;
            const alt = parseInt(this.vehicleData.alt);
            const speed = parseInt(this.vehicleData.speed * 3.6);
            const powerW = parseInt(this.vehicleData.power / 1000);
            const powerKW = parseFloat((powerW / 1000).toFixed(2));
            const temp = parseInt(this.vehicleData.ambientTemperature);
            let ignitionState = this.vehicleData.ignitionState;
            const lat = this.vehicleData.lat;
            const lon = this.vehicleData.lon;
            const location = await this.reverseGeocode(lat, lon);
            let address;
            if (location) {
                const { road, house_number, postcode, city } = location;
                if (speed > 10) {
                    // Vis kun vei og by for høyere hastigheter
                    address = road ? `${road}` : '';
                    address += city ? `, ${city}` : '';
                } else {
                    // Vis full adresse for lavere hastigheter
                    address = road ? `${road}` : '';
                    address += house_number ? ` ${house_number}` : '';
                    address += postcode ? `, ${postcode}` : '';
                    address += city ? ` ${city}` : '';
                }
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
                    ignitionState = this.homey.__({ "en": "Idle", "no": "Klar" });
                    break;
                default:
                    ignitionState = this.homey.__({ "en": "Unknown", "no": "Ukjent" });
                    break;
            }

            if (connected) {
                if (connected && Math.abs(powerW) >= 1000) {
                    connected = this.homey.__({ "en": "Charging", "no": "Lader" });
                } else {
                    connected = this.homey.__({ "en": "Connected", "no": "Tilkoblet" });
                }
            } else {
                connected = this.homey.__({ "en": "Disconnected", "no": "Frakoblet" });
            }

            await this.setCapabilityValue('measure_battery', soc);
            await this.setCapabilityValue('measure_polestarBattery', soc);
            await this.setCapabilityValue('measure_polestarRange', range);
            await this.setCapabilityValue('measure_polestarBatteryLevel', batteryLevel);
            await this.setCapabilityValue('measure_polestarConnected', connected);
            await this.setCapabilityValue('measure_polestarIgnitionState', ignitionState);
            await this.setCapabilityValue('measure_polestarLocation', address);
            await this.setCapabilityValue('measure_polestarSpeed', speed);
            await this.setCapabilityValue('measure_polestarAlt', alt);
            await this.setCapabilityValue('measure_polestarPower', powerKW);
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

    async updateLastUpdated() {
        if (this.vehicleData && this.vehicleData.timestamp) {
            const lastUpdated = moment(this.vehicleData.timestamp).fromNow();
            await this.setCapabilityValue('measure_polestarUpdated', lastUpdated);
        }
    }

    async reverseGeocode(lat, lon) {
        if (
            this.previousLat &&
            this.previousLon &&
            geolib.getDistance(
                { latitude: lat, longitude: lon },
                { latitude: this.previousLat, longitude: this.previousLon }
            ) <= this.threshold
        ) {
            // Return the previous address without making a new request
            this.homey.app.log(this.homey.__({
                en: 'Using previous address',
                no: 'Bruker forrige adresse'
            }), this.name, 'DEBUG');

            return this.previousAddress;
        }

        //const url = `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lon}&apiKey=398de38932c248a8b8e0544c79fc3f1c`;
        const url = `https://nominatim.openstreetmap.org/reverse.php?lat=${lat}&lon=${lon}&zoom=18&format=jsonv2`;
        const response = await axios.get(url);
        if (response.data && response.data.address) {
            //const address = response.data.features[0].properties.formatted;
            //const address = `${response.data.address.road} ${response.data.address.house_number}, ${response.data.address.postcode} ${response.data.address.suburb}`;
            const address = {
                road: response.data.address.road || null,
                house_number: response.data.address.house_number || null,
                postcode: response.data.address.postcode || null,
                city: response.data.address.suburb || null,
                city_district: response.data.address.city_district || null,
                county: response.data.address.county || null,
                country: response.data.address.country || null,
            }

            // Update the previous values with the current values
            this.previousLat = lat;
            this.previousLon = lon;
            this.previousAddress = address;

            this.homey.app.log(this.homey.__({
                en: 'Using new address',
                no: 'Bruker ny adresse'
            }), this.name, 'DEBUG');

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
