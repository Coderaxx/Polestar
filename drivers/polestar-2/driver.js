'use strict';

const { Driver } = require('homey');
const axios = require('axios');

class Polestar extends Driver {
	async onInit() {
		this.log('Polestar has been initialized');

		this.token = this.homey.settings.get('tibber_token') || null;
		this.tibberAccount = {
			email: this.homey.settings.get('tibber_email') || null,
			password: this.homey.settings.get('tibber_password') || null,
		};
		this.vehicles = [];
	}

	async onPair(session) {
		this.log('Started pairing for Polestar 2');

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
				this.error(error);
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
				const car = response.data.data.me.homes[0].electricVehicles;
				const vehicles = car.map((vehicle) => {
					return {
						name: vehicle.shortName,
						data: {
							id: vehicle.id,
						},
						settings:
						{
							tibber_email: this.tibberAccount.email,
							tibber_password: this.tibberAccount.password,
							refresh_interval: 60,
						}
					};
				});
				this.vehicles = vehicles;

				return { success: true, vehicles };
			} catch (error) {
				this.error(error);
				return error;
			}
		});

		session.setHandler('list_devices', async () => {
			return await this.onPairListDevices(session);
		});
	}

	async onPairListDevices() {
		this.log('Vehicles ready to be added:', this.vehicles);
		return this.vehicles;
	}

}

module.exports = Polestar;
