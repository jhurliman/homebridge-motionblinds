import EventEmitter from 'events';
import { GatewayClient } from './clients/gatewayClient';
import { BleClient } from './clients/bleClient';

export interface Device {
  id: string;
  name: string;
  battery?: number;
  position?: number; // 0-100
  reachable?: boolean;
}

export interface DeviceManagerOptions {
  logger?: Console | any;
}

export class DeviceManager extends EventEmitter {
  private gateway: GatewayClient;
  private ble: BleClient;
  private devices: Map<string, Device> = new Map();
  private logger: any;

  constructor(options: DeviceManagerOptions = {}) {
    super();
    this.logger = options.logger || console;
    this.gateway = new GatewayClient({ logger: this.logger });
    this.ble = new BleClient({ logger: this.logger });

    // Re-emit client device updates
    this.gateway.on('deviceUpdated', (d: Device) => this.handleDeviceUpdate(d));
    this.ble.on('deviceUpdated', (d: Device) => this.handleDeviceUpdate(d));
  }

  async start() {
    this.logger.debug?.('DeviceManager starting');
    await this.gateway.connect();
    await this.ble.startScan();

    const gwDevices = await this.gateway.getDevices();
    gwDevices.forEach((d) => this.addOrUpdateDevice(d));

    const bleDevices = await this.ble.getDevices();
    bleDevices.forEach((d) => this.addOrUpdateDevice(d));

    this.logger.debug?.('DeviceManager started with devices:', Array.from(this.devices.keys()));
  }

  async stop() {
    this.logger.debug?.('DeviceManager stopping');
    await this.ble.stopScan();
    await this.gateway.disconnect();
    this.logger.debug?.('DeviceManager stopped');
  }

  getAllDevices(): Device[] {
    return Array.from(this.devices.values());
  }

  getDevice(id: string): Device | undefined {
    return this.devices.get(id);
  }

  private handleDeviceUpdate(d: Device) {
    this.logger.debug?.('DeviceManager received device update', d.id);
    this.addOrUpdateDevice(d, true);
  }

  private addOrUpdateDevice(d: Device, emit = false) {
    const existing = this.devices.get(d.id);
    const merged = { ...(existing || {}), ...d } as Device;
    this.devices.set(d.id, merged);

    if (emit) {
      this.emit('deviceUpdated', merged);
    }
  }
}

export default DeviceManager;
