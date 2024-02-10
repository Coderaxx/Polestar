'use strict';

const { Device } = require('homey');
const Polestar = require('@andysmithfal/polestar.js');
const HomeyCrypt = require('../../lib/homeycrypt')

var polestar = null;

class PolestarVehicle extends Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.homey.app.log(this.homey.__({
      en: `${this.name} has been initialized`,
      no: `${this.name} har blitt initialisert`,
      nl: `${this.name} is geinitialiseerd`,
  }), this.name, 'DEBUG');
    await this.fixCapabilities();
    this.update_loop_timers();
  }

  update_loop_timers() {
    this.updateVehicleState();
    let interval = 60000;
    this._timerTimers = setInterval(() => {
        this.updateVehicleState();
    }, interval);
  }

  async fixCapabilities()
  {
    if(!this.hasCapability('measure_battery'))
      await this.addCapability('measure_battery');
    if (!this.hasCapability('measure_polestarBattery'))
      await this.addCapability('measure_polestarBattery');
    //measure_polestarBatteryLevel
    // if(!this.hasCapability('measure_current'))
    //   await this.addCapability('measure_current');
    // if(!this.hasCapability('measure_power'))
    //   await this.addCapability('measure_power');
    if(!this.hasCapability('measure_vehicleChargeTimeRemaining'))
      await this.addCapability('measure_vehicleChargeTimeRemaining');
    if(!this.hasCapability('measure_vehicleOdometer'))
      await this.addCapability('measure_vehicleOdometer');
    if(!this.hasCapability('measure_vehicleRange'))
      await this.addCapability('measure_vehicleRange');
    if(!this.hasCapability('measure_vehicleChargeState'))
      await this.addCapability('measure_vehicleChargeState'); 
    if(!this.hasCapability('measure_vehicleConnected'))
      await this.addCapability('measure_vehicleConnected');
    //Deprecated capabilities

      if(this.hasCapability('measure_polestarConnected'))
      await this.removeCapability('measure_polestarConnected');
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('PolestarVehicle has been added');
  }

  async updateVehicleState()
  {
    console.log('Rerieve device details');
    if(this.polestar==null)
    {
      let PolestarUser = this.homey.settings.get('user_email');
      try {
        let PolestarPwd = await HomeyCrypt.decrypt(this.homey.settings.get('user_password'),PolestarUser);
        this.polestar = new Polestar(PolestarUser,PolestarPwd);
      } catch (err) {
        console.info('could not decrypt using salt, network connection changed?');
        return;   
      }
      await this.polestar.login();
      await this.polestar.setVehicle(this.getData().vin);
    }
    try{
      var odometer = await this.polestar.getOdometer();
      console.log(JSON.stringify(odometer));
      var odo = odometer.odometerMeters;
      try
      {
        odo = odo/1000; //Convert to KM instead of M
      }
      catch{
        odo = null;
      }
      console.log('KM:'+odo);
      this.setCapabilityValue('measure_vehicleOdometer', odo);
    } catch {
      console.debug('Failed to retrieve odometer');
    };
    try{
      var batteryInfo = await this.polestar.getBattery();
      console.log(JSON.stringify(batteryInfo));

      this.setCapabilityValue('measure_battery', batteryInfo.batteryChargeLevelPercentage);
      if (this.hasCapability('measure_polestarBattery'))
      this.setCapabilityValue('measure_polestarBattery', batteryInfo.batteryChargeLevelPercentage);
      // this.setCapabilityValue('measure_current', batteryInfo.chargingCurrentAmps);
      // this.setCapabilityValue('measure_power', batteryInfo.chargingPowerWatts);

      
      this.setCapabilityValue('measure_vehicleRange', batteryInfo.estimatedDistanceToEmptyKm);
      if(batteryInfo.chargingStatus=='CHARGING_STATUS_CHARGING')
      {
        this.setCapabilityValue('measure_vehicleChargeState', true);
        this.setCapabilityValue('measure_vehicleChargeTimeRemaining', batteryInfo.estimatedChargingTimeToFullMinutes);
      } else {
        this.setCapabilityValue('measure_vehicleChargeState', false);
        this.setCapabilityValue('measure_vehicleChargeTimeRemaining', null);
      }
      if(batteryInfo.chargerConnectionStatus=='CHARGER_CONNECTION_STATUS_CONNECTED')
        this.setCapabilityValue('measure_vehicleConnected', true);
      else
        this.setCapabilityValue('measure_vehicleConnected', false);
    } catch {
      console.debug('Failed to retrieve batterystate');
    }
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('PolestarVehicle settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('PolestarVehicle was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('PolestarVehicle has been deleted');
  }

}

module.exports = PolestarVehicle;
