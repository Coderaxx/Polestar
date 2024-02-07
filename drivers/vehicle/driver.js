'use strict';

const { Driver } = require('homey');
const Polestar = require('@andysmithfal/polestar.js');
const HomeyCrypt = require('../../lib/homeycrypt')

class BevVehicle extends Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('BevVehicle has been initialized');
  }


  async onRepair(session, device) {
    // Argument session is a PairSocket, similar to Driver.onPair
    // Argument device is a Homey.Device that's being repaired

    session.setHandler("showView", async (data) => {
        console.log('Login page of repair is showing, send credentials');
        //Send the stored credentials to the 
        var username = this.homey.settings.get('user_email');
        var cryptedpassword = this.homey.settings.get('user_password');
        try {
            plainpass = await HomeyCrypt.decrypt(cryptedpassword,username);
            session.emit('loadaccount', {'username': username,'password': plainpass});
        } catch (err) {
            session.emit('loadaccount', {'username': username,'password': ''})
        }
    });

    session.setHandler('testlogin', async ( data ) => {
      console.log('Test login and provide feedback, username length: '+data.username.length+' password length: '+data.password.length);
      //Store the provided credentials, but hash and salt it first
      this.homey.settings.set('user_email',data.username);
      HomeyCrypt.crypt(data.password,data.username).then(cryptedpass => {
          //console.log(JSON.stringify(cryptedpass));
          this.homey.settings.set('user_password',cryptedpass);
      }) 
      console.log('password encrypted, credentials stored. Clear existing tokens.');               
      //Now we have the encrypted password stored we can start testing the info
      try{
        var polestar = new Polestar(data.username,data.password);
        await polestar.login();
        var testresult=await polestar.getVehicles();
        console.log('credential test ok: '+JSON.stringify(testresult));
        return true;
      } catch (err) {
        console.log('Credential test failed: '+err);
        return false;
      }
    });
  }

  async onPair(session) {
    let mydevices;

    session.setHandler('showView', async (viewId)=>{
      //These actions send data to the custom views
      
      if(viewId === 'login') {
          console.log('Login page of pairing is showing, send credentials');
          //Send the stored credentials to the 
          var username = this.homey.settings.get('user_email');
          var cryptedpassword = this.homey.settings.get('user_password');
          try {
              plainpass = await HomeyCrypt.decrypt(cryptedpassword,username);
              session.emit('loadaccount', {'username': username,'password': plainpass});
          } catch (err) {
              session.emit('loadaccount', {'username': username,'password': ''})
          }
      };
    });

    session.setHandler('list_devices', async (data) => {
      console.log('Provide user list of vehicles to choose from.');
      return mydevices;
    });

    session.setHandler('add_devices', async (data) => {
      session.showView('add_devices');
      if(data.length>0)
          console.log('vehicle ['+data[0].name+'] added');
      else
          console.log('no vehicle added');
    });

    session.setHandler('discover_vehicles', async ( data ) => {
      this.log('Polestar vehicles discovery started...');
      session.showView('discover_vehicles');
      let PolestarUser = this.homey.settings.get('user_email');
      let PolestarPwd = await HomeyCrypt.decrypt(this.homey.settings.get('user_password'),PolestarUser);
      var polestar = new Polestar(PolestarUser,PolestarPwd);
      await polestar.login();
      var vehiclelist = await polestar.getVehicles();
      var vehicles = vehiclelist.map((bev) => {
        try{
            console.log('Located vehicle info, lets convert it into a Polestar bev');
            let device = {
                id: bev.vin,
                name: bev.content.model.name+' ('+bev.registrationNo+')',
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
        }catch(err){
            console.log(err);
            return err;
        }
      })
      console.log(JSON.stringify(vehicles));
      mydevices= vehicles;
      session.showView('list_devices');
    });

    session.setHandler('testlogin', async ( data ) => {
      console.log('Test login and provide feedback, username length: '+data.username.length+' password length: '+data.password.length);
      //Store the provided credentials, but hash and salt it first
      this.homey.settings.set('user_email',data.username);
      HomeyCrypt.crypt(data.password,data.username).then(cryptedpass => {
          //console.log(JSON.stringify(cryptedpass));
          this.homey.settings.set('user_password',cryptedpass);
      }) 
      console.log('password encrypted, credentials stored. Clear existing tokens.');               
      //Now we have the encrypted password stored we can start testing the info
      try{
        var polestar = new Polestar(data.username,data.password);
        await polestar.login();
        var vehicles=await polestar.getVehicles();
        console.log('credential test ok: '+JSON.stringify(vehicles));
        return true;
      } catch {
        return false;
      }
    });
  }

}

module.exports = BevVehicle;
