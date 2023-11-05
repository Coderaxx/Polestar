'use strict';

const { Device } = require('homey');
const axios = require('axios');
const moment = require('moment');

class Polestar extends Device {
	async onInit() {
		this.homey.app.log(this.homey.__({ en: 'Polestar has been initialized', no: 'Polestar har blitt initialisert' }));

		moment.locale(this.homey.i18n.getLanguage() === 'no' ? 'nb' : 'en');

		this.settings = await this.getSettings();
		this.token = await this.homey.settings.get('tibber_token') || null;
		this.isLoggedIn = this.token !== null;
		this.vehicleId = this.getData().id;
		this.vehicleData = null;

		this.refreshInterval = this.settings.refresh_interval * 60 * 1000 || 60 * 60 * 1000;

		this.homey.app.log(this.homey.__({ en: `Interval set to ${this.refreshInterval / 1000 / 60} minutes`, no: `Intervall satt til ${this.refreshInterval / 1000 / 60} minutter` }));
		await this.updateDeviceData();
		this.interval = this.homey.setInterval(async () => {
			await this.updateDeviceData();
		}, this.refreshInterval);
	}

	async loginToTibber(email, password) {
		if (!email || !password) {
			this.homey.app.log(this.homey.__({ en: 'Email or password is missing', no: 'Epost eller passord mangler' }));
			return;
		}
		if (this.isLoggedIn) {
			this.homey.app.log(this.homey.__({ en: 'Already logged in', no: 'Allerede logget inn' }));
			return;
		}
		this.homey.app.log(this.homey.__({ en: 'Logging in to Tibber', no: 'Logger inn på Tibber' }));

		try {
			const response = await axios.post('https://app.tibber.com/login.credentials', {
				email,
				password,
			});

			const { data: { token } } = response;

			this.token = token;
			this.homey.settings.set('tibber_token', this.token);
			this.isLoggedIn = true;

			this.homey.app.log(this.homey.__({ en: 'Successfully logged in to Tibber', no: 'Logget inn på Tibber' }));

			return token;
		} catch (error) {
			this.error(this.homey.__({ en: 'Failed to login to Tibber. Check your email and password and try again.' + error.message, no: 'Klarte ikke å logge inn på Tibber. Sjekk epost og passord og prøv igjen.' + error.message }));
			return error;
		}
	}

	async fetchVehicleData() {
		if (!this.isLoggedIn) {
			this.homey.app.log(this.homey.__({ en: 'Not logged in, logging in again', no: 'Ikke logget inn, logger inn på nytt' }));
			await this.homey.app.loginToTibber(this.getSetting('tibber_email'), this.getSetting('tibber_password'));
			return await this.fetchVehicleData();
		}
		this.homey.app.log(this.homey.__({ en: 'Fetching vehicle data for Polestar 2...', no: 'Henter kjøretøydata for Polestar 2...' }));

		try {
			const response = await axios.post('https://app.tibber.com/v4/gql', {
				query: `{
				me{
					homes{
						electricVehicles{
							id
							name
							shortName
							lastSeen
							lastSeenText
							isAlive
							hasNoSmartChargingCapability
							battery{
								percent
								percentColor
								isCharging
								chargeLimit
							}
							batteryText
							chargingText
							consumptionText
							consumptionUnitText
						}
					}
					vehicle(id: "${this.vehicleId}"){
						id
						name
						isAlive
						isCharging
						smartChargingStatus
						hasConsumption
						enterPincode
						image{
							category
							imageUrl
							imgUrl
						}
						battery{
							canReadLevel
							level
							estimatedRange
						}
						status{
							title
							description
						}
						charging{
							progress{
								cost
								speed
								energy
							}
							currency
							chargerId
							activeChargeLimit
							sessionStartedAt
							targetedStateOfCharge
							targetedDepartureTime
						}
					}
					myVehicle(id: "${this.vehicleId}"){
						id
						title
						description
						imgUrl
						detailsScreen{
							siteTitle
							settings{
								key
								value
								valueType
								valueIsArray
								isReadOnly
							}
						}
					}
				}
			}`,
			}, {
				headers: {
					'Authorization': `Bearer ${this.token}`,
					'Content-Type': 'application/json',
					'Accept': 'application/json',
				},
			});
			const vehicleData = {
				homes: response.data.data.me.homes[0].electricVehicles[0],
				vehicle: response.data.data.me.vehicle,
				myVehicle: response.data.data.me.myVehicle,
			};

			this.homey.app.log(this.homey.__({ en: 'Successfully fetched vehicle data for Polestar 2', no: 'Hentet kjøretøydata for Polestar 2' }));
			this.homey.app.log(this.homey.__({ en: 'Next update in' + moment.duration(this.refreshInterval).humanize(), no: 'Neste oppdatering om' + moment.duration(this.refreshInterval).humanize() }));

			return vehicleData;
		} catch (error) {
			if (error.response.status === 401) {
				this.homey.app.log(this.homey.__({ en: 'Token is invalid, logging in again', no: 'Token er ugyldig, logger inn på nytt' }));
				this.token = null;
				this.isLoggedIn = false;
				await this.homey.app.loginToTibber(this.getSetting('tibber_email'), this.getSetting('tibber_password'));
				return await this.fetchVehicleData();
			} else if (error.response.status === 429) {
				this.error(this.homey.__({ en: 'Too many requests, try again later', no: 'For mange forespørsler, prøv igjen senere' }));

				// Timeout for 30 minutes
				await new Promise(resolve => setTimeout(resolve, 30 * 60 * 1000));

				return await this.fetchVehicleData();
			} else {
				this.error(error);
				return error;
			}
		}
	}

	async updateDeviceData() {
		this.homey.app.log(this.homey.__({ en: 'Updating device data', no: 'Oppdaterer enhetsdata' }));
		this.vehicleData = await this.fetchVehicleData();

		if (this.vehicleData) {
			const lastUpdated = moment(this.vehicleData.homes.lastSeen).fromNow();
			const soc = this.vehicleData.vehicle.battery.level;
			const range = parseInt(parseInt((soc / 100) * 487, 10) / 1.5);

			await this.setCapabilityValue('measure_battery', this.vehicleData.vehicle.battery.level);
			await this.setCapabilityValue('measure_polestarBattery', this.vehicleData.vehicle.battery.level);
			await this.setCapabilityValue('measure_polestarRange', `~ ${range} km`);
			await this.setCapabilityValue('measure_polestarChargeState', this.vehicleData.homes.battery.isCharging === null
				? this.homey.__('Polestar2.device.unknownChargingState')
				: this.vehicleData.homes.battery.isCharging
					? this.homey.__('Polestar2.device.isCharging')
					: this.homey.__('Polestar2.device.isNotCharging'));
			await this.setCapabilityValue('measure_polestarUpdated', lastUpdated);
		} else {
			this.homey.app.log(this.homey.__({ en: 'Failed to update device data', no: 'Klarte ikke å oppdatere enhetsdata' }));
		}

		this.homey.app.log(this.homey.__({ en: 'Device data updated', no: 'Enhetsdata oppdatert' }));
	}

	async onAdded() {
		this.homey.app.log(this.homey.__({ en: 'Polestar has been added', no: 'Polestar har blitt lagt til' }));
	}

	async onSettings({ oldSettings, newSettings, changedKeys }) {
		this.homey.app.log(this.homey.__({ en: 'Polestar settings where changed', no: 'Polestar innstillinger ble endret' }));
		if (changedKeys.includes('tibber_email') || changedKeys.includes('tibber_password')) {
			this.token = await this.homey.app.loginToTibber(newSettings.tibber_email, newSettings.tibber_password);
			this.isLoggedIn = this.token !== undefined;
		}
		if (changedKeys.includes('refresh_interval')) {
			this.refreshInterval = newSettings.refresh_interval * 60 * 1000;
			this.homey.clearInterval(this.interval);
			this.interval = this.homey.setInterval(async () => {
				await this.updateDeviceData();
			}, this.refreshInterval);
		}
	}

	async onRenamed(name) {
		this.homey.app.log(this.homey.__({ en: 'Polestar was renamed til ' + name, no: 'Polestar ble omdøpt til ' + name }));
	}

	async onDeleted() {
		if (this.interval) {
			this.homey.clearInterval(this.interval);
		}
		this.homey.app.log(this.homey.__({ en: 'Polestar has been deleted', no: 'Polestar har blitt slettet' }));
	}

}

module.exports = Polestar;
