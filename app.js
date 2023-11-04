'use strict';

const Homey = require('homey');

class Polestar extends Homey.App {
  async onInit() {
    this.log('Polestar has been initialized');
  }

}

module.exports = Polestar;
