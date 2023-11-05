'use strict';

const Homey = require('homey');
const moment = require('moment');

class Polestar extends Homey.App {
  async onInit() {
    this.homey.i18n.getLanguage() === 'no' ? moment.locale('nb') : moment.locale('en');
    this.userLanguage = this.homey.i18n.getLanguage();

    this.log(this.homey.__({ en: 'Polestar has been initialized', no: 'Polestar har blitt initialisert' }));
  }

  async log(message, instance = 'App', data = null, severity = 'info') {
    const now = new Date();
    let datestring = now.toLocaleDateString(this.userLanguage, {
      dateStyle: 'short'
    });
    let timestring = now.toLocaleTimeString(this.userLanguage, {
      timeStyle: 'medium'
    });
    datestring = `${datestring} - ${timestring}`;
    const logMessage = `${datestring} [${instance}] [${severity.toUpperCase()}] ${message}`;

    const debugLog = this.homey.settings.get('debugLog') || [];
    const entry = { registered: datestring, severity, message };
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