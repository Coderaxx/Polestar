'use strict';

const { Driver } = require('homey');
const Polestar = require('@andysmithfal/polestar.js');
const HomeyCrypt = require('../../lib/homeycrypt');

class PS2Driver extends Driver {
    async onInit() {
        this.homey.app.log(this.homey.__({
            en: 'Polestar Driver ᴮᴱᵀᴬ has been initialized',
            no: 'Polestar Driver ᴮᴱᵀᴬ har blitt initialisert'
        }), 'Polestar Driver ᴮᴱᵀᴬ', 'DEBUG');
    }

    async onRepair(session, device) {
        session.setHandler("showView", async (data) => {
            this.homey.app.log(this.homey.__({
                en: 'Login page of repair is showing, send credentials',
                no: 'Viser innloggingssiden for reparasjon, send innloggingsinformasjon'
            }), 'Polestar Driver ᴮᴱᵀᴬ', 'DEBUG');

            //Send the stored credentials to the 
            var username = this.homey.settings.get('user_email');
            var cryptedpassword = this.homey.settings.get('user_password');
            try {
                plainpass = await HomeyCrypt.decrypt(cryptedpassword, username);
                session.emit('loadaccount', { 'username': username, 'password': plainpass });
            } catch (err) {
                session.emit('loadaccount', { 'username': username, 'password': '' });
            }
        });

        session.setHandler('testlogin', async (data) => {
            this.homey.app.log(this.homey.__({
                en: 'Test login and provide feedback, username length: ' + data.username.length + ' password length: ' + data.password.length,
                no: 'Test login og gi tilbakemelding, brukernavn lengde: ' + data.username.length + ' passord lengde: ' + data.password.length
            }), 'Polestar Driver ᴮᴱᵀᴬ', 'DEBUG');

            //Store the provided credentials, but hash and salt it first
            this.homey.settings.set('user_email', data.username);
            HomeyCrypt.crypt(data.password, data.username).then(cryptedpass => {
                //console.log(JSON.stringify(cryptedpass));
                this.homey.settings.set('user_password', cryptedpass);
            });

            this.homey.app.log(this.homey.__({
                en: 'Password encrypted, credentials stored. Clear existing tokens.',
                no: 'Passord kryptert, innloggingsinformasjon lagret. Fjerner eksisterende tokens.'
            }), 'Polestar Driver ᴮᴱᵀᴬ', 'DEBUG');

            //Now we have the encrypted password stored we can start testing the info
            try {
                var polestar = new Polestar(data.username, data.password);
                await polestar.login();
                var testresult = await polestar.getVehicles();
                this.homey.app.log(this.homey.__({
                    en: 'Credentials are valid, test ok.',
                    no: 'Innloggingsinformasjonen er gyldig, test ok.'
                }), 'Polestar Driver ᴮᴱᵀᴬ', 'DEBUG', testresult);
                return true;
            } catch (err) {
                this.homey.app.log(this.homey.__({
                    en: 'Credentials are invalid, test failed.',
                    no: 'Innloggingsinformasjonen er ugyldig, test feilet.'
                }), 'Polestar Driver ᴮᴱᵀᴬ', 'DEBUG', err);
                return false;
            }
        });
    }

    async onPair(session) {
        this.homey.app.log(this.homey.__({
            en: 'Started pairing for Polestar 2',
            no: 'Starter paring for Polestar 2'
        }), 'Polestar Driver ᴮᴱᵀᴬ', 'DEBUG');

        let mydevices;

        session.setHandler('showView', async (viewId) => {
            //These actions send data to the custom views
            if (viewId === 'login') {
                this.homey.app.log(this.homey.__({
                    en: 'Login page of pairing is showing, send credentials',
                    no: 'Viser innloggingssiden for paring, send innloggingsinformasjon'
                }), 'Polestar Driver ᴮᴱᵀᴬ', 'DEBUG');

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

        session.setHandler('list_devices', async (data) => {
            return mydevices;
        });

        session.setHandler('add_devices', async (data) => {
            session.showView('add_devices');
            if (data.length > 0) {
                this.homey.app.log(this.homey.__({
                    en: 'Vehicle [' + data[0].name + '] added',
                    no: 'Bil [' + data[0].name + '] lagt til'
                }), 'Polestar Driver ᴮᴱᵀᴬ', 'DEBUG');
            } else {
                this.homey.app.log(this.homey.__({
                    en: 'No vehicle added',
                    no: 'Ingen bil lagt til'
                }), 'Polestar Driver ᴮᴱᵀᴬ', 'WARNING');
            }
        });

        session.setHandler('discover_vehicles', async (data) => {
            this.homey.app.log(this.homey.__({
                en: 'Polestar vehicles discovery started...',
                no: 'Polestar vehicles discovery startet...'
            }), 'Polestar Driver ᴮᴱᵀᴬ', 'DEBUG');

            session.showView('discover_vehicles');
            let PolestarUser = this.homey.settings.get('user_email');
            let PolestarPwd = await HomeyCrypt.decrypt(this.homey.settings.get('user_password'), PolestarUser);
            var polestar = new Polestar(PolestarUser, PolestarPwd);
            await polestar.login();
            var vehiclelist = await polestar.getVehicles();
            var vehicles = vehiclelist.map((bev) => {
                try {
                    this.homey.app.log(this.homey.__({
                        en: 'Located vehicle info, lets convert it into a Polestar bev',
                        no: 'Funnet bilinfo, konverterer til en Polestar bil'
                    }), 'Polestar Driver ᴮᴱᵀᴬ', 'DEBUG');

                    let device = {
                        id: bev.vin,
                        name: bev.content.model.name + ' (' + bev.registrationNo + ')',
                        data: {
                            vin: bev.vin,
                            registration: bev.registrationNo,
                            internalVehicleIdentifier: bev.internalVehicleIdentifier,
                            modelName: bev.content.model.name,
                            modelYear: bev.modelYear,
                            carImage: bev.content.images.studio.url,
                            deliveryDate: bev.deliveryDate,
                            hasPerformancePackage: bev.hasPerformancePackage
                        }
                    }
                    return device;
                } catch (err) {
                    this.homey.app.log(this.homey.__({
                        en: 'Failed to locate vehicle info, error: ' + err,
                        no: 'Feilet å finne bilinfo, feil: ' + err
                    }), 'Polestar Driver ᴮᴱᵀᴬ', 'ERROR');
                    return err;
                }
            })
            //console.log(JSON.stringify(vehicles));
            mydevices = vehicles;
            session.showView('list_devices');
        });

        session.setHandler('testlogin', async (data) => {
            this.homey.app.log(this.homey.__({
                en: 'Test login and provide feedback, username length: ' + data.username.length + ' password length: ' + data.password.length,
                no: 'Test login og gi tilbakemelding, brukernavn lengde: ' + data.username.length + ' passord lengde: ' + data.password.length
            }), 'Polestar Driver ᴮᴱᵀᴬ', 'DEBUG');

            //Store the provided credentials, but hash and salt it first
            this.homey.settings.set('user_email', data.username);
            HomeyCrypt.crypt(data.password, data.username).then(cryptedpass => {
                //console.log(JSON.stringify(cryptedpass));
                this.homey.settings.set('user_password', cryptedpass);
            })

            this.homey.app.log(this.homey.__({
                en: 'Password encrypted, credentials stored. Clear existing tokens.',
                no: 'Passord kryptert, innloggingsinformasjon lagret. Fjerner eksisterende tokens.'
            }), 'Polestar Driver ᴮᴱᵀᴬ', 'DEBUG');

            //Now we have the encrypted password stored we can start testing the info
            try {
                var polestar = new Polestar(data.username, data.password);
                await polestar.login();
                var vehicles = await polestar.getVehicles();
                this.homey.app.log(this.homey.__({
                    en: 'Credentials are valid, test ok.',
                    no: 'Innloggingsinformasjonen er gyldig, test ok.'
                }), 'Polestar Driver ᴮᴱᵀᴬ', 'DEBUG', vehicles);
                return true;
            } catch {
                return false;
            }
        });
    }

    async onPairListDevices() {
        this.homey.app.log(this.homey.__({
            en: 'Vehicles ready to be added:',
            no: 'Kjøretøy klare til å bli lagt til:'
        }), 'Polestar Driver ᴮᴱᵀᴬ', 'DEBUG', this.vehicles);
        return this.vehicles;
    }

}

module.exports = PS2Driver;
