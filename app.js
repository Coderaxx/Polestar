'use strict';

const Homey = require('homey');
const moment = require('moment');

class Polestar extends Homey.App {
	async onInit() {
		this.userLanguage = this.homey.i18n.getLanguage();
		moment.locale(this.userLanguage == 'no' ? 'nb' : 'en');

		this.homey.settings.set('debugLog', null);

		this.log(this.homey.__({
			en: 'Polestar App has been initialized',
			no: 'Polestar App har blitt initialisert'
		}));

		this.homey.settings.on('set', (key) => {
			if (key === 'debugLog') return;
			this.log(this.homey.__({
				en: 'Setting updated:',
				no: 'Innstilling oppdatert:'
			}), 'Polestar App', 'DEBUG', `${key}: ${key == 'tibber_token' || key == 'polestar_token' ? '********' : this.homey.settings.get(key)}`);
		});
	}

	async log(message, instance = 'Polestar App', severity = 'DEBUG', data = null) {
		const now = new Date();

		let datestring = now.toLocaleDateString(this.userLanguage, {
			dateStyle: 'short',
			timeZone: 'Europe/Oslo'
		});
		let timestring = now.toLocaleTimeString(this.userLanguage, {
			timeStyle: 'medium',
			timeZone: 'Europe/Oslo'
		});

		let debugDateString = `${datestring} ${timestring}`;
		datestring = `${datestring} - ${timestring}`;

		const debugLog = this.homey.settings.get('debugLog') || [];
		const entry = { registered: debugDateString, severity, message };

		switch (severity) {
			case 'DEBUG':
				severity = '\x1b[36mDEBUG\x1b[0m';
				break;
			case 'WARNING':
				severity = '\x1b[33mWARNING\x1b[0m';
				break;
			case 'ERROR':
				severity = '\x1b[31mERROR\x1b[0m';
				break;
			default:
				severity = '\x1b[36mDEBUG\x1b[0m';
				break;
		}

		const logMessage = `${datestring} [${instance}] [${severity}] ${message}`;

		if (data) {
			console.log(logMessage, data || '');

			if (typeof data === 'string') {
				entry.data = { data };
			} else if (data.message) {
				entry.data = { error: data.message, stacktrace: data.stack };
			} else {
				entry.data = data;
			}
		} else {
			console.log(logMessage || '');
		}

		debugLog.push(entry);
		if (debugLog.length > 100) {
			debugLog.splice(0, 1);
		}
		this.homey.settings.set('debugLog', debugLog);
		this.homey.api.realtime('debugLog', entry);
	}
}

module.exports = Polestar;