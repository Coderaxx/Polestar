'use strict';

const { Driver } = require('homey');
const axios = require('axios');
const Polestar = require('@andysmithfal/polestar.js');

class PolestarBetaDriver extends Driver {
    async onInit() {
        this.homey.app.log(this.homey.__({ en: 'Polestar Driver ᴮᴱᵀᴬ has been initialized', no: 'Polestar Driver ᴮᴱᵀᴬ har blitt initialisert' }), 'Polestar Driver ᴮᴱᵀᴬ', 'DEBUG');

        const polestar = new Polestar('jesper.grimstad@hotmail.com', 'BurlroaD50!');
        this.vehicles = [];
    }

    async onPair(session) {
        this.homey.app.log(this.homey.__({ en: 'Started pairing for Polestar 2', no: 'Starter paring for Polestar 2' }), 'Polestar Driver ᴮᴱᵀᴬ', 'DEBUG');

        session.setHandler('showView', async (viewId) => {
            if (viewId === 'login') {
                console.log('Login page of pairing is showing, send credentials');
                //Send the stored credentials to the 
                var username = this.homey.settings.get('user_email');
                var cryptedpassword = this.homey.settings.get('user_password');
                try {
                    plainpass = await HomeyCrypt.decrypt(cryptedpassword, username);
                    session.emit('loadaccount', { 'username': username, 'password': plainpass });
                } catch (err) {
                    session.emit('loadaccount', { 'username': username, 'password': '' })
                }
            };
        });

        session.setHandler('list_devices', async () => {
            return await this.onPairListDevices(session);
        });
    }

    async onPairListDevices() {
        this.homey.app.log(this.homey.__({ en: 'Vehicles ready to be added:', no: 'Kjøretøy klare til å bli lagt til:' }), 'Polestar Driver ᴮᴱᵀᴬ', 'DEBUG', this.vehicles);
        return this.vehicles;
    }

}

module.exports = PolestarBetaDriver;
