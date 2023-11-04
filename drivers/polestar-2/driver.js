'use strict';

const { Driver } = require('homey');
const axios = require('axios');

class Polestar extends Driver {
	async onInit() {
		this.log('Polestar has been initialized');
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
				return token;
			} catch (error) {
				this.error(error);
				return null;
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
