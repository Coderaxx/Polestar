'use strict';

const { Driver } = require('homey');
const axios = require('axios');

class PolestarBetaDriver extends Driver {
    async onInit() {
        this.homey.app.log(this.homey.__({ en: 'Polestar Driver CSV ᴮᴱᵀᴬ has been initialized', no: 'Polestar Driver CSV ᴮᴱᵀᴬ har blitt initialisert' }), 'Polestar Driver CSV ᴮᴱᵀᴬ', 'DEBUG');

        this.homeyId = await this.homey.cloud.getHomeyId();
        this.vehicles = [];
    }

    async onPair(session) {
        this.vehicles = [];

        this.homey.app.log(this.homey.__({ en: 'Started pairing for Polestar 2', no: 'Starter paring for Polestar 2' }), 'Polestar Driver CSV ᴮᴱᵀᴬ', 'DEBUG');
        session.setHandler('createWebhook', async (args) => {
            try {
                // Generer en secret for webhook og lagre den i settings
                const id = args.id;
                const secret = args.secret;
                const data = {
                    deviceId: 'Polestar2CSV',
                }
                const webhook = await this.homey.cloud.createWebhook(id, secret, data);
                const webhookUrl = `https://webhooks.athom.com/webhook/${webhook.id}/?homey=${this.homeyId}`;

                const pingWebhook = await axios.get(webhookUrl);
                if (pingWebhook.status === 200 && pingWebhook.data === 'ok') {
                    this.homey.app.log(this.homey.__({ en: 'Successfully pinged webhook', no: 'Klarte å pinge webhook' }), 'Polestar Driver CSV ᴮᴱᵀᴬ', 'DEBUG');
                } else {
                    this.homey.app.log(this.homey.__({ en: 'Failed to ping webhook', no: 'Klarte ikke å ping webhook' }), 'Polestar Driver CSV ᴮᴱᵀᴬ', 'ERROR');
                    return { success: false, error: 'Failed to ping webhook' };
                }

                this.vehicles.push({
                    name: 'Polestar 2 ᴮᴱᵀᴬ',
                    data: {
                        id: 'Polestar2CSV',
                        webhook: JSON.stringify(webhook),
                    },
                    settings: {
                        polestar_webhook: webhookUrl,
                        webhook_id: id,
                        webhook_secret: secret,
                    }
                });

                this.webhookUrl = webhookUrl;

                this.homey.app.log(this.homey.__({ en: 'Webhook created', no: 'Webhook opprettet' }), 'Polestar Driver CSV ᴮᴱᵀᴬ', 'DEBUG');
                return { success: true };
            } catch (error) {
                this.homey.app.log(this.homey.__({ en: 'Failed to create webhook', no: 'Klarte ikke å opprette webhook' }), 'Polestar Driver CSV ᴮᴱᵀᴬ', 'ERROR');
                this.log(error);
                return { success: false, error: error.message };
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
