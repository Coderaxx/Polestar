'use strict';

const { Driver } = require('homey');
const axios = require('axios');

class PolestarBetaDriver extends Driver {
    async onInit() {
        this.homey.app.log(this.homey.__({ en: 'Polestar Driver CSV ᴮᴱᵀᴬ has been initialized', no: 'Polestar Driver CSV ᴮᴱᵀᴬ har blitt initialisert' }), 'Polestar Driver CSV ᴮᴱᵀᴬ', 'DEBUG');

        this.webhookUrl = this.homey.settings.get('polestar_webhook') || null;
        this.vehicles = [];
    }

    async onPair(session) {
        this.homey.app.log(this.homey.__({ en: 'Started pairing for Polestar 2', no: 'Starter paring for Polestar 2' }), 'Polestar Driver CSV ᴮᴱᵀᴬ', 'DEBUG');
        session.setHandler('createWebhook', async (data) => {
            try {
                // Generer en secret for webhook og lagre den i settings
                const secret = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
                const webhook = await this.homey.cloud.createWebhook('polestar_webhook', secret, null);
                this.webhookUrl = this.homey.settings.get('polestar_webhook');
                this.homey.app.log(this.homey.__({ en: 'Webhook created', no: 'Webhook opprettet' }), 'Polestar Driver CSV ᴮᴱᵀᴬ', 'DEBUG');

                this.vehicles.push({
                    name: 'Polestar 2 ᴮᴱᵀᴬ',
                    data: {
                        webhook: this.webhookUrl,
                    },
                    settings: {
                        polestar_webhook: this.webhookUrl,
                        webhook_secret: secret,
                        refresh_interval: 60,
                    }
                });

                return webhook;
            } catch (error) {
                this.homey.app.log(this.homey.__({ en: 'Failed to create webhook', no: 'Klarte ikke å opprette webhook' }), 'Polestar Driver CSV ᴮᴱᵀᴬ', 'ERROR');
                return false;
            }
        });

        session.setHandler('getWebhook', async (data) => {
            return this.webhookUrl;
        });

        session.setHandler('list_devices', async () => {
            return await this.onPairListDevices(session);
        });
    }

    async onPairListDevices() {
        this.homey.app.log(this.homey.__({ en: 'Vehicles ready to be added:', no: 'Kjøretøy klare til å bli lagt til:' }), 'Polestar Driver CSV ᴮᴱᵀᴬ', 'DEBUG', this.vehicles);
        return this.vehicles;
    }

}

module.exports = PolestarBetaDriver;
