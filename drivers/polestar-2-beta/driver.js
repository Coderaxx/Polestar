'use strict';

const { Driver } = require('homey');
const axios = require('axios');
const PolestarAPI = require('./PolestarAPI');

class PolestarBetaDriver extends Driver {
    async onInit() {
        this.homey.app.log(this.homey.__({ en: 'Polestar Driver ᴮᴱᵀᴬ has been initialized', no: 'Polestar Driver ᴮᴱᵀᴬ har blitt initialisert' }), 'Polestar Driver ᴮᴱᵀᴬ', 'DEBUG');

        //const polestarApi = new PolestarAPI('jesper.grimstad@hotmail.com', 'GrL99D$N$!dkmrpD', 'YSMVSEDE5PL128797', 'a0c41700ca56416b8c2ad7c9028c1291');
        this.token = this.homey.settings.get('polestar_token') || null;
        this.polestarAccount = {
            email: this.homey.settings.get('polestar_email') || null,
            password: this.homey.settings.get('polestar_password') || null,
        };
        this.vehicles = [];
    }

    async onPair(session) {
        this.homey.app.log(this.homey.__({ en: 'Started pairing for Polestar 2', no: 'Starter paring for Polestar 2' }), 'Polestar Driver ᴮᴱᵀᴬ', 'DEBUG');

        session.setHandler('getLoginDetails', async () => {
            if (this.polestarAccount.email && this.polestarAccount.password) {
                return { success: true, email: this.polestarAccount.email, password: this.polestarAccount.password };
            }
        });

        session.setHandler('login', async (data) => {
            const { email, password } = data;
            this.polestarAccount = { email, password };
            this.homey.settings.set('polestar_email', this.polestarAccount.email);
            this.homey.settings.set('polestar_password', this.polestarAccount.password);

            try {
                const polestarApi = new PolestarAPI(this.polestarAccount.email, this.polestarAccount.password, 'YSMVSEDE5PL128797', 'a0c41700ca56416b8c2ad7c9028c1291');
                const response = await polestarApi.getAccessToken();
                const { accessToken, refreshToken, tokenType } = response;

                return { success: true, accessToken, refreshToken, tokenType };
            } catch (error) {
                this.homey.app.log(this.homey.__({ en: 'Error logging in to Polestar', no: 'Feil ved innlogging til Polestar' }), 'Polestar Driver ᴮᴱᵀᴬ', 'ERROR', error);
                return error;
            }
        });

        session.setHandler('getVehicles', async () => {
            try {
                const vehicles = {
                    name: 'Polestar 2 ᴮᴱᵀᴬ',
                    data: {
                        id: 'YSMVSEDE5PL128797',
                    },
                    settings: {
                        polestar_email: this.polestarAccount.email,
                        polestar_password: this.polestarAccount.password,
                        refresh_interval: 60,
                    }
                };
                this.vehicles = vehicles;

                return { success: true, vehicles };
            } catch (error) {
                this.homey.app.log(this.homey.__({ en: 'Error fetching vehicle data from Polestar', no: 'Feil ved henting av kjøretøydata fra Polestar' }), 'Polestar Driver ᴮᴱᵀᴬ', 'ERROR', error.response?.status);
                return { success: false, error: error };
            }
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
