'use strict';

const { Device } = require('homey');

class Polestar extends Device {
  async onInit() {
    this.log('Polestar has been initialized');
  }

  async onAdded() {
    this.log('Polestar has been added');
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('Polestar settings where changed');
  }

  async onRenamed(name) {
    this.log('Polestar was renamed');
  }

  async onDeleted() {
    this.log('Polestar has been deleted');
  }

}

module.exports = Polestar;
