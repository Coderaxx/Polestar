'use strict';

const { Device } = require('homey');
const axios = require('axios');
const moment = require('moment');

class PolestarDevice extends Device {
	async onInit() {
		this.name = this.getName();

		this.homey.app.log(this.homey.__({
			en: `${this.name} has been initialized`,
			no: `${this.name} har blitt initialisert`
		}),
			this.name, 'DEBUG');

		moment.locale(this.homey.i18n.getLanguage() === 'no' ? 'nb' : 'en');

		this.settings = await this.getSettings();
		this.token = await this.homey.settings.get('tibber_token') || null;
		this.isLoggedIn = this.token !== null;
		this.vehicleId = this.getData().id;
		this.vehicleData = null;

		this.refreshInterval = this.settings.refresh_interval * 60 * 1000 || 60 * 60 * 1000;

		this.homey.app.log(this.homey.__({
			en: `Interval set to ${this.refreshInterval / 1000 / 60} minutes`,
			no: `Intervall satt til ${this.refreshInterval / 1000 / 60} minutter`
		}),
			this.name, 'DEBUG');
		await this.updateDeviceData();
		this.interval = this.homey.setInterval(async () => {
			await this.updateDeviceData();
		}, this.refreshInterval);
	}

	async loginToTibber(email, password) {
		if (!email || !password) {
			this.homey.app.log(this.homey.__({
				en: 'Email or password is missing!',
				no: 'Epost eller passord mangler!'
			}),
				this.name, 'ERROR');
			return;
		}
		if (this.isLoggedIn) {
			this.homey.app.log(this.homey.__({
				en: 'Already logged in!',
				no: 'Allerede logget inn!'
			}),
				this.name, 'DEBUG');
			return;
		}
		this.homey.app.log(this.homey.__({
			en: 'Logging in to Tibber...',
			no: 'Logger inn på Tibber...'
		}),
			this.name, 'DEBUG');

		try {
			const response = await axios.post('https://app.tibber.com/login.credentials', {
				email,
				password,
			});

			const { data: { token } } = response;

			this.token = token;
			this.homey.settings.set('tibber_token', this.token);
			this.isLoggedIn = true;

			this.homey.app.log(this.homey.__({
				en: 'Successfully logged in to Tibber!',
				no: 'Tibber innlogging var vellykket!'
			}),
				this.name, 'DEBUG');

			return token;
		} catch (error) {
			this.error(this.homey.__({
				en: 'Failed to login to Tibber. Error code: ' + error.response.status,
				no: 'Klarte ikke å logge inn på Tibber. Feilkode: ' + error.response.status
			}),
				this.name, 'ERROR');
			return error;
		}
	}

	async fetchVehicleData() {
		if (!this.isLoggedIn) {
			this.homey.app.log(this.homey.__({
				en: 'Not logged in, logging in to Tibber again...',
				no: 'Ikke logget inn, logger inn på Tibber på nytt...'
			}),
				this.name, 'DEBUG');
			await this.loginToTibber(this.getSetting('tibber_email'), this.getSetting('tibber_password'));
			return await this.fetchVehicleData();
		}
		this.homey.app.log(this.homey.__({
			en: 'Fetching vehicle data for Polestar 2 from Tibber...',
			no: 'Henter kjøretøydata for Polestar 2 fra Tibber...'
		}),
			this.name, 'DEBUG');

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

			this.homey.app.log(this.homey.__({
				en: 'Successfully fetched vehicle data for Polestar 2',
				no: 'Henting av kjøretøydata for Polestar 2 var vellykket'
			}),
				this.name, 'DEBUG');

			return vehicleData;
		} catch (error) {
			if (error.response.status === 401) {
				this.homey.app.log(this.homey.__({
					en: 'Token is invalid, logging in to Tibber again...',
					no: 'Token er ugyldig, logger inn på Tibber på nytt...'
				}),
					this.name, 'DEBUG');
				this.token = null;
				this.isLoggedIn = false;
				await this.loginToTibber(this.getSetting('tibber_email'), this.getSetting('tibber_password'));
				return await this.fetchVehicleData();
			} else if (error.response.status === 429) {
				this.error(this.homey.__({
					en: 'Too many requests, try again later...',
					no: 'For mange forespørsler, prøv igjen senere...'
				}),
					this.name, 'ERROR');

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
		this.homey.app.log(this.homey.__({
			en: 'Updating device data for ' + this.name,
			no: 'Oppdaterer enhetsdata for ' + this.name
		}),
			this.name, 'DEBUG');
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
		if (changedKeys.includes('tibber_email') || changedKeys.includes('tibber_password')) {
			this.token = await this.loginToTibber(newSettings.tibber_email, newSettings.tibber_password);
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

module.exports = PolestarDevice;
