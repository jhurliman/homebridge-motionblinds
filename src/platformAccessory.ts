import { Logger } from 'homebridge';
import { DeviceManager, Device } from './deviceManager';
import services from './services';

export class PlatformAccessory {
  private readonly logger: Logger;
  private readonly deviceManager: DeviceManager;
  private readonly hap: any;
  private readonly accessory: any;
  private windowService: any;
  private batteryService: any | null = null;

  constructor(logger: Logger, hap: any, accessory: any, deviceManager: DeviceManager) {
    this.logger = logger;
    this.hap = hap;
    this.accessory = accessory;
    this.deviceManager = deviceManager;

    this.windowService = this.accessory.getService(this.hap.Service.WindowCovering)
      || this.accessory.addService(this.hap.Service.WindowCovering, 'MotionBlind');

    // Add battery service if device reports battery
    if (!this.accessory.getService(this.hap.Service.BatteryService)) {
      try {
        this.batteryService = this.accessory.addService(this.hap.Service.BatteryService, 'Battery');
      } catch (e) {
        this.logger.debug('Battery service not available or failed to add', e);
      }
    }

    // Hook up target position setter
    const Characteristic = this.hap.Characteristic;
    this.windowService.getCharacteristic(Characteristic.TargetPosition)
      .on('set', this.handleTargetPositionSet.bind(this));

    // Initialize from existing device state if possible
    const device = this.deviceManager.getDevice(this.accessory.context.deviceId || this.accessory.UUID);
    if (device) {
      this.applyDeviceState(device);
    }
  }

  handleDeviceUpdate(device: Device) {
    this.logger.debug?.('PlatformAccessory handling device update', device.id);
    this.applyDeviceState(device);
  }

  private applyDeviceState(device: Device) {
    // Map device.position (0-100) to HomeKit CurrentPosition
    const Characteristic = this.hap.Characteristic;

    if (typeof device.position === 'number') {
      const pos = Math.max(0, Math.min(100, Math.round(device.position)));
      this.windowService.updateCharacteristic(Characteristic.CurrentPosition, pos);
      this.windowService.updateCharacteristic(Characteristic.TargetPosition, pos);
      this.windowService.updateCharacteristic(Characteristic.PositionState, Characteristic.PositionState.STOPPED);
    }

    if (typeof device.battery === 'number' && this.batteryService) {
      const level = Math.max(0, Math.min(100, Math.round(device.battery)));
      this.batteryService.updateCharacteristic(Characteristic.BatteryLevel, level);
      this.batteryService.updateCharacteristic(Characteristic.ChargingState, Characteristic.ChargingState.NOT_CHARGING);
      this.batteryService.updateCharacteristic(Characteristic.StatusLowBattery, level <= 20 ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
    }
  }

  private handleTargetPositionSet(value: number, callback: (err?: Error | null) => void) {
    this.logger.info('TargetPosition set for', this.accessory.displayName, value);
    // Translate HomeKit set request into device command
    const deviceId = this.accessory.context.deviceId || this.accessory.UUID;
    // In a real implementation we would instruct DeviceManager to act on the device (gateway/ble)
    // Here we simply update internal state to reflect the requested value and emit update
    const existing = this.deviceManager.getDevice(deviceId) || { id: deviceId, name: this.accessory.displayName };
    const updated = { ...existing, position: value };
    // Notify manager of update so it can propagate to other accessories / persist
    this.deviceManager.emit('deviceUpdated', updated);

    callback(null);
  }
}

export default PlatformAccessory;
