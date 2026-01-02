import type {
  API,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
} from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { MotionAccessory } from './platformAccessory.js';

/**
 * DeviceManager-like platform that discovers devices and keeps a central cache.
 * This is the Homebridge equivalent of Home Assistant's coordinator pattern.
 */
export class MotionBlindsPlatform implements DynamicPlatformPlugin {
  public readonly Service: any;
  public readonly Characteristic: any;

  // cache of restored accessories
  public readonly accessories = new Map<string, PlatformAccessory>();

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.log.debug('Finished initializing platform:', this.config?.name);

    this.api.on('didFinishLaunching', () => {
      this.log.debug('didFinishLaunching: discovering devices');
      void this.discoverDevices();
    });
  }

  // Discover devices and register accessories. Replace discovery logic with MotionBlinds client integration.
  async discoverDevices(): Promise<void> {
    // TODO: tie into actual discovery (gateway API, multicast, BLE, etc.)
    const devices: Array<{ id: string; name: string }> = [];

    for (const device of devices) {
      const uuid = this.api.hap.uuid.generate(`${PLUGIN_NAME}:${device.id}`);

      const existing = this.accessories.get(uuid);
      if (existing) {
        this.log.info('Restoring existing accessory from cache:', existing.displayName);
        new MotionAccessory(this, existing);
      } else {
        this.log.info('Adding new accessory:', device.name);
        const accessory = new this.api.platformAccessory(device.name, uuid);
        accessory.context.device = device;
        new MotionAccessory(this, accessory);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.accessories.set(accessory.UUID, accessory);
      }
    }

    // Optionally remove cached accessories not present in devices[].
  }

  // Called when Homebridge restores cached accessories from disk
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Configuring restored accessory from cache:', accessory.displayName);
    this.accessories.set(accessory.UUID, accessory);
    new MotionAccessory(this, accessory);
  }
}
