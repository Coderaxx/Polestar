'use strict';

const { Device } = require('homey');
const axios = require('axios');
const moment = require('moment');

class Polestar extends Device {
	async onInit() {
		this.log('Polestar has been initialized');

		moment.locale(this.homey.i18n.getLanguage() === 'no' ? 'nb' : 'en');

		this.settings = await this.getSettings();
		this.token = await this.loginToTibber(this.settings.tibber_email, this.settings.tibber_password);
		this.isLoggedIn = this.token !== undefined;
		this.vehicleId = this.getData().id;
		this.vehicleData = null;

		this.refreshInterval = this.settings.refresh_interval * 60 * 1000;
		
		await this.updateDeviceData();
		this.homey.setInterval(async () => {
			await this.updateDeviceData();
		}, this.refreshInterval || 60 * 60 * 1000);
	}

	async loginToTibber(email, password) {
		if (!email || !password) {
			this.log('Email or password is missing');
			return;
		}
		if (this.isLoggedIn) {
			this.log('Already logged in');
			return;
		}
		this.log('Logging in to Tibber');

		try {
			const response = await axios.post('https://app.tibber.com/login.credentials', {
				email,
				password,
			});

			const { data: { token } } = response;
			this.log('Successfully logged in to Tibber');

			return token;
		} catch (error) {
			this.error('Failed to login to Tibber. Check your email and password and try again.', error.message);
			return error;
		}
	}

	async fetchVehicleData() {
		if (!this.isLoggedIn) {
			this.log('Not logged in, logging in again');
			await this.loginToTibber(this.getSetting('tibber_email'), this.getSetting('tibber_password'));
			return await this.fetchVehicleData();
		}
		this.log('Fetching vehicle data for Polestar 2');

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

			return vehicleData;
		} catch (error) {
			if (error.response.status === 401) {
				this.log('Token is invalid, logging in again');
				this.token = null;
				this.isLoggedIn = false;
				await this.loginToTibber(this.getSetting('tibber_email'), this.getSetting('tibber_password'));
				return await this.fetchVehicleData();
			}
			this.error(error);
			return error;
		}
	}

	async updateDeviceData() {
		this.log('Updating device data');
		this.vehicleData = await this.fetchVehicleData();

		if (this.vehicleData) {
			const lastUpdated = moment(this.vehicleData.homes.lastSeen).fromNow();
			const soc = this.vehicleData.vehicle.battery.level;
			const range = parseInt((soc / 100) * 487, 10) / 1.5;

			await this.setCapabilityValue('measure_battery', this.vehicleData.vehicle.battery.level);
			await this.setCapabilityValue('measure_polestarBattery', this.vehicleData.vehicle.battery.level);
			await this.setCapabilityValue('measure_polestarRange', `~ ${range} km`);
			await this.setCapabilityValue('measure_polestarChargeState', this.vehicleData.vehicle.isCharging === null ? 'Ukjent' : this.vehicleData.vehicle.isCharging ? 'Lader' : 'Lader ikke');
			await this.setCapabilityValue('measure_polestarUpdated', lastUpdated);

			await this.setCapabilityOptions('measure_polestarBattery', {
				icon: await this.calculateBatteryIcon(this.vehicleData.vehicle.battery.level),
			});
		}
	}

	async calculateBatteryIcon(batteryLevel) {
		if (batteryLevel == 100) {
			return '/drivers/polestar-2/assets/images/battery-100.svg';
		} else if (batteryLevel <= 99 && batteryLevel >= 95) {
			return '/drivers/polestar-2/assets/images/battery-95.svg';
		} else if (batteryLevel <= 94 && batteryLevel >= 90) {
			return '/drivers/polestar-2/assets/images/battery-90.svg';
		} else if (batteryLevel <= 89 && batteryLevel >= 85) {
			return '/drivers/polestar-2/assets/images/battery-85.svg';
		} else if (batteryLevel <= 84 && batteryLevel >= 80) {
			return '/drivers/polestar-2/assets/images/battery-80.svg';
		} else if (batteryLevel <= 79 && batteryLevel >= 75) {
			return '/drivers/polestar-2/assets/images/battery-75.svg';
		} else if (batteryLevel <= 74 && batteryLevel >= 70) {
			return '/drivers/polestar-2/assets/images/battery-70.svg';
		} else if (batteryLevel <= 69 && batteryLevel >= 65) {
			return '/drivers/polestar-2/assets/images/battery-65.svg';
		} else if (batteryLevel <= 64 && batteryLevel >= 60) {
			return '/drivers/polestar-2/assets/images/battery-60.svg';
		} else if (batteryLevel <= 59 && batteryLevel >= 55) {
			return '/drivers/polestar-2/assets/images/battery-55.svg';
		} else if (batteryLevel <= 54 && batteryLevel >= 50) {
			return '/drivers/polestar-2/assets/images/battery-50.svg';
		} else if (batteryLevel <= 49 && batteryLevel >= 45) {
			return '/drivers/polestar-2/assets/images/battery-45.svg';
		} else if (batteryLevel <= 44 && batteryLevel >= 40) {
			return '/drivers/polestar-2/assets/images/battery-40.svg';
		} else if (batteryLevel <= 39 && batteryLevel >= 35) {
			return '/drivers/polestar-2/assets/images/battery-35.svg';
		} else if (batteryLevel <= 34 && batteryLevel >= 30) {
			return '/drivers/polestar-2/assets/images/battery-30.svg';
		} else if (batteryLevel <= 29 && batteryLevel >= 25) {
			return '/drivers/polestar-2/assets/images/battery-25.svg';
		} else if (batteryLevel <= 24 && batteryLevel >= 20) {
			return '/drivers/polestar-2/assets/images/battery-20.svg';
		} else if (batteryLevel <= 19 && batteryLevel >= 15) {
			return '/drivers/polestar-2/assets/images/battery-15.svg';
		} else if (batteryLevel <= 14 && batteryLevel >= 10) {
			return '/drivers/polestar-2/assets/images/battery-10.svg';
		} else if (batteryLevel <= 9 && batteryLevel >= 5) {
			return '/drivers/polestar-2/assets/images/battery-5.svg';
		} else if (batteryLevel <= 4 && batteryLevel >= 0) {
			return '/drivers/polestar-2/assets/images/battery-0.svg';
		}
	}

	async onAdded() {
		this.log('Polestar has been added');
	}

	async onSettings({ oldSettings, newSettings, changedKeys }) {
		this.log('Polestar settings where changed');
	}

	async onRenamed(name) {
		this.log('Polestar was renamed');
	}

	async onDeleted() {
		this.log('Polestar has been deleted');
	}

}

module.exports = Polestar;
