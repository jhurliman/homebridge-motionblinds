import { API, Logger, PlatformAccessory as HAPPlatformAccessory } from 'homebridge';
import DeviceManager from './deviceManager';
import { PlatformAccessory } from './platformAccessory';

export interface MotionBlindsConfig {
  name?: string;
}

export class MotionBlindsPlatform {
  public readonly hap: any;
  private readonly accessories = new Map<string, PlatformAccessory>();
  private readonly deviceManager: DeviceManager;
  private readonly logger: Logger;

  constructor(logger: Logger, config: MotionBlindsConfig, api: API) {
    this.logger = logger;
    this.hap = api.hap;

    this.logger.debug('MotionBlindsPlatform initializing');

    this.deviceManager = new DeviceManager({ logger: this.logger });

    // Listen for device updates from the manager and forward to accessories
    this.deviceManager.on('deviceUpdated', (device) => {
      const acc = this.accessories.get(device.id);
      if (acc) {
        acc.handleDeviceUpdate(device);
      } else {
        this.logger.debug('No accessory for device', device.id);
      }
    });

    // Start manager when Homebridge is ready
    api.on('didFinishLaunching', async () => {
      try {
        await this.deviceManager.start();
        this.logger.debug('DeviceManager started by platform');

        // Create accessories for all discovered devices
        const devices = this.deviceManager.getAllDevices();
        devices.forEach((d) => this.createAccessoryForDevice(d));
      } catch (e) {
        this.logger.error('Failed to start DeviceManager', e);
      }
    });
  }

  configureAccessory(accessory: HAPPlatformAccessory) {
    // Restore cached accessory
    const acc = new PlatformAccessory(this.logger, this.hap, accessory, this.deviceManager);
    this.accessories.set(accessory.context.deviceId || accessory.UUID, acc);
    this.logger.debug('Configured cached accessory', accessory.displayName);
  }

  private createAccessoryForDevice(device: any) {
    if (this.accessories.has(device.id)) return;

    const Acc = this.hap.platformAccessory;
    const accessory = new Acc(device.name || `MotionBlinds ${device.id}`, device.id);
    accessory.context.deviceId = device.id;

    const acc = new PlatformAccessory(this.logger, this.hap, accessory, this.deviceManager);
    this.accessories.set(device.id, acc);

    // Normally we'd registerAccessory with the api, but platform accessory usually handles that externally
    this.logger.info('Created accessory for device', device.id);
  }
}

export = MotionBlindsPlatform;
