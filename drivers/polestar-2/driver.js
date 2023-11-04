'use strict';

const { Driver } = require('homey');
const axios = require('axios');

class Polestar extends Driver {
	async onInit() {
		this.log('Polestar has been initialized');

		this.token = null;
	}

	async onPair(session) {
		this.log('Started pairing for Polestar 2');

		session.setHandler('login', async (data) => {
			const { email, password } = data;
			try {
				const response = await axios.post('https://app.tibber.com/login.credentials', {
					email,
					password,
				});

				const { data: { token } } = response;
				this.token = token;

				return { success: true, token };
			} catch (error) {
				this.error(error);
				return error;
			}
		});

		session.setHandler('getVehicles', async (data) => {
			try {
				const response = await axios.post('https://app.tibber.com/v4/gql', {
					query: '{\n  me{\n    myVehicles{\n      vehicles{\n        id\n        title\n        }\n    }\n  }\n}',
				}, {
					headers: {
						'Authorization': `Bearer ${this.token}`,
						'Content-Type': 'application/json',
						'Accept': 'application/json',
					},
				});
				const { data: { data: { me: { myVehicles: { vehicles } } } } } = response;
				return { success: true, vehicles };
			} catch (error) {
				this.error(error);
				return error;
			}
		});
	}

	async onPairListDevices() {
		return [
			// Example device data, note that `store` is optional
			// {
			//   name: 'My Device',
			//   data: {
			//     id: 'my-device',
			//   },
			//   store: {
			//     address: '127.0.0.1',
			//   },
			// },
		];
	}

}

module.exports = Polestar;
