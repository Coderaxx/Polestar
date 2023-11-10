'use strict';

const { Driver } = require('homey');
const axios = require('axios');

class PolestarDriver extends Driver {
	async onInit() {
		this.homey.app.log(this.homey.__({ en: 'Polestar Driver has been initialized', no: 'Polestar Driver har blitt initialisert' }), 'Polestar Driver', 'DEBUG');

		this.token = this.homey.settings.get('tibber_token') || null;
		this.tibberAccount = {
			email: this.homey.settings.get('tibber_email') || null,
			password: this.homey.settings.get('tibber_password') || null,
		};
		this.vehicles = [];
	}

	async onPair(session) {
		this.homey.app.log(this.homey.__({ en: 'Started pairing for Polestar 2', no: 'Starter paring for Polestar 2' }), 'Polestar Driver', 'DEBUG');

		session.setHandler('getLoginDetails', async () => {
			if (this.tibberAccount.email && this.tibberAccount.password) {
				return { success: true, email: this.tibberAccount.email, password: this.tibberAccount.password };
			}
		});

		session.setHandler('login', async (data) => {
			const { email, password } = data;
			this.tibberAccount = { email, password };
			this.homey.settings.set('tibber_email', this.tibberAccount.email);
			this.homey.settings.set('tibber_password', this.tibberAccount.password);

			try {
				const response = await axios.post('https://app.tibber.com/login.credentials', {
					email,
					password,
				});

				const { data: { token } } = response;
				this.token = token;
				this.homey.settings.set('tibber_token', this.token);

				return { success: true, token };
			} catch (error) {
				this.homey.app.log(this.homey.__({ en: 'Error logging in to Tibber', no: 'Feil ved innlogging til Tibber' }), 'Polestar Driver', 'ERROR', error.response?.status);
				return error;
			}
		});

		session.setHandler('getVehicles', async () => {
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
					}}`,
				}, {
					headers: {
						'Authorization': `Bearer ${this.token}`,
						'Content-Type': 'application/json',
						'Accept': 'application/json',
					},
				});
				const cars = response.data.data.me.homes[0].electricVehicles;
				// Filtrer for å kun inkludere Polestar-biler
				const polestarVehicles = cars.filter(vehicle => vehicle.shortName.includes('Polestar'));
				const vehicles = polestarVehicles.map((vehicle) => {
					return {
						name: vehicle.shortName,
						data: {
							id: vehicle.id,
						},
						settings: {
							tibber_email: this.tibberAccount.email,
							tibber_password: this.tibberAccount.password,
							refresh_interval: 60,
						}
					};
				});
				this.vehicles = vehicles;

				return { success: true, vehicles };
			} catch (error) {
				this.homey.app.log(this.homey.__({ en: 'Error fetching vehicle data from Tibber', no: 'Feil ved henting av kjøretøydata fra Tibber' }), 'Polestar Driver', 'ERROR', error.response?.status);
				return { success: false, error: error };
			}
		});

		session.setHandler('list_devices', async () => {
			return await this.onPairListDevices(session);
		});
	}

	async onPairListDevices() {
		this.homey.app.log(this.homey.__({ en: 'Vehicles ready to be added: ' + this.vehicles, no: 'Kjøretøy klare til å bli lagt til: ' + this.vehicles }), 'Polestar Driver', 'DEBUG');
		return this.vehicles;
	}

}

module.exports = PolestarDriver;
