const axios = require('axios');

class PolestarApi {
    constructor(username, password, vin, vccApiKey) {
        this.id = vin.substring(0, 8);
        this.name = `Polestar ${vin.slice(-4)}`;
        this.username = username;
        this.password = password;
        this.vin = vin;
        this.vccApiKey = vccApiKey;
        this.accessToken = null;
        this.tokenType = null;
        this.refreshToken = null;
        this.cacheData = {};
        this.rawData = null;
    }

    async init() {
        await this.getAccessToken();
    }

    async update() {
        try {
            const data = await this.getData('{vin}/recharge-status');
            if (data) {
                this.rawData = data;
                return data;
            }
        } catch (error) {
            console.error('Error updating Polestar data:', error);
        }
    }

    async getAccessToken() {
        try {
            const response = await axios.post('https://volvoid.eu.volvocars.com/as/token.oauth2', {
                username: this.username,
                password: this.password,
                grant_type: 'password', // Replace with actual grant type
                access_token_manager_id: 'JWTh4Yf0b', // Replace with actual ID
                scope: 'openid email profile care_by_volvo:financial_information:invoice:read care_by_volvo:financial_information:payment_method care_by_volvo:subscription:read customer:attributes customer:attributes:write order:attributes vehicle:attributes tsp_customer_api:all conve:brake_status conve:climatization_start_stop conve:command_accessibility conve:commands conve:diagnostics_engine_status conve:diagnostics_workshop conve:doors_status conve:engine_status conve:environment conve:fuel_status conve:honk_flash conve:lock conve:lock_status conve:navigation conve:odometer_status conve:trip_statistics conve:tyre_status conve:unlock conve:vehicle_relation conve:warnings conve:windows_status energy:battery_charge_level energy:charging_connection_status energy:charging_system_status energy:electric_range energy:estimated_charging_time energy:recharge_status' // Replace with actual scope
            }, {
                headers: {
                    'Authorization': 'Basic aDRZZjBiOlU4WWtTYlZsNnh3c2c1WVFxWmZyZ1ZtSWFEcGhPc3kxUENhVXNpY1F0bzNUUjVrd2FKc2U0QVpkZ2ZJZmNMeXc=',
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            if (response.status === 200) {
                this.accessToken = response.data.access_token;
                this.refreshToken = response.data.refresh_token;
                this.tokenType = response.data.token_type;

                return { success: true, token: this.accessToken };
            }
        } catch (error) {
            console.error('Error fetching access token:', error);
        }
    }

    getCacheData(path, responsePath = null) {
        path = path.replace('{vin}', this.vin);

        if (this.cacheData[path]) {
            const cached = this.cacheData[path];
            if (new Date() - cached.timestamp < 15000) { // 15 seconds cache
                let data = cached.data;
                if (data && responsePath) {
                    responsePath.split('.').forEach(key => {
                        data = data[key];
                    });
                }
                return data;
            }
        }
        return null;
    }

    async getData(path, responsePath = null) {
        path = path.replace('{vin}', this.vin);
        const cacheData = this.getCacheData(path, responsePath);

        if (cacheData !== null) {
            console.log('Using cached data');
            return cacheData;
        }

        this.cacheData[path] = { data: null, timestamp: new Date() };

        const url = `https://api.volvocars.com/energy/v1/vehicles/${path}`;
        try {
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `${this.tokenType} ${this.accessToken}`,
                    'VCC-Api-Key': this.vccApiKey
                }
            });

            if (response.status === 200) {
                const data = response.data.data;
                this.cacheData[path] = { data: data, timestamp: new Date() };

                if (responsePath) {
                    responsePath.split('.').forEach(key => {
                        data = data[key];
                    });
                }

                return data;
            } else if (response.status === 401) {
                await this.getAccessToken();
            }
        } catch (error) {
            console.error('Error fetching data:', error);
        }
    }
}

module.exports = PolestarApi;
