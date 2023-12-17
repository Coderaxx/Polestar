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
        session.setHandler('createWebhook', async () => {
            try {
                // Generer en secret for webhook og lagre den i settings
                const id = '657d642cd640090bb9b88226';
                const secret = 'ccf90ffd93f0110158c7c79e37861245';
                const data = {
                    deviceId: 'Polestar2CSV',
                }
                const webhook = await this.homey.cloud.createWebhook(id, secret, data);
                const webhookUrl = `https://webhooks.athom.com/webhook/${webhook.id}/?homey=${this.homeyId}`;

                this.vehicles.push({
                    name: 'Polestar 2 ᴮᴱᵀᴬ',
                    data: {
                        id: 'Polestar2CSV',
                        webhook: JSON.stringify(webhook),
                    },
                    settings: {
                        polestar_webhook: webhookUrl,
                        webhook_id: webhook.id,
                        webhook_secret: secret,
                        refresh_interval: 60,
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
